import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthGuard, GoogleStrategy } from './google';

@Module({ controllers: [AuthController], providers: [AuthService, GoogleStrategy, GoogleAuthGuard], exports: [AuthService] })
export class AuthModule {}
