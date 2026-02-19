import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

// ── DTOs ────────────────────────────────────────────────────────────────────
import { RegisterDto } from './dto/register.dto';

import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

import { LogoutDto } from './dto/logout.dto';
import { CoachRegisterDto } from './dto/coach-register.dto';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { AdminCreateUserDto } from './dto/admin0create-user.dto';
import { AdminApproveCoachDto, AdminChangeRoleDto, AdminToggleStatusDto } from './dto/admin-change-role.dto';
import { AdminUpdatePermissionsDto } from './dto/admin-update-permissions.dto';
import { SuperAdminGuard } from 'src/common/guards/super-admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC — Registration
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/register
   * Standard user signup with email + password.
   * Creates FREE subscription. Sends verification email.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') deviceInfo?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.register(dto, deviceInfo, ipAddress);
  }

  /**
   * POST /api/v1/auth/register/coach
   * Coach registration — account inactive until admin approves.
   * Coach must verify email first, then admin reviews + approves.
   */
  @Post('register/coach')
  @HttpCode(HttpStatus.CREATED)
  registerCoach(
    @Body() dto: CoachRegisterDto,
    @Headers('user-agent') deviceInfo?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.registerCoach(dto, deviceInfo, ipAddress);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC — Login
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/login
   * Email + password login.
   * Protected: 5 failed attempts → 15 min account lock.
   * Timing-safe: dummy hash prevents user enumeration.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') deviceInfo?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.login(dto, deviceInfo, ipAddress);
  }

  /**
   * POST /api/v1/auth/google
   * Firebase Google ID token login. Upserts user automatically.
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  /**
   * POST /api/v1/auth/apple
   * Apple Sign-In via Firebase. Email sent only on first login.
   */
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  appleLogin(@Body() dto: AppleLoginDto) {
    return this.authService.appleLogin(dto);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC — Token management
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/refresh
   * Rotate access + refresh tokens. Session DB-validated.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC — Email verification
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/verify/request
   * Resend email verification link. No user enumeration.
   */
  @Post('verify/request')
  @HttpCode(HttpStatus.OK)
  requestEmailVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestEmailVerification(dto.email);
  }

  /**
   * POST /api/v1/auth/verify
   * Confirm email address with token from link. Sends welcome email.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC — Password reset
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/password/forgot
   * Send password reset link via email. No user enumeration.
   */
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  /**
   * POST /api/v1/auth/password/reset
   * Reset password with token from email link.
   * Revokes ALL sessions on success (security).
   */
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PROTECTED — Any authenticated user
  // ════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/auth/me
   * Returns current user from JWT. Fastest identity check.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      permissions: user.permissions ?? [],
      isPremium: user.isPremium,
      emailVerified: user.emailVerified,
    };
  }

  /**
   * POST /api/v1/auth/logout
   * Revoke current session (single device logout).
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: any, @Body() dto: LogoutDto) {
    return this.authService.logout(dto.sessionId, user.id);
  }

  /**
   * POST /api/v1/auth/logout/all
   * Revoke ALL sessions — logs out from every device immediately.
   */
  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.id);
  }

  /**
   * POST /api/v1/auth/password/change
   * Change password while logged in. Requires current password.
   */
  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PROTECTED — Session / device management
  // ════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/auth/sessions
   * List all active sessions (devices) for the current user.
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  getMySessions(@CurrentUser() user: any) {
    return this.authService.getMySessions(user.id);
  }

  /**
   * DELETE /api/v1/auth/sessions/:sessionId
   * Remotely revoke a specific session (kick a device).
   */
  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  // ════════════════════════════════════════════════════════════════════════
  // SUPER ADMIN — One-time bootstrap
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/super-admin/bootstrap
   * One-time super admin creation. Requires SUPERADMIN_BOOTSTRAP_KEY env var.
   * Disabled automatically once super admin exists or if env key is removed.
   */
  @Post('super-admin/bootstrap')
  @HttpCode(HttpStatus.CREATED)
  bootstrapSuperAdmin(@Body() dto: BootstrapSuperAdminDto) {
    return this.authService.bootstrapSuperAdmin(dto);
  }

  // ════════════════════════════════════════════════════════════════════════
  // ADMIN — User management
  // ════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/auth/admin/users
   * Admin creates a new user (USER / COACH / MODERATOR / SUPPORT).
   * Creating ADMIN role requires SUPER_ADMIN.
   */
  @Post('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  adminCreateUser(@CurrentUser() admin: any, @Body() dto: AdminCreateUserDto) {
    return this.authService.adminCreateUser(dto, admin.id);
  }

  /**
   * DELETE /api/v1/auth/admin/users/:userId
   * Permanently delete any user. SUPER_ADMIN only.
   */
  @Delete('admin/users/:userId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  adminDeleteUser(@CurrentUser() admin: any, @Param('userId') userId: string) {
    return this.authService.adminDeleteUser(userId, admin.id);
  }

  /**
   * PATCH /api/v1/auth/admin/users/:userId/role
   * Change a user's role. Assigning ADMIN requires SUPER_ADMIN.
   */
  @Patch('admin/users/:userId/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminChangeRole(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body() dto: AdminChangeRoleDto,
  ) {
    return this.authService.adminChangeRole(userId, dto.role, admin.id);
  }

  /**
   * PATCH /api/v1/auth/admin/users/:userId/status
   * Activate or deactivate a user.
   * Deactivating kills all active sessions immediately.
   */
  @Patch('admin/users/:userId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminToggleStatus(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body() dto: AdminToggleStatusDto,
  ) {
    return this.authService.adminToggleUserStatus(userId, dto.isActive, admin.id);
  }

  /**
   * PATCH /api/v1/auth/admin/coaches/:userId/approve
   * Approve or reject a coach registration.
   * Coach is notified by email.
   */
  @Patch('admin/coaches/:userId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminApproveCoach(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body() dto: AdminApproveCoachDto,
  ) {
    return this.authService.adminApproveCoach(userId, admin.id, dto.approved);
  }

  /**
   * PATCH /api/v1/auth/admin/users/:userId/permissions
   * Update a user's permissions array. SUPER_ADMIN only.
   * Cannot grant SUPER_ADMIN permission.
   */
  @Patch('admin/users/:userId/permissions')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  adminUpdatePermissions(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body() dto: AdminUpdatePermissionsDto,
  ) {
    return this.authService.adminUpdatePermissions(userId, dto.permissions, admin.id);
  }
}

// import {
//   Controller,
//   Post,
//   Body,
//   UseGuards,
//   Get,
//   HttpCode,
//   HttpStatus,
//   Headers,
//   UnauthorizedException,
//   BadRequestException,
// } from '@nestjs/common';
// import { AuthService } from './auth.service';
// import { RegisterDto } from './dto/register.dto';
// import { LoginDto } from './dto/login.dto';
// import { GoogleLoginDto } from './dto/google-login.dto';
// import { AppleLoginDto } from './dto/apple-login.dto';
// import { RefreshTokenDto } from './dto/refresh-token.dto';
// import { VerifyEmailDto } from './dto/verify-email.dto';
// import { ForgotPasswordDto } from './dto/forgot-password.dto';
// import { ResetPasswordDto } from './dto/reset-password.dto';

// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';
// import { ChangePasswordDto } from './dto/change-password.dto';

// @Controller('auth')
// export class AuthController {
//   constructor(private readonly authService: AuthService) {}

//   @Post('register')
//   @HttpCode(HttpStatus.CREATED)
//   async register(
//     @Body() registerDto: RegisterDto,
//     @Headers('user-agent') deviceInfo?: string,
//     @Headers('x-forwarded-for') ipAddress?: string,
//   ) {
//     return this.authService.register(registerDto, deviceInfo, ipAddress);
//   }

//   @Post('login')
//   @HttpCode(HttpStatus.OK)
//   async login(
//     @Body() loginDto: LoginDto,
//     @Headers('user-agent') deviceInfo?: string,
//     @Headers('x-forwarded-for') ipAddress?: string,
//   ) {
//     return this.authService.login(loginDto, deviceInfo, ipAddress);
//   }

//   @Post('google')
//   @HttpCode(HttpStatus.OK)
//   async googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
//     return this.authService.googleLogin(googleLoginDto);
//   }

//   @Post('apple')
//   @HttpCode(HttpStatus.OK)
//   async appleLogin(@Body() appleLoginDto: AppleLoginDto) {
//     return this.authService.appleLogin(appleLoginDto);
//   }

//   @Post('refresh')
//   @HttpCode(HttpStatus.OK)
//   async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
//     return this.authService.refreshToken(refreshTokenDto.refreshToken);
//   }

//   @Post('verify/request')
//   @HttpCode(HttpStatus.OK)
//   async requestEmailVerification(@Body() forgotPasswordDto: ForgotPasswordDto) {
//     return this.authService.requestEmailVerification(forgotPasswordDto.email);
//   }

//   @Post('verify')
//   @HttpCode(HttpStatus.OK)
//   async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
//     return this.authService.verifyEmail(verifyEmailDto.token);
//   }

//   @Post('password/forgot')
//   @HttpCode(HttpStatus.OK)
//   async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
//     return this.authService.requestPasswordReset(forgotPasswordDto.email);
//   }

//   @Post('password/reset')
//   @HttpCode(HttpStatus.OK)
//   async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
//     return this.authService.resetPassword(
//       resetPasswordDto.token,
//       resetPasswordDto.newPassword,
//     );
//   }

//   @Post('password/change')
//   @UseGuards(JwtAuthGuard)
//   @HttpCode(HttpStatus.OK)
//   async changePassword(
//     @CurrentUser() user: any,
//     @Body() changePasswordDto: ChangePasswordDto,
//   ) {
//     return this.authService.changePassword(
//       user.id,
//       changePasswordDto.oldPassword,
//       changePasswordDto.newPassword,
//     );
//   }

// //   @Post('logout')
// //   @UseGuards(JwtAuthGuard)
// //   @HttpCode(HttpStatus.OK)
// //   async logout(
// //     @CurrentUser() user: any,
// //     @Body() logoutDto: LogoutDto,
// //   ) {
// //     return this.authService.logout(logoutDto.sessionId || '', user.id);
// //   }

//   @Get('me')
//   @UseGuards(JwtAuthGuard)
//   async getProfile(@CurrentUser() user: any) {
//     return {
//       id: user.id,
//       email: user.email,
//       name: user.name,
//       role: user.role,
//       isPremium: user.isPremium,
//       avatar: user.avatar,
//       emailVerified: user.emailVerified,
//       createdAt: user.createdAt,
//     };
//   }
// }