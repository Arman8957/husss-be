import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthProvider, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../common/email/email.service';
import { TokenService } from './token.service';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { AuditService } from '../../common/audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { CoachRegisterDto } from './dto/coach-register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';

import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { AdminCreateUserDto } from './dto/admin0create-user.dto';

// ─── Security constants ─────────────────────────────────────────────────────
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SESSIONS_PER_USER = 5;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

// ─── Reusable user select fields ────────────────────────────────────────────
const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  permissions: true,
  isPremium: true,
  premiumUntil: true,
  emailVerified: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Standard user signup via email + password.
   * Creates a FREE subscription record automatically.
   * Sends verification email for email signups.
   */
  async register(dto: RegisterDto, deviceInfo?: string, ipAddress?: string) {
    const {
      email,
      password,
      name,
      avatar,
      provider = AuthProvider.EMAIL,
    } = dto;

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing)
      throw new ConflictException('An account with this email already exists');

    if (provider === AuthProvider.EMAIL && !password) {
      throw new BadRequestException('Password is required for email signup');
    }

    const passwordHash =
      provider === AuthProvider.EMAIL
        ? await bcrypt.hash(password!, SALT_ROUNDS)
        : null;

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name?.trim() ?? normalizedEmail.split('@')[0],
        avatar,
        provider,
        role: UserRole.USER,
        emailVerified: provider !== AuthProvider.EMAIL,
        subscription: {
          create: { plan: 'FREE', status: 'ACTIVE' },
        },
      },
      select: USER_SAFE_SELECT,
    });

    if (provider === AuthProvider.EMAIL) {
      const token = this.tokenService.generateVerificationToken(user.id);
      await this.emailService.sendVerificationEmail(
        user.email,
        user.name ?? user.email.split('@')[0],
        token,
      );
    }

    await this.auditService.log({
      action: 'USER_REGISTERED',
      userId: user.id,
      ipAddress,
      meta: { provider, email: normalizedEmail },
    });

    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async registerCoach(
    dto: CoachRegisterDto,
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing)
      throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: dto.name.trim(),
        provider: AuthProvider.EMAIL,
        role: UserRole.COACH,
        emailVerified: false,
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        coachProfile: {
          create: {
            bio: dto.bio,
            specialties: dto.specialties ?? [], // ← FIXED here
            certifications: dto.certifications ?? [],
            gymName: dto.gymName,
            gymLocation: dto.gymLocation,
            isVerified: false,
            isActive: false,
          },
        },
      },
      select: USER_SAFE_SELECT,
    });

    const verifyToken = this.tokenService.generateVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(
      user.email,
      user.name ?? 'Coach',
      verifyToken,
    );

    await this.notifyAdminsNewCoach(user.email, user.name ?? 'Coach');

    await this.auditService.log({
      action: 'COACH_REGISTERED',
      userId: user.id,
      ipAddress,
      meta: { email: normalizedEmail, gymName: dto.gymName },
    });

    return {
      message:
        'Coach registration submitted. Please verify your email. Your account will be reviewed by an admin before activation.',
      userId: user.id,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Email + password login.
   * Protected by: account lock after 5 failed attempts (15 min cooldown),
   * timing-safe comparison (no user enumeration), active check.
   */
  async login(dto: LoginDto, deviceInfo?: string, ipAddress?: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Timing-safe: always hash even if user not found
    if (!user) {
      await bcrypt.hash(dto.password, SALT_ROUNDS);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lock (based on recent failed attempts)
    await this.checkAccountLock(user.id);

    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact support.',
      );
    }

    if (user.provider !== AuthProvider.EMAIL) {
      throw new UnauthorizedException(`Please sign in with ${user.provider}`);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Password login not configured for this account',
      );
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      await this.recordFailedLogin(user.id, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this.clearFailedLoginAttempts(user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActiveDate: new Date() },
    });

    await this.auditService.log({
      action: 'USER_LOGIN',
      userId: user.id,
      ipAddress,
      meta: { provider: 'EMAIL', deviceInfo },
    });

    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  /**
   * Google OAuth via Firebase ID token.
   * Upserts user — creates account if first time, updates if returning.
   */
  async googleLogin(dto: GoogleLoginDto) {
    let decoded: any;
    try {
      decoded = await this.firebaseService.verifyIdToken(dto.idToken);
    } catch (err: any) {
      throw new UnauthorizedException(
        `Google authentication failed: ${err.message}`,
      );
    }

    if (!decoded.email)
      throw new BadRequestException('Google account must have an email');

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { googleId: decoded.uid },
          { email: decoded.email },
          ...(decoded.uid ? [{ firebaseUid: decoded.uid } as any] : []),
        ],
      },
    });

    if (user) {
      if (!user.isActive)
        throw new UnauthorizedException('Account is deactivated');

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: decoded.uid,
          firebaseUid: decoded.uid,
          emailVerified: true,
          avatar: decoded.picture ?? user.avatar,
          name: user.name ?? decoded.name,
          lastLoginAt: new Date(),
          lastActiveDate: new Date(),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: decoded.email,
          googleId: decoded.uid,
          firebaseUid: decoded.uid,
          name: decoded.name ?? decoded.email.split('@')[0],
          avatar: decoded.picture,
          provider: AuthProvider.GOOGLE,
          role: UserRole.USER,
          emailVerified: true,
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        },
      });
    }

    await this.auditService.log({
      action: 'USER_LOGIN',
      userId: user.id,
      ipAddress: dto.ipAddress,
      meta: { provider: 'GOOGLE' },
    });

    return this.createSession(user.id, dto.deviceInfo, dto.ipAddress);
  }

  /**
   * Apple Sign-In via Apple identity token.
   * Apple only sends email on FIRST login — we extract it from user JSON string.
   */
  async appleLogin(dto: AppleLoginDto) {
    let email = dto.email;
    let appleUserId: string | null = null;

    // Parse user info JSON (only sent on first Apple login)
    if (!email && dto.user) {
      try {
        const parsed = JSON.parse(dto.user);
        email = parsed.email ?? null;
        appleUserId = parsed.userId ?? null;
      } catch {
        this.logger.warn('Failed to parse Apple user info JSON');
      }
    }

    if (!email)
      throw new BadRequestException('Email is required for Apple login');

    // Derive stable apple user ID from token hash if not provided
    if (!appleUserId && dto.identityToken) {
      appleUserId = crypto
        .createHash('sha256')
        .update(dto.identityToken)
        .digest('hex')
        .slice(0, 28);
    }

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(appleUserId ? [{ appleId: appleUserId } as any] : []),
          { email },
        ],
      },
    });

    if (user) {
      if (!user.isActive)
        throw new UnauthorizedException('Account is deactivated');
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(appleUserId ? { appleId: appleUserId } : {}),
          emailVerified: true,
          lastLoginAt: new Date(),
          lastActiveDate: new Date(),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          ...(appleUserId ? { appleId: appleUserId } : {}),
          provider: AuthProvider.APPLE,
          role: UserRole.USER,
          emailVerified: true,
          name: email.split('@')[0],
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        },
      });
    }

    await this.auditService.log({
      action: 'USER_LOGIN',
      userId: user.id,
      ipAddress: dto.ipAddress,
      meta: { provider: 'APPLE' },
    });

    return this.createSession(user.id, dto.deviceInfo, dto.ipAddress);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGOUT + SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /** Revoke current session (single device logout) */
  async logout(sessionId: string, userId: string) {
    await this.prisma.session
      .deleteMany({ where: { id: sessionId, userId } })
      .catch(() => {}); // silent — session may already be gone
    return { message: 'Logged out successfully' };
  }

  /** Revoke ALL sessions for this user (logout from every device) */
  async logoutAll(userId: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId },
    });
    await this.auditService.log({ action: 'LOGOUT_ALL_SESSIONS', userId });
    return { message: `Logged out from ${count} device(s)` };
  }

  /** List all active sessions for current user */
  async getMySessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        lastActiveAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  /** Remote-revoke a specific session (kick device) */
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.session.delete({ where: { id: sessionId } });
    return { message: 'Session revoked successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOKEN MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Rotate access + refresh token pair.
   * DB-validated: session must exist and not be expired.
   */
  async refreshToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });

    return {
      accessToken: this.generateAccessToken(session.user, session.id),
      refreshToken: this.generateRefreshToken(session.user.id, session.id),
      user: this.sanitizeUser(session.user),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EMAIL VERIFICATION
  // ══════════════════════════════════════════════════════════════════════════

  async requestEmailVerification(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // No enumeration — always return same message
    if (!user || user.emailVerified) {
      return {
        message:
          'If an unverified account exists with this email, a verification link has been sent',
      };
    }

    const token = this.tokenService.generateVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(
      user.email,
      user.name ?? 'User',
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
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) return { message: 'Email already verified' };

    await this.prisma.user.update({
      where: { id: result.userId },
      data: { emailVerified: true },
    });

    await this.emailService.sendWelcomeEmail(user.email, user.name ?? 'User');
    return { message: 'Email verified successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASSWORD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return {
        message:
          'If an account exists with this email, reset instructions have been sent',
      };
    }

    if (user.provider !== AuthProvider.EMAIL) {
      throw new BadRequestException(
        `This account uses ${user.provider} login. Password reset is not available.`,
      );
    }

    const token = this.tokenService.generatePasswordResetToken(user.id);
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.name ?? 'User',
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
    if (!user) throw new BadRequestException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Transaction: update password + revoke all sessions atomically
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: result.userId },
        data: { passwordHash },
      }),
      this.prisma.session.deleteMany({ where: { userId: result.userId } }),
    ]);

    await this.auditService.log({
      action: 'PASSWORD_RESET',
      userId: result.userId,
    });
    return { message: 'Password reset successful. Please log in again.' };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    if (oldPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Password login not configured for this account',
      );
    }

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid)
      throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.auditService.log({ action: 'PASSWORD_CHANGED', userId });

    return { message: 'Password changed successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUPER ADMIN — One-time bootstrap
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Creates the single SuperAdmin account.
   * Guards: (1) secretKey must match SUPERADMIN_BOOTSTRAP_KEY env var
   *         (2) no existing SUPER_ADMIN may exist
   *         (3) bootstrapping can be disabled by removing the env var
   */
  async bootstrapSuperAdmin(dto: BootstrapSuperAdminDto) {
    const bootstrapKey = this.config.get<string>('SUPERADMIN_BOOTSTRAP_KEY');

    if (!bootstrapKey) {
      throw new ForbiddenException('Super admin bootstrapping is disabled');
    }

    // Constant-time string comparison to prevent timing attacks
    const keyBuffer = Buffer.from(dto.secretKey);
    const expectedBuffer = Buffer.from(bootstrapKey);
    if (
      keyBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(keyBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid bootstrap key');
    }

    // Enforce single super admin
    const existing = await this.prisma.user.findFirst({
      where: { permissions: { has: 'SUPER_ADMIN' } },
    });
    if (existing) {
      throw new ConflictException('A super admin account already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        name: 'Super Admin',
        provider: AuthProvider.EMAIL,
        role: UserRole.ADMIN,
        emailVerified: true,
        isActive: true,
        permissions: [
          'SUPER_ADMIN',
          'CREATE_USERS',
          'DELETE_USERS',
          'MANAGE_ROLES',
          'MANAGE_COACHES',
          'VIEW_AUDIT_LOGS',
          'MANAGE_SUBSCRIPTIONS',
          'MANAGE_CONTENT',
        ],
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
      },
      select: USER_SAFE_SELECT,
    });

    this.logger.warn(`[SECURITY] Super admin bootstrapped: ${user.email}`);
    await this.auditService.log({
      action: 'SUPERADMIN_BOOTSTRAPPED',
      userId: user.id,
    });

    return {
      message:
        'Super admin created successfully. Remove or rotate SUPERADMIN_BOOTSTRAP_KEY in your environment.',
      userId: user.id,
      email: user.email,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — User Management
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Admin creates a new user of any role.
   * Only SUPER_ADMIN can create ADMIN role accounts.
   */
  async adminCreateUser(dto: AdminCreateUserDto, createdByAdminId: string) {
    if (dto.role === UserRole.ADMIN) {
      await this.assertSuperAdmin(createdByAdminId);
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, SALT_ROUNDS)
      : null;

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: dto.name,
        passwordHash,
        provider: AuthProvider.EMAIL,
        role: dto.role ?? UserRole.USER,
        emailVerified: dto.emailVerified ?? true,
        isActive: true,
        permissions: dto.permissions ?? [],
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        ...(dto.role === UserRole.COACH
          ? {
              coachProfile: {
                create: {
                  specialties: [], // ← FIXED here
                  certifications: [],
                  isVerified: true,
                  isActive: true,
                },
              },
            }
          : {}),
      },
      select: USER_SAFE_SELECT,
    });

    if (dto.password) {
      await this.emailService.sendAdminCreatedAccountEmail(
        user.email,
        user.name ?? 'User',
        dto.password,
      );
    }

    await this.auditService.log({
      action: 'ADMIN_CREATED_USER',
      userId: createdByAdminId,
      targetId: user.id,
      meta: { role: dto.role, email: normalizedEmail },
    });

    return user;
  }

  /**
   * Permanently deletes a user and all related data (cascade).
   * SUPER_ADMIN only.
   */
  async adminDeleteUser(targetUserId: string, adminId: string) {
    await this.assertSuperAdmin(adminId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot delete another super admin account');
    }

    await this.prisma.user.delete({ where: { id: targetUserId } });

    await this.auditService.log({
      action: 'ADMIN_DELETED_USER',
      userId: adminId,
      targetId: targetUserId,
      meta: { deletedEmail: target.email, deletedRole: target.role },
    });

    return { message: 'User permanently deleted' };
  }

  /**
   * Change a user's role.
   * Promoting to ADMIN requires SUPER_ADMIN.
   */
  async adminChangeRole(
    targetUserId: string,
    newRole: UserRole,
    adminId: string,
  ) {
    if (newRole === UserRole.ADMIN) await this.assertSuperAdmin(adminId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { coachProfile: true },
    });

    if (!target) throw new NotFoundException('User not found');
    if (target.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot modify super admin role');
    }

    const user = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        role: newRole,
        ...(newRole === UserRole.COACH && !target.coachProfile
          ? {
              coachProfile: {
                create: {
                  specialties: [], // ← FIXED here
                  certifications: [],
                  isVerified: true,
                  isActive: true,
                },
              },
            }
          : {}),
      },
      select: USER_SAFE_SELECT,
    });

    await this.auditService.log({
      action: 'ADMIN_ROLE_CHANGED',
      userId: adminId,
      targetId: targetUserId,
      meta: { from: target.role, to: newRole },
    });

    return user;
  }

  /**
   * Activate or deactivate a user.
   * Deactivating immediately revokes all active sessions.
   */
  async adminToggleUserStatus(
    targetUserId: string,
    isActive: boolean,
    adminId: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot deactivate the super admin account');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { isActive },
      }),
      ...(isActive
        ? []
        : [
            this.prisma.session.deleteMany({ where: { userId: targetUserId } }),
          ]),
    ]);

    await this.auditService.log({
      action: isActive ? 'ADMIN_USER_ACTIVATED' : 'ADMIN_USER_DEACTIVATED',
      userId: adminId,
      targetId: targetUserId,
    });

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
    };
  }

  /**
   * Approve or reject a coach registration.
   * Sets coachProfile.isVerified + isActive and sends email.
   */
  async adminApproveCoach(
    coachUserId: string,
    adminId: string,
    approved: boolean,
  ) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachUserId },
      include: { coachProfile: true },
    });

    if (!coach || coach.role !== UserRole.COACH)
      throw new NotFoundException('Coach not found');
    if (!coach.coachProfile)
      throw new BadRequestException('Coach profile missing');

    await this.prisma.coachProfile.update({
      where: { userId: coachUserId },
      data: {
        isVerified: approved,
        isActive: approved,
        // verifiedAt: ...  ← REMOVED – field does not exist
      },
    });

    await this.emailService.sendCoachApprovalEmail(
      coach.email,
      coach.name ?? 'Coach',
      approved,
    );

    await this.auditService.log({
      action: approved ? 'ADMIN_COACH_APPROVED' : 'ADMIN_COACH_REJECTED',
      userId: adminId,
      targetId: coachUserId,
    });

    return {
      message: `Coach ${approved ? 'approved and activated' : 'rejected'} successfully`,
    };
  }

  /** Update admin-level permissions array for a user (SUPER_ADMIN only) */
  async adminUpdatePermissions(
    targetUserId: string,
    permissions: string[],
    adminId: string,
  ) {
    await this.assertSuperAdmin(adminId);

    // Prevent granting SUPER_ADMIN via this endpoint
    if (permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'Cannot grant SUPER_ADMIN permission via this endpoint',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot modify super admin permissions');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { permissions },
      select: USER_SAFE_SELECT,
    });

    await this.auditService.log({
      action: 'ADMIN_PERMISSIONS_UPDATED',
      userId: adminId,
      targetId: targetUserId,
      meta: { permissions },
    });

    return updated;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // JWT STRATEGY
  // ══════════════════════════════════════════════════════════════════════════

  /** Called by JwtStrategy.validate() on every protected request */
  async validateUser(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        permissions: true,
        isPremium: true,
        premiumUntil: true,
        isActive: true,
        emailVerified: true,
      },
    });

    if (!user || !user.isActive) return null;

    return { ...user, sessionId: payload.sessionId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async createSession(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
  ) {
    // Enforce concurrent session limit — evict oldest if over cap
    const sessionCount = await this.prisma.session.count({ where: { userId } });
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      const oldest = await this.prisma.session.findFirst({
        where: { userId },
        orderBy: { lastActiveAt: 'asc' },
      });
      if (oldest)
        await this.prisma.session.delete({ where: { id: oldest.id } });
    }

    const session = await this.prisma.session.create({
      data: {
        userId,
        token: crypto.randomBytes(32).toString('hex'),
        deviceInfo,
        ipAddress,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SAFE_SELECT,
    });

    if (!user) throw new UnauthorizedException('User not found');

    return {
      accessToken: this.generateAccessToken(user, session.id),
      refreshToken: this.generateRefreshToken(userId, session.id),
      sessionId: session.id,
      user,
    };
  }

  private generateAccessToken(user: any, sessionId: string): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions ?? [],
        isPremium: user.isPremium,
        sessionId,
      },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  private generateRefreshToken(userId: string, sessionId: string): string {
    return this.jwtService.sign(
      { sub: userId, sessionId, type: 'refresh' },
      {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        secret: this.config.get<string>('JWT_SECRET'),
      },
    );
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      permissions: user.permissions ?? [],
      isPremium: user.isPremium,
    };
  }

  private async checkAccountLock(userId: string) {
    const since = new Date(Date.now() - LOCK_DURATION_MS);
    const failCount = await this.prisma.userActivityLog.count({
      where: {
        userId,
        type: 'LOGIN_FAILED' as any,
        createdAt: { gte: since },
      },
    });

    if (failCount >= MAX_LOGIN_ATTEMPTS) {
      const minutesLeft = Math.ceil(LOCK_DURATION_MS / 60000);
      throw new UnauthorizedException(
        `Too many failed attempts. Account temporarily locked. Try again in ${minutesLeft} minutes.`,
      );
    }
  }

  private async recordFailedLogin(userId: string, ipAddress?: string) {
    await this.prisma.userActivityLog
      .create({
        data: { userId, type: 'LOGIN_FAILED' as any, meta: { ipAddress } },
      })
      .catch(() => {}); // Non-fatal
  }

  private async clearFailedLoginAttempts(userId: string) {
    await this.prisma.userActivityLog
      .deleteMany({ where: { userId, type: 'LOGIN_FAILED' as any } })
      .catch(() => {});
  }

  private async assertSuperAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { permissions: true },
    });
    if (!admin?.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'Only the super admin can perform this action',
      );
    }
  }

  private async notifyAdminsNewCoach(coachEmail: string, coachName: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { email: true, name: true },
    });
    await Promise.allSettled(
      admins.map((a) =>
        this.emailService.sendNewCoachRegisteredEmail(
          a.email,
          coachEmail,
          coachName,
        ),
      ),
    );
  }
}

// import {
//   Injectable,
//   ConflictException,
//   UnauthorizedException,
//   BadRequestException,
// } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { ConfigService } from '@nestjs/config';
// import * as bcrypt from 'bcryptjs';
// import * as crypto from 'crypto';
// import {  Prisma } from '@prisma/client';
// import { PrismaService } from '../../prisma/prisma.service';
// import { RegisterDto } from './dto/register.dto';
// import { LoginDto } from './dto/login.dto';
// import { GoogleLoginDto } from './dto/google-login.dto';
// import { AppleLoginDto } from './dto/apple-login.dto';
// import { EmailService } from '../../common/email/email.service';
// import { TokenService } from './token.service';
// import { FirebaseService } from '../../common/firebase/firebase.service';
// import { AuthProvider } from 'src/common/enums/auth-provider.enum';

// @Injectable()
// export class AuthService {
//   private readonly SALT_ROUNDS = 12;

//   constructor(
//     private prisma: PrismaService,
//     private jwtService: JwtService,
//     private configService: ConfigService,
//     private firebaseService: FirebaseService,
//     private emailService: EmailService,
//     private tokenService: TokenService,
//   ) {}

//   async register(registerDto: RegisterDto, deviceInfo?: string, ipAddress?: string) {
//     const { email, password, name, avatar, provider = AuthProvider.EMAIL } = registerDto;

//     // Check if user already exists
//     const existingUser = await this.prisma.user.findUnique({
//       where: { email },
//     });

//     if (existingUser) {
//       throw new ConflictException('User with this email already exists');
//     }

//     // Hash password
//     const passwordHash = provider === AuthProvider.EMAIL
//       ? await bcrypt.hash(password, this.SALT_ROUNDS)
//       : null;

//     // Create user
//     const user = await this.prisma.user.create({
//       data: {
//         email,
//         passwordHash,
//         name: name || email.split('@')[0],
//         avatar,
//         provider,
//         emailVerified: provider !== AuthProvider.EMAIL,
//       },
//       select: {
//         id: true,
//         email: true,
//         name: true,
//         avatar: true,
//         role: true,
//         isPremium: true,
//         emailVerified: true,
//         createdAt: true,
//       },
//     });

//     // Send verification email for email signup
//     if (provider === AuthProvider.EMAIL && !user.emailVerified) {
//       const token = this.tokenService.generateVerificationToken(user.id);
//       await this.emailService.sendVerificationEmail(
//         user.email,
//         user.name || user.email.split('@')[0],
//         token,
//       );
//     }

//     // Create session and generate tokens
//     return this.createSession(user.id, deviceInfo, ipAddress);
//   }

//   async login(loginDto: LoginDto, deviceInfo?: string, ipAddress?: string) {
//     const { email, password } = loginDto;

