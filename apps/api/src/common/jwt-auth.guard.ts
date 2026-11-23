import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

export interface AuthUser {
  id: string;
  role: 'USER' | 'ADMIN';
}

/** Bearer-JWT auth via Passport. req.user is the ONLY source of user_id. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
