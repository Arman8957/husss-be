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
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  FileTypeValidator,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
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
import { memoryStorage } from 'multer';
import {
  AdminApproveCoachDto,
  AdminChangeRoleDto,
  AdminToggleStatusDto,
} from './dto/admin-change-role.dto';
import { AdminUpdatePermissionsDto } from './dto/admin-update-permissions.dto';
import { SuperAdminGuard } from 'src/common/guards/super-admin.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Registration
  // ══════════════════════════════════════════════════════════════════════════

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') deviceInfo?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.register(dto, deviceInfo, ipAddress);
  }

  @Post('register/coach')
  @HttpCode(HttpStatus.CREATED)
  registerCoach(
    @Body() dto: CoachRegisterDto,
    @Headers('user-agent') deviceInfo?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.registerCoach(dto, deviceInfo, ipAddress);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Login
  // ══════════════════════════════════════════════════════════════════════════

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') deviceInfo?: string,
    @Ip() ipAddress?: string,
  ) {
    return this.authService.login(dto, deviceInfo, ipAddress);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  appleLogin(@Body() dto: AppleLoginDto) {
    return this.authService.appleLogin(dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Tokens
  // ══════════════════════════════════════════════════════════════════════════

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Email verification
  // ══════════════════════════════════════════════════════════════════════════

  @Post('verify/request')
  @HttpCode(HttpStatus.OK)
  requestEmailVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestEmailVerification(dto.email);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Password reset
  // ══════════════════════════════════════════════════════════════════════════

  //==================profile  controller for image and phonenumber==========
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update profile',
    description:
      'Update name, phone number, and/or avatar. Send as multipart/form-data.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Profile image (jpg/png/webp, max 5MB)',
        },
        name: {
          type: 'string',
          example: 'John Doe',
        },
        phoneNumber: {
          type: 'string',
          example: '01712345678',
          description: 'Any format: 01712345678 / 1712345678 / +8801712345678',
        },
      },
    },
  })
  @ApiBearerAuth('JWT-auth')
  updateProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addValidator(
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        )
        .addValidator(new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }))
        .build({ fileIsRequired: false }),
    )
    avatarFile?: Express.Multer.File,
  ) {
    return this.authService.updateProfile(user.id, dto, avatarFile);
  }

  //===============================

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROTECTED — Any authenticated user
  // ══════════════════════════════════════════════════════════════════════════

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

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: any, @Body() dto: LogoutDto) {
    return this.authService.logout(dto.sessionId, user.id);
  }

  @Post('logout/all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: any) {
    return this.authService.logoutAll(user.id);
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      user.id,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROTECTED — Session / device management
  // ══════════════════════════════════════════════════════════════════════════

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  getMySessions(@CurrentUser() user: any) {
    return this.authService.getMySessions(user.id);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @CurrentUser() user: any,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC — Super admin bootstrap (one-time setup, no auth guard)
  //
  // HOW TO USE:
  //   Step 1: Add to your .env:
  //             SUPERADMIN_BOOTSTRAP_KEY=some-long-random-secret-string
  //
  //   Step 2: POST /api/v1/auth/super-admin/bootstrap
  //             Body: {
  //               "email": "admin@yourdomain.com",
  //               "password": "StrongPassword123!",
  //               "secretKey": "some-long-random-secret-string"   ← must match .env
  //             }
  //
  //   Step 3: After success — DELETE or ROTATE the key in .env
  //             (endpoint becomes permanently disabled once key is removed)
  //
  // SAFETY RULES (enforced in the service):
  //   - secretKey is compared with crypto.timingSafeEqual (no timing attacks)
  //   - Throws 409 if a super admin already exists (can only run once)
  //   - Throws 403 if SUPERADMIN_BOOTSTRAP_KEY is not set in .env
  // ══════════════════════════════════════════════════════════════════════════

  @Post('super-admin/bootstrap')
  @HttpCode(HttpStatus.CREATED)
  bootstrapSuperAdmin(@Body() dto: BootstrapSuperAdminDto) {
    return this.authService.bootstrapSuperAdmin(dto);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — User management
  // ══════════════════════════════════════════════════════════════════════════

  /** POST /api/v1/auth/admin/users — admin creates a user directly */
  @Post('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  adminCreateUser(@CurrentUser() admin: any, @Body() dto: AdminCreateUserDto) {
    return this.authService.adminCreateUser(dto, admin.id);
  }

  /** DELETE /api/v1/auth/admin/users/:userId — permanently delete user (SUPER_ADMIN only) */
  @Delete('admin/users/:userId')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  adminDeleteUser(@CurrentUser() admin: any, @Param('userId') userId: string) {
    return this.authService.adminDeleteUser(userId, admin.id);
  }

  /** PATCH /api/v1/auth/admin/users/:userId/role — change role (ADMIN→ needs SUPER_ADMIN) */
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

  /** PATCH /api/v1/auth/admin/users/:userId/status — activate or deactivate user */
  @Patch('admin/users/:userId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminToggleStatus(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body() dto: AdminToggleStatusDto,
  ) {
    return this.authService.adminToggleUserStatus(
      userId,
      dto.isActive,
      admin.id,
    );
  }

  /**
   * PATCH /api/v1/auth/admin/coaches/:userId/approve
   * Approve or reject a coach who self-registered via POST /register/coach.
   * Sets coachProfile.isActive = true/false and emails the coach.
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

  /** PATCH /api/v1/auth/admin/users/:userId/permissions — update permissions (SUPER_ADMIN only) */
  @Patch('admin/users/:userId/permissions')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  adminUpdatePermissions(
    @CurrentUser() admin: any,
    @Param('userId') userId: string,
    @Body() dto: AdminUpdatePermissionsDto,
  ) {
    return this.authService.adminUpdatePermissions(
      userId,
      dto.permissions,
      admin.id,
    );
  }
}