//     // Find user
//     const user = await this.prisma.user.findUnique({
//       where: { email },
//     });

//     if (!user) {
//       throw new UnauthorizedException('Invalid credentials');
//     }

//     // Check if user is active
//     if (!user.isActive) {
//       throw new UnauthorizedException('Account is deactivated');
//     }

//     // Verify password for email provider
//     if (user.provider === AuthProvider.EMAIL) {
//       if (!user.passwordHash) {
//         throw new UnauthorizedException('Invalid login method');
//       }

//       const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
//       if (!isPasswordValid) {
//         throw new UnauthorizedException('Invalid credentials');
//       }
//     } else {
//       throw new UnauthorizedException(`Please login using ${user.provider}`);
//     }

//     // Update last login
//     await this.prisma.user.update({
//       where: { id: user.id },
//       data: {
//         lastLoginAt: new Date(),
//         lastActiveDate: new Date(),
//       },
//     });

//     // Create session and generate tokens
//     return this.createSession(user.id, deviceInfo, ipAddress);
//   }

//   async googleLogin(googleLoginDto: GoogleLoginDto) {
//     const { idToken, deviceInfo, ipAddress } = googleLoginDto;

//     try {
//       // Verify Firebase ID token
//       const decodedToken = await this.firebaseService.verifyIdToken(idToken);

//       if (!decodedToken.email) {
//         throw new BadRequestException('Email is required');
//       }

//       // Use type assertions to bypass TypeScript errors
//       let user = await this.prisma.user.findFirst({
//         where: {
//           OR: [
//             { googleId: decodedToken.uid },
//             { email: decodedToken.email },
//             // Use type assertion for firebaseUid
//             { firebaseUid: decodedToken.uid } as any,
//           ],
//         },
//       });

//       if (user) {
//         // Use type assertion for the data object
//         const updateData: any = {
//           googleId: decodedToken.uid,
//           emailVerified: true,
//           avatar: decodedToken.picture || user.avatar,
//           name: decodedToken.name || user.name,
//           lastLoginAt: new Date(),
//           lastActiveDate: new Date(),
//         };

//         // Only add firebaseUid if the field exists
//         updateData.firebaseUid = decodedToken.uid;

//         user = await this.prisma.user.update({
//           where: { id: user.id },
//           data: updateData,
//         });
//       } else {
//         // Create with type assertion
//         const createData: any = {
//           email: decodedToken.email,
//           googleId: decodedToken.uid,
//           firebaseUid: decodedToken.uid,
//           name: decodedToken.name || decodedToken.email.split('@')[0],
//           avatar: decodedToken.picture,
//           provider: AuthProvider.GOOGLE,
//           emailVerified: true,
//         };

//         user = await this.prisma.user.create({
//           data: createData,
//         });
//       }

//       // Create session and generate tokens
//       return this.createSession(user.id, deviceInfo, ipAddress);
//     } catch (error: any) {
//       throw new UnauthorizedException(`Google login failed: ${error.message}`);
//     }
//   }

//   async appleLogin(appleLoginDto: AppleLoginDto) {
//     const { identityToken, email: providedEmail, user: userInfoString, deviceInfo, ipAddress } = appleLoginDto;

//     try {
//       let email = providedEmail;
//       let appleUserId: string | null = null;

//       // Parse user info if provided
//       if (!email && userInfoString) {
//         try {
//           const userInfo = JSON.parse(userInfoString);
//           email = userInfo.email || null;
//           appleUserId = userInfo.userId || null;
//         } catch (e) {
//           console.error('Failed to parse Apple user info:', e);
//         }
//       }

//       if (!email) {
//         throw new BadRequestException('Email is required for Apple login');
//       }

//       // Generate consistent appleUserId if not provided
//       if (!appleUserId && identityToken) {
//         appleUserId = crypto.createHash('sha256').update(identityToken).digest('hex').substring(0, 28);
//       }

//       // Use type assertion for appleId
//       let user = await this.prisma.user.findFirst({
//         where: {
//           OR: [
//             { appleId: appleUserId } as any,
//             { email: email },
//           ],
//         },
//       });

//       if (user) {
//         // Update with type assertion
//         const updateData: any = {
//           emailVerified: true,
//           lastLoginAt: new Date(),
//           lastActiveDate: new Date(),
//         };

//         // Only add appleId if it exists
//         if (appleUserId) {
//           updateData.appleId = appleUserId;
//         }

//         user = await this.prisma.user.update({
//           where: { id: user.id },
//           data: updateData,
//         });
//       } else {
//         // Create with type assertion
//         const createData: any = {
//           email: email,
//           provider: AuthProvider.APPLE,
//           emailVerified: true,
//           name: email.split('@')[0],
//         };

//         // Only add appleId if it exists
//         if (appleUserId) {
//           createData.appleId = appleUserId;
//         }

//         user = await this.prisma.user.create({
//           data: createData,
//         });
//       }

//       // Create session and generate tokens
//       return this.createSession(user.id, deviceInfo, ipAddress);
//     } catch (error: any) {
//       throw new UnauthorizedException(`Apple login failed: ${error.message}`);
//     }
//   }

//   async logout(sessionId: string, userId: string) {
//     try {
//       await this.prisma.session.delete({
//         where: { id: sessionId, userId },
//       });
//       return { message: 'Logged out successfully' };
//     } catch (error) {
//       // Silent fail for logout
//       return { message: 'Logged out successfully' };
//     }
//   }

//   async refreshToken(refreshToken: string) {
//     try {
//       // Verify refresh token
//       const payload = this.jwtService.verify(refreshToken, {
//         secret: this.configService.get('jwt.secret'),
//       });

//       // Check if session exists and is valid
//       const session = await this.prisma.session.findUnique({
//         where: { id: payload.sessionId },
//         include: { user: true },
//       });

//       if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
//         throw new UnauthorizedException('Invalid refresh token');
//       }

//       // Update session
//       await this.prisma.session.update({
//         where: { id: session.id },
//         data: { lastActiveAt: new Date() },
//       });

//       // Generate new tokens
//       const newAccessToken = this.generateAccessToken(session.user, session.id);
//       const newRefreshToken = this.generateRefreshToken(session.user.id, session.id);

//       return {
//         accessToken: newAccessToken,
//         refreshToken: newRefreshToken,
//         user: {
//           id: session.user.id,
//           email: session.user.email,
//           name: session.user.name,
//           role: session.user.role,
//           isPremium: session.user.isPremium,
//           avatar: session.user.avatar,
//         },
//       };
//     } catch (error: any) {
//       throw new UnauthorizedException('Invalid refresh token');
//     }
//   }

//   private async createSession(userId: string, deviceInfo?: string, ipAddress?: string) {
//     // Create session
//     const session = await this.prisma.session.create({
//       data: {
//         userId,
//         token: this.generateSessionToken(),
//         deviceInfo,
//         ipAddress,
//         expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
//       },
//     });

//     // Get user details
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         id: true,
//         email: true,
//         name: true,
//         avatar: true,
//         role: true,
//         isPremium: true,
//         emailVerified: true,
//         createdAt: true,
//       },
//     });

//     if (!user) {
//       throw new UnauthorizedException('User not found');
//     }

//     // Generate tokens
//     const accessToken = this.generateAccessToken(user, session.id);
//     const refreshToken = this.generateRefreshToken(userId, session.id);

//     return {
//       accessToken,
//       refreshToken,
//       sessionId: session.id,
//       user,
//     };
//   }

//   private generateAccessToken(user: any, sessionId: string): string {
//     const payload = {
//       sub: user.id,
//       email: user.email,
//       role: user.role,
//       isPremium: user.isPremium,
//       sessionId,
//     };

//     return this.jwtService.sign(payload, {
//       expiresIn: '15m',
//     });
//   }

