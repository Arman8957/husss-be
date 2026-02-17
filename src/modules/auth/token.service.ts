import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface TokenVerificationResult {
  userId: string | null;
  valid: boolean;
  error?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  generateVerificationToken(userId: string): string {
    const secret = this.configService.get<string>('jwt.secret');
    
    if (!secret) {
      this.logger.error('JWT_SECRET is not configured in environment variables');
      throw new Error(
        'JWT secret is not configured. Please add JWT_SECRET to your .env file. ' +
        'Example: JWT_SECRET=your-super-secret-key-change-in-production'
      );
    }

    return this.jwtService.sign(
      { sub: userId, type: 'verification' },
      {
        secret,
        expiresIn: '24h',
      },
    );
  }

  generatePasswordResetToken(userId: string): string {
    const secret = this.configService.get<string>('jwt.secret');
    
    if (!secret) {
      this.logger.error('JWT_SECRET is not configured in environment variables');
      throw new Error(
        'JWT secret is not configured. Please add JWT_SECRET to your .env file. ' +
        'Example: JWT_SECRET=your-super-secret-key-change-in-production'
      );
    }

    return this.jwtService.sign(
      { sub: userId, type: 'password_reset' },
      {
        secret,
        expiresIn: '1h',
      },
    );
  }

  verifyToken(token: string, expectedType: string): TokenVerificationResult {
    try {
      const secret = this.configService.get<string>('jwt.secret');
      
      if (!secret) {
        return {
          userId: null,
          valid: false,
          error: 'JWT secret is not configured',
        };
      }

      const payload = this.jwtService.verify(token, {
        secret,
      });
      
      if (payload.type !== expectedType) {
        return {
          userId: null,
          valid: false,
          error: 'Invalid token type',
        };
      }

      return {
        userId: payload.sub,
        valid: true,
      };
    } catch (error: any) {
      return {
        userId: null,
        valid: false,
        error: error.message || 'Token verification failed',
      };
    }
  }

  generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}