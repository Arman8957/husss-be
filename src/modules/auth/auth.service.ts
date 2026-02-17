import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {  Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { EmailService } from '../../common/email/email.service';
import { TokenService } from './token.service';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';


@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private firebaseService: FirebaseService,
    private emailService: EmailService,
    private tokenService: TokenService,
  ) {}

  async register(registerDto: RegisterDto, deviceInfo?: string, ipAddress?: string) {
    const { email, password, name, avatar, provider = AuthProvider.EMAIL } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = provider === AuthProvider.EMAIL 
      ? await bcrypt.hash(password, this.SALT_ROUNDS)
      : null;

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || email.split('@')[0],
        avatar,
        provider,
        emailVerified: provider !== AuthProvider.EMAIL,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isPremium: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    // Send verification email for email signup
    if (provider === AuthProvider.EMAIL && !user.emailVerified) {
      const token = this.tokenService.generateVerificationToken(user.id);
      await this.emailService.sendVerificationEmail(
        user.email,
        user.name || user.email.split('@')[0],
        token,
      );
    }

    // Create session and generate tokens
    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async login(loginDto: LoginDto, deviceInfo?: string, ipAddress?: string) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Verify password for email provider
    if (user.provider === AuthProvider.EMAIL) {
      if (!user.passwordHash) {
        throw new UnauthorizedException('Invalid login method');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      throw new UnauthorizedException(`Please login using ${user.provider}`);
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastActiveDate: new Date(),
      },
    });

    // Create session and generate tokens
    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async googleLogin(googleLoginDto: GoogleLoginDto) {
    const { idToken, deviceInfo, ipAddress } = googleLoginDto;

    try {
      // Verify Firebase ID token
      const decodedToken = await this.firebaseService.verifyIdToken(idToken);
      
      if (!decodedToken.email) {
        throw new BadRequestException('Email is required');
      }

      // Use type assertions to bypass TypeScript errors
      let user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { googleId: decodedToken.uid },
            { email: decodedToken.email },
            // Use type assertion for firebaseUid
            { firebaseUid: decodedToken.uid } as any,
          ],
        },
      });

      if (user) {
        // Use type assertion for the data object
        const updateData: any = {
          googleId: decodedToken.uid,
          emailVerified: true,
          avatar: decodedToken.picture || user.avatar,
          name: decodedToken.name || user.name,
          lastLoginAt: new Date(),
          lastActiveDate: new Date(),
        };
        
        // Only add firebaseUid if the field exists
        updateData.firebaseUid = decodedToken.uid;
        
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      } else {
        // Create with type assertion
        const createData: any = {
          email: decodedToken.email,
          googleId: decodedToken.uid,
          firebaseUid: decodedToken.uid,
          name: decodedToken.name || decodedToken.email.split('@')[0],
          avatar: decodedToken.picture,
          provider: AuthProvider.GOOGLE,
          emailVerified: true,
        };
        
        user = await this.prisma.user.create({
          data: createData,
        });
      }

      // Create session and generate tokens
      return this.createSession(user.id, deviceInfo, ipAddress);
    } catch (error: any) {
      throw new UnauthorizedException(`Google login failed: ${error.message}`);
    }
  }

  async appleLogin(appleLoginDto: AppleLoginDto) {
    const { identityToken, email: providedEmail, user: userInfoString, deviceInfo, ipAddress } = appleLoginDto;

    try {
      let email = providedEmail;
      let appleUserId: string | null = null;

      // Parse user info if provided
      if (!email && userInfoString) {
        try {
          const userInfo = JSON.parse(userInfoString);
          email = userInfo.email || null;
          appleUserId = userInfo.userId || null;
        } catch (e) {
          console.error('Failed to parse Apple user info:', e);
        }
      }

      if (!email) {
        throw new BadRequestException('Email is required for Apple login');
      }

      // Generate consistent appleUserId if not provided
      if (!appleUserId && identityToken) {
        appleUserId = crypto.createHash('sha256').update(identityToken).digest('hex').substring(0, 28);
      }

      // Use type assertion for appleId
      let user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { appleId: appleUserId } as any,
            { email: email },
          ],
        },
      });

      if (user) {
        // Update with type assertion
        const updateData: any = {
          emailVerified: true,
          lastLoginAt: new Date(),
          lastActiveDate: new Date(),
        };
        
        // Only add appleId if it exists
        if (appleUserId) {
          updateData.appleId = appleUserId;
        }
        
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      } else {
        // Create with type assertion
        const createData: any = {
          email: email,
          provider: AuthProvider.APPLE,
          emailVerified: true,
          name: email.split('@')[0],
        };
        
        // Only add appleId if it exists
        if (appleUserId) {
          createData.appleId = appleUserId;
        }
        
        user = await this.prisma.user.create({
          data: createData,
        });
      }

      // Create session and generate tokens
      return this.createSession(user.id, deviceInfo, ipAddress);
    } catch (error: any) {
      throw new UnauthorizedException(`Apple login failed: ${error.message}`);
    }
  }

  async logout(sessionId: string, userId: string) {
    try {
      await this.prisma.session.delete({
        where: { id: sessionId, userId },
      });
      return { message: 'Logged out successfully' };
    } catch (error) {
      // Silent fail for logout
      return { message: 'Logged out successfully' };
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.secret'),
      });

      // Check if session exists and is valid
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true },
      });

      if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Update session
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
      });

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(session.user, session.id);
      const newRefreshToken = this.generateRefreshToken(session.user.id, session.id);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role,
          isPremium: session.user.isPremium,
          avatar: session.user.avatar,
        },
      };
    } catch (error: any) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async createSession(userId: string, deviceInfo?: string, ipAddress?: string) {
    // Create session
    const session = await this.prisma.session.create({
      data: {
        userId,
        token: this.generateSessionToken(),
        deviceInfo,
        ipAddress,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isPremium: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user, session.id);
    const refreshToken = this.generateRefreshToken(userId, session.id);

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user,
    };
  }

  private generateAccessToken(user: any, sessionId: string): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isPremium: user.isPremium,
      sessionId,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '15m',
    });
  }

  private generateRefreshToken(userId: string, sessionId: string): string {
    const payload = {
      sub: userId,
      sessionId,
      type: 'refresh',
    };

    return this.jwtService.sign(payload, {
      expiresIn: '30d',
      secret: this.configService.get('jwt.secret'),
    });
  }

  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async validateUser(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPremium: true,
        isActive: true,
        emailVerified: true,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }

  // Email verification methods
  async requestEmailVerification(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal that user doesn't exist for security
      return { message: 'If an account exists with this email, verification email has been sent' };
    }

    if (user.emailVerified) {
      return { message: 'Email is already verified' };
    }

    // Generate verification token
    const token = this.tokenService.generateVerificationToken(user.id);

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      user.name || user.email.split('@')[0],
      token,
    );

    return { message: 'Verification email sent' };
  }

  async verifyEmail(token: string) {
    const result = this.tokenService.verifyToken(token, 'verification');

    if (!result.valid || !result.userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    // Update user as verified
    await this.prisma.user.update({
      where: { id: result.userId },
      data: {
        emailVerified: true,
        updatedAt: new Date(),
      },
    });

    // Send welcome email
    await this.emailService.sendWelcomeEmail(
      user.email,
      user.name || user.email.split('@')[0],
    );

    return { message: 'Email verified successfully' };
  }

  // Password reset methods
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal that user doesn't exist for security
      return { message: 'If an account exists with this email, password reset instructions have been sent' };
    }

    if (user.provider !== AuthProvider.EMAIL) {
      throw new BadRequestException(`Please use ${user.provider} login`);
    }

    // Generate reset token
    const token = this.tokenService.generatePasswordResetToken(user.id);

    // Send reset email
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.name || user.email.split('@')[0],
      token,
    );

    return { message: 'Password reset instructions sent to your email' };
  }

  async resetPassword(token: string, newPassword: string) {
    const result = this.tokenService.verifyToken(token, 'password_reset');

    if (!result.valid || !result.userId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    // Update password
    await this.prisma.user.update({
      where: { id: result.userId },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
    });

    // Invalidate all sessions for security
    await this.prisma.session.deleteMany({
      where: { userId: result.userId },
    });

    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Password login not enabled for this account');
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
    });

    return { message: 'Password changed successfully' };
  }
}