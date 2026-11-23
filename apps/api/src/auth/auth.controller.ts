import { Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ForgotPasswordSchema, LoginSchema, RegisterSchema, ResetPasswordSchema, VerifyEmailSchema } from '@smartwallet/shared';
import { RateLimit } from '../common/rate-limit.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody } from '../common/swagger';
import { AuthService, GoogleProfile, REFRESH_TTL_MS } from './auth.service';
import { GoogleAuthGuard } from './google';

const TokenOut = z.object({ accessToken: z.string(), expiresIn: z.number().int() });
const RegisteredOut = z.object({ id: z.string().uuid(), email: z.string(), fullName: z.string() });

export const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';
const cookieOpts = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE !== 'false', // only ever false for local http dev
  sameSite: 'strict' as const,
  path: COOKIE_PATH,
  maxAge: REFRESH_TTL_MS,
});

@ApiTags('auth')
@RateLimit(10, 'auth') // 10 req/min per IP on every auth route
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'AUTH-01: register; a verification link (24 h) is emailed' })
  @ApiData(RegisteredOut, { status: 201 })
  @ApiErrors(400, 409, 429)
  register(@ZBody(RegisterSchema) dto: any) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'AUTH-01: confirm the emailed token' })
  @ApiNoContent()
  @ApiErrors(400, 429)
  @HttpCode(204)
  async verifyEmail(@ZBody(VerifyEmailSchema) dto: { token: string }) {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('login')
  @ApiOperation({ summary: 'AUTH-02/05: returns a 15 min access token; sets the httpOnly refresh cookie. 5 failures lock for 15 min' })
  @ApiData(TokenOut)
  @ApiErrors(400, 401, 403, 429)
  @HttpCode(200)
  async login(@ZBody(LoginSchema) dto: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.login(dto, req.headers['user-agent']);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts());
    return { accessToken, expiresIn: 900 };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'AUTH-02: rotate the refresh cookie and get a new access token' })
  @ApiData(TokenOut)
  @ApiErrors(401, 429)
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.headers['user-agent']);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts());
    return { accessToken, expiresIn: 900 };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh token and clear the cookie' })
  @ApiNoContent()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'AUTH-04: always 204 (no account enumeration); emails a 30 min link if the account exists' })
  @ApiNoContent()
  @ApiErrors(400, 429)
  @HttpCode(204)
  async forgotPassword(@ZBody(ForgotPasswordSchema) dto: { email: string }) {
    await this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'AUTH-04: set a new password with the emailed token (single use; revokes all sessions)' })
  @ApiNoContent()
  @ApiErrors(400, 429)
  @HttpCode(204)
  async resetPassword(@ZBody(ResetPasswordSchema) dto: { token: string; password: string }) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('google')
  @ApiOperation({ summary: 'AUTH-03: redirect to Google (501 if not configured)' })
  @ApiResponse({ status: 302, description: 'Redirect to the Google consent screen' })
  @ApiErrors(501)
  @UseGuards(GoogleAuthGuard)
  google() {
    /* redirects to Google */
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'AUTH-03: Google redirects here; sets the refresh cookie and redirects to the SPA' })
  @ApiResponse({ status: 302, description: 'Redirect to the SPA (/auth/callback) with the refresh cookie set' })
  @ApiErrors(401, 403, 501)
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const { refreshToken } = await this.auth.googleLogin(req.user as GoogleProfile, req.headers['user-agent']);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts());
    // SPA then calls POST /auth/refresh to obtain its in-memory access token (no token in the URL)
    res.redirect(`${process.env.APP_URL ?? 'http://localhost:5173'}/auth/callback`);
  }
}