//   private generateRefreshToken(userId: string, sessionId: string): string {
//     const payload = {
//       sub: userId,
//       sessionId,
//       type: 'refresh',
//     };

//     return this.jwtService.sign(payload, {
//       expiresIn: '30d',
//       secret: this.configService.get('jwt.secret'),
//     });
//   }

//   private generateSessionToken(): string {
//     return crypto.randomBytes(32).toString('hex');
//   }

//   async validateUser(payload: any) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: payload.sub },
//       select: {
//         id: true,
//         email: true,
//         name: true,
//         role: true,
//         isPremium: true,
//         isActive: true,
//         emailVerified: true,
//       },
//     });

//     if (!user || !user.isActive) {
//       return null;
//     }

//     return user;
//   }

//   // Email verification methods
//   async requestEmailVerification(email: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { email },
//     });

//     if (!user) {
//       // Don't reveal that user doesn't exist for security
//       return { message: 'If an account exists with this email, verification email has been sent' };
//     }

//     if (user.emailVerified) {
//       return { message: 'Email is already verified' };
//     }

//     // Generate verification token
//     const token = this.tokenService.generateVerificationToken(user.id);

//     // Send verification email
//     await this.emailService.sendVerificationEmail(
//       user.email,
//       user.name || user.email.split('@')[0],
//       token,
//     );

//     return { message: 'Verification email sent' };
//   }

//   async verifyEmail(token: string) {
//     const result = this.tokenService.verifyToken(token, 'verification');

//     if (!result.valid || !result.userId) {
//       throw new BadRequestException('Invalid or expired verification token');
//     }

//     const user = await this.prisma.user.findUnique({
//       where: { id: result.userId },
//     });

//     if (!user) {
//       throw new BadRequestException('User not found');
//     }

//     if (user.emailVerified) {
//       return { message: 'Email already verified' };
//     }

//     // Update user as verified
//     await this.prisma.user.update({
//       where: { id: result.userId },
//       data: {
//         emailVerified: true,
//         updatedAt: new Date(),
//       },
//     });

//     // Send welcome email
//     await this.emailService.sendWelcomeEmail(
//       user.email,
//       user.name || user.email.split('@')[0],
//     );

//     return { message: 'Email verified successfully' };
//   }

//   // Password reset methods
//   async requestPasswordReset(email: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { email },
//     });

//     if (!user) {
//       // Don't reveal that user doesn't exist for security
//       return { message: 'If an account exists with this email, password reset instructions have been sent' };
//     }

//     if (user.provider !== AuthProvider.EMAIL) {
//       throw new BadRequestException(`Please use ${user.provider} login`);
//     }

//     // Generate reset token
//     const token = this.tokenService.generatePasswordResetToken(user.id);

//     // Send reset email
//     await this.emailService.sendPasswordResetEmail(
//       user.email,
//       user.name || user.email.split('@')[0],
//       token,
//     );

//     return { message: 'Password reset instructions sent to your email' };
//   }

//   async resetPassword(token: string, newPassword: string) {
//     const result = this.tokenService.verifyToken(token, 'password_reset');

//     if (!result.valid || !result.userId) {
//       throw new BadRequestException('Invalid or expired reset token');
//     }

//     const user = await this.prisma.user.findUnique({
//       where: { id: result.userId },
//     });

//     if (!user) {
//       throw new BadRequestException('User not found');
//     }

//     // Hash new password
//     const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

//     // Update password
//     await this.prisma.user.update({
//       where: { id: result.userId },
//       data: {
//         passwordHash,
//         updatedAt: new Date(),
//       },
//     });

//     // Invalidate all sessions for security
//     await this.prisma.session.deleteMany({
//       where: { userId: result.userId },
//     });

//     return { message: 'Password reset successful' };
//   }

//   async changePassword(userId: string, oldPassword: string, newPassword: string) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//     });

//     if (!user) {
//       throw new BadRequestException('User not found');
//     }

//     if (!user.passwordHash) {
//       throw new BadRequestException('Password login not enabled for this account');
//     }

//     // Verify old password
//     const isPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
//     if (!isPasswordValid) {
//       throw new UnauthorizedException('Current password is incorrect');
//     }

//     // Hash new password
//     const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

//     // Update password
//     await this.prisma.user.update({
//       where: { id: userId },
//       data: {
//         passwordHash,
//         updatedAt: new Date(),
//       },
//     });

//     return { message: 'Password changed successfully' };
//   }
// }
