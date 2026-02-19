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
const SALT_ROUNDS           = 12;
const MAX_LOGIN_ATTEMPTS    = 5;
const LOCK_DURATION_MS      = 15 * 60 * 1000;        // 15 minutes
const SESSION_EXPIRY_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SESSIONS_PER_USER = 5;
const ACCESS_TOKEN_EXPIRY   = '15m';
const REFRESH_TOKEN_EXPIRY  = '30d';

// ─── Reusable select ────────────────────────────────────────────────────────
const USER_SAFE_SELECT = {
  id: true, email: true, name: true, avatar: true,
  role: true, permissions: true, isPremium: true,
  premiumUntil: true, emailVerified: true, createdAt: true,
} as const;

// ─── In-memory brute-force tracker ──────────────────────────────────────────
// WHY: Your schema has no `LoginAttempt` / `loginAttempt` model.
// This Map-based solution requires ZERO schema changes.
// For multi-instance / Redis deployments: swap with @nestjs/cache + Redis.
interface FailRecord { count: number; firstFailAt: number }
const failMap = new Map<string, FailRecord>();

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

  async register(dto: RegisterDto, deviceInfo?: string, ipAddress?: string) {
    const { email, password, name, avatar, provider = AuthProvider.EMAIL } = dto;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('An account with this email already exists');

    if (provider === AuthProvider.EMAIL && !password) {
      throw new BadRequestException('Password is required for email signup');
    }

    const passwordHash =
      provider === AuthProvider.EMAIL ? await bcrypt.hash(password!, SALT_ROUNDS) : null;

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name?.trim() ?? normalizedEmail.split('@')[0],
        avatar,
        provider,
        role: UserRole.USER,
        emailVerified: provider !== AuthProvider.EMAIL,
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
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
      action: 'USER_REGISTERED', userId: user.id, ipAddress,
      meta: { provider, email: normalizedEmail },
    });

    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async registerCoach(dto: CoachRegisterDto, deviceInfo?: string, ipAddress?: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('An account with this email already exists');

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
            specialties: dto.specialties ?? [],
            certifications: dto.certifications ?? [],
            gymName: dto.gymName,
            gymLocation: dto.gymLocation,
            isVerified: false,
            isActive: false,         // blocked until admin approves
          },
        },
      },
      select: USER_SAFE_SELECT,
    });

    const verifyToken = this.tokenService.generateVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(user.email, user.name ?? 'Coach', verifyToken);
    await this.notifyAdminsNewCoach(user.email, user.name ?? 'Coach');

    await this.auditService.log({
      action: 'COACH_REGISTERED', userId: user.id, ipAddress,
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

  async login(dto: LoginDto, deviceInfo?: string, ipAddress?: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Timing-safe: always hash even when user not found — prevents enumeration
    if (!user) {
      await bcrypt.hash(dto.password, SALT_ROUNDS);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Brute-force gate (synchronous — no DB hit)
    this.checkAccountLock(user.id);

    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Please contact support.',
      );
    }

    if (user.provider !== AuthProvider.EMAIL) {
      throw new UnauthorizedException(`Please sign in with ${user.provider}`);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Password login not configured for this account');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      this.recordFailedLogin(user.id);
      await this.auditService.log({
        action: 'LOGIN_FAILED', userId: user.id, ipAddress,
        meta: { reason: 'wrong_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success — clear lock counter
    this.clearFailedLoginAttempts(user.id);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActiveDate: new Date() },
    });

    await this.auditService.log({
      action: 'USER_LOGIN', userId: user.id, ipAddress,
      meta: { provider: 'EMAIL', deviceInfo },
    });

    return this.createSession(user.id, deviceInfo, ipAddress);
  }

  async googleLogin(dto: GoogleLoginDto) {
    let decoded: any;
    try {
      decoded = await this.firebaseService.verifyIdToken(dto.idToken);
    } catch (err: any) {
      throw new UnauthorizedException(`Google authentication failed: ${err.message}`);
    }

    if (!decoded.email) throw new BadRequestException('Google account must have an email');

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
      if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: decoded.uid, firebaseUid: decoded.uid,
          emailVerified: true,
          avatar: decoded.picture ?? user.avatar,
          name: user.name ?? decoded.name,
          lastLoginAt: new Date(), lastActiveDate: new Date(),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: decoded.email, googleId: decoded.uid, firebaseUid: decoded.uid,
          name: decoded.name ?? decoded.email.split('@')[0],
          avatar: decoded.picture,
          provider: AuthProvider.GOOGLE,
          role: UserRole.USER, emailVerified: true,
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        },
      });
    }

    await this.auditService.log({
      action: 'USER_LOGIN', userId: user.id, ipAddress: dto.ipAddress,
      meta: { provider: 'GOOGLE' },
    });

    return this.createSession(user.id, dto.deviceInfo, dto.ipAddress);
  }

  async appleLogin(dto: AppleLoginDto) {
    let email = dto.email;
    let appleUserId: string | null = null;

    if (!email && dto.user) {
      try {
        const parsed = JSON.parse(dto.user);
        email = parsed.email ?? null;
        appleUserId = parsed.userId ?? null;
      } catch {
        this.logger.warn('Failed to parse Apple user info JSON');
      }
    }

    if (!email) throw new BadRequestException('Email is required for Apple login');

    if (!appleUserId && dto.identityToken) {
      appleUserId = crypto
        .createHash('sha256').update(dto.identityToken).digest('hex').slice(0, 28);
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
      if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(appleUserId ? { appleId: appleUserId } : {}),
          emailVerified: true, lastLoginAt: new Date(), lastActiveDate: new Date(),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          ...(appleUserId ? { appleId: appleUserId } : {}),
          provider: AuthProvider.APPLE, role: UserRole.USER,
          emailVerified: true, name: email.split('@')[0],
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        },
      });
    }

    await this.auditService.log({
      action: 'USER_LOGIN', userId: user.id, ipAddress: dto.ipAddress,
      meta: { provider: 'APPLE' },
    });

    return this.createSession(user.id, dto.deviceInfo, dto.ipAddress);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  async logout(sessionId: string, userId: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId, userId } }).catch(() => {});
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    const { count } = await this.prisma.session.deleteMany({ where: { userId } });
    await this.auditService.log({ action: 'LOGOUT_ALL_SESSIONS', userId });
    return { message: `Logged out from ${count} device(s)` };
  }

  async getMySessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: {
        id: true, deviceInfo: true, ipAddress: true,
        lastActiveAt: true, createdAt: true, expiresAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.prisma.session.delete({ where: { id: sessionId } });
    return { message: 'Session revoked successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOKEN
  // ══════════════════════════════════════════════════════════════════════════

  async refreshToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.userId !== payload.sub || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    if (!session.user.isActive) throw new UnauthorizedException('Account has been deactivated');

    await this.prisma.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } });

    return {
      accessToken:  this.generateAccessToken(session.user, session.id),
      refreshToken: this.generateRefreshToken(session.user.id, session.id),
      user:         this.sanitizeUser(session.user),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EMAIL VERIFICATION
  // ══════════════════════════════════════════════════════════════════════════

  async requestEmailVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || user.emailVerified) {
      return { message: 'If an unverified account exists with this email, a verification link has been sent' };
    }
    const token = this.tokenService.generateVerificationToken(user.id);
    await this.emailService.sendVerificationEmail(user.email, user.name ?? 'User', token);
    return { message: 'Verification email sent' };
  }

  async verifyEmail(token: string) {
    const result = this.tokenService.verifyToken(token, 'verification');
    if (!result.valid || !result.userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: result.userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) return { message: 'Email already verified' };

    await this.prisma.user.update({ where: { id: result.userId }, data: { emailVerified: true } });
    await this.emailService.sendWelcomeEmail(user.email, user.name ?? 'User');
    return { message: 'Email verified successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASSWORD
  // ══════════════════════════════════════════════════════════════════════════

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      return { message: 'If an account exists with this email, reset instructions have been sent' };
    }
    if (user.provider !== AuthProvider.EMAIL) {
      throw new BadRequestException(
        `This account uses ${user.provider} login. Password reset is not available.`,
      );
    }
    const token = this.tokenService.generatePasswordResetToken(user.id);
    await this.emailService.sendPasswordResetEmail(user.email, user.name ?? 'User', token);
    return { message: 'Password reset instructions sent to your email' };
  }

  async resetPassword(token: string, newPassword: string) {
    const result = this.tokenService.verifyToken(token, 'password_reset');
    if (!result.valid || !result.userId) throw new BadRequestException('Invalid or expired reset token');

    const user = await this.prisma.user.findUnique({ where: { id: result.userId } });
    if (!user) throw new BadRequestException('User not found');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: result.userId }, data: { passwordHash } }),
      this.prisma.session.deleteMany({ where: { userId: result.userId } }),
    ]);

    await this.auditService.log({ action: 'PASSWORD_RESET', userId: result.userId });
    return { message: 'Password reset successful. Please log in again.' };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (oldPassword === newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Password login not configured for this account');

    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.auditService.log({ action: 'PASSWORD_CHANGED', userId });
    return { message: 'Password changed successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUPER ADMIN BOOTSTRAP
  // ══════════════════════════════════════════════════════════════════════════

  async bootstrapSuperAdmin(dto: BootstrapSuperAdminDto) {
    const bootstrapKey = this.config.get<string>('SUPERADMIN_BOOTSTRAP_KEY');
    if (!bootstrapKey) throw new ForbiddenException('Super admin bootstrapping is disabled');

    const keyBuffer      = Buffer.from(dto.secretKey);
    const expectedBuffer = Buffer.from(bootstrapKey);
    if (keyBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
      throw new ForbiddenException('Invalid bootstrap key');
    }

    const existing = await this.prisma.user.findFirst({ where: { permissions: { has: 'SUPER_ADMIN' } } });
    if (existing) throw new ConflictException('A super admin account already exists');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        name: 'Super Admin',
        provider: AuthProvider.EMAIL,
        role: UserRole.ADMIN,
        emailVerified: true, isActive: true,
        permissions: [
          'SUPER_ADMIN', 'CREATE_USERS', 'DELETE_USERS', 'MANAGE_ROLES',
          'MANAGE_COACHES', 'VIEW_AUDIT_LOGS', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_CONTENT',
        ],
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
      },
      select: USER_SAFE_SELECT,
    });

    this.logger.warn(`[SECURITY] Super admin bootstrapped: ${user.email}`);
    await this.auditService.log({ action: 'SUPERADMIN_BOOTSTRAPPED', userId: user.id });

    return {
      message: 'Super admin created successfully. Remove or rotate SUPERADMIN_BOOTSTRAP_KEY in your environment.',
      userId: user.id,
      email: user.email,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — User Management
  // ══════════════════════════════════════════════════════════════════════════

  async adminCreateUser(dto: AdminCreateUserDto, createdByAdminId: string) {
    if (dto.role === UserRole.ADMIN) await this.assertSuperAdmin(createdByAdminId);

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, SALT_ROUNDS) : null;

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail, name: dto.name,
        passwordHash, provider: AuthProvider.EMAIL,
        role: dto.role ?? UserRole.USER,
        emailVerified: dto.emailVerified ?? true,
        isActive: true, permissions: dto.permissions ?? [],
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        ...(dto.role === UserRole.COACH
          ? {
              coachProfile: {
                create: { specialties: [], certifications: [], isVerified: true, isActive: true },
              },
            }
          : {}),
      },
      select: USER_SAFE_SELECT,
    });

    if (dto.password) {
      await this.emailService.sendAdminCreatedAccountEmail(user.email, user.name ?? 'User', dto.password);
    }

    await this.auditService.log({
      action: 'ADMIN_CREATED_USER', userId: createdByAdminId, targetId: user.id,
      meta: { role: dto.role, email: normalizedEmail },
    });

    return user;
  }

  async adminDeleteUser(targetUserId: string, adminId: string) {
    await this.assertSuperAdmin(adminId);

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot delete another super admin account');
    }

    await this.prisma.user.delete({ where: { id: targetUserId } });
    await this.auditService.log({
      action: 'ADMIN_DELETED_USER', userId: adminId, targetId: targetUserId,
      meta: { deletedEmail: target.email, deletedRole: target.role },
    });

    return { message: 'User permanently deleted' };
  }

  async adminChangeRole(targetUserId: string, newRole: UserRole, adminId: string) {
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
                create: { specialties: [], certifications: [], isVerified: true, isActive: true },
              },
            }
          : {}),
      },
      select: USER_SAFE_SELECT,
    });

    await this.auditService.log({
      action: 'ADMIN_ROLE_CHANGED', userId: adminId, targetId: targetUserId,
      meta: { from: target.role, to: newRole },
    });

    return user;
  }

  async adminToggleUserStatus(targetUserId: string, isActive: boolean, adminId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot deactivate the super admin account');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetUserId }, data: { isActive } }),
      ...(isActive ? [] : [this.prisma.session.deleteMany({ where: { userId: targetUserId } })]),
    ]);

    await this.auditService.log({
      action: isActive ? 'ADMIN_USER_ACTIVATED' : 'ADMIN_USER_DEACTIVATED',
      userId: adminId, targetId: targetUserId,
    });

    return { message: `User ${isActive ? 'activated' : 'deactivated'} successfully` };
  }

  async adminApproveCoach(coachUserId: string, adminId: string, approved: boolean) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachUserId },
      include: { coachProfile: true },
    });

    if (!coach || coach.role !== UserRole.COACH) throw new NotFoundException('Coach not found');
    if (!coach.coachProfile) throw new BadRequestException('Coach profile missing');

    await this.prisma.coachProfile.update({
      where: { userId: coachUserId },
      data: { isVerified: approved, isActive: approved },
    });

    await this.emailService.sendCoachApprovalEmail(coach.email, coach.name ?? 'Coach', approved);

    await this.auditService.log({
      action: approved ? 'ADMIN_COACH_APPROVED' : 'ADMIN_COACH_REJECTED',
      userId: adminId, targetId: coachUserId,
    });

    return { message: `Coach ${approved ? 'approved and activated' : 'rejected'} successfully` };
  }

  async adminUpdatePermissions(targetUserId: string, permissions: string[], adminId: string) {
    await this.assertSuperAdmin(adminId);
    if (permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot grant SUPER_ADMIN permission via this endpoint');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
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
      action: 'ADMIN_PERMISSIONS_UPDATED', userId: adminId, targetId: targetUserId,
      meta: { permissions },
    });

    return updated;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // JWT STRATEGY — called by JwtStrategy.validate()
  // ══════════════════════════════════════════════════════════════════════════

  async validateUser(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, name: true, avatar: true,
        role: true, permissions: true, isPremium: true,
        premiumUntil: true, isActive: true, emailVerified: true,
      },
    });
    if (!user || !user.isActive) return null;
    return { ...user, sessionId: payload.sessionId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async createSession(userId: string, deviceInfo?: string, ipAddress?: string) {
    const sessionCount = await this.prisma.session.count({ where: { userId } });
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      const oldest = await this.prisma.session.findFirst({
        where: { userId }, orderBy: { lastActiveAt: 'asc' },
      });
      if (oldest) await this.prisma.session.delete({ where: { id: oldest.id } });
    }

    const session = await this.prisma.session.create({
      data: {
        userId,
        token: crypto.randomBytes(32).toString('hex'),
        deviceInfo, ipAddress,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: USER_SAFE_SELECT,
    });
    if (!user) throw new UnauthorizedException('User not found');

    return {
      accessToken:  this.generateAccessToken(user, session.id),
      refreshToken: this.generateRefreshToken(userId, session.id),
      sessionId:    session.id,
      user,
    };
  }

  private generateAccessToken(user: any, sessionId: string): string {
    return this.jwtService.sign(
      {
        sub: user.id, email: user.email, role: user.role,
        permissions: user.permissions ?? [], isPremium: user.isPremium, sessionId,
      },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  private generateRefreshToken(userId: string, sessionId: string): string {
    return this.jwtService.sign(
      { sub: userId, sessionId, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_EXPIRY, secret: this.config.get<string>('JWT_SECRET') },
    );
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id, email: user.email, name: user.name,
      avatar: user.avatar, role: user.role,
      permissions: user.permissions ?? [], isPremium: user.isPremium,
    };
  }

  // ── Brute-force helpers ───────────────────────────────────────────────────

  /**
   * Throws 401 if >= MAX_LOGIN_ATTEMPTS failed within LOCK_DURATION_MS.
   * Synchronous — zero DB queries.
   */
private checkAccountLock(userId: string): void {
  const record = failMap.get(userId);
  
  // Early return + extra safety
  if (!record || !record.firstFailAt || typeof record.count !== 'number') {
    return;
  }

  const elapsed = Date.now() - record.firstFailAt;

  if (elapsed > LOCK_DURATION_MS) {
    failMap.delete(userId);
    return;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const minutesLeft = Math.ceil((LOCK_DURATION_MS - elapsed) / 60000);
    throw new UnauthorizedException(
      `Too many failed attempts. Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
    );
  }
}

  private recordFailedLogin(userId: string): void {
    const existing = failMap.get(userId);
    if (!existing) {
      failMap.set(userId, { count: 1, firstFailAt: Date.now() });
      return;
    }
    if (Date.now() - existing.firstFailAt > LOCK_DURATION_MS) {
      failMap.set(userId, { count: 1, firstFailAt: Date.now() });
      return;
    }
    failMap.set(userId, { count: existing.count + 1, firstFailAt: existing.firstFailAt });
  }

  private clearFailedLoginAttempts(userId: string): void {
    failMap.delete(userId);
  }

  private async assertSuperAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId }, select: { permissions: true },
    });
    if (!admin?.permissions.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only the super admin can perform this action');
    }
  }

  private async notifyAdminsNewCoach(coachEmail: string, coachName: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { email: true, name: true },
    });
    await Promise.allSettled(
      admins.map((a) => this.emailService.sendNewCoachRegisteredEmail(a.email, coachEmail, coachName)),
    );
  }
}