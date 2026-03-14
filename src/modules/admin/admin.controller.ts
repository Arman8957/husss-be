// // src/modules/admin/admin.controller.ts
// import {
//   Controller,
//   Get,
//   Post,
//   Patch,
//   Put,
//   Delete,
//   Body,
//   Param,
//   Query,
//   UseGuards,
//   HttpCode,
//   HttpStatus,
//   ParseBoolPipe,
//   ParseIntPipe,
//   ParseUUIDPipe,
//   Optional,
// } from '@nestjs/common';
// import {
//   ApiTags,
//   ApiBearerAuth,
//   ApiOperation,
//   ApiResponse,
//   ApiQuery,
//   ApiParam,
// } from '@nestjs/swagger';
// import { AdminService } from './admin.service';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { RolesGuard } from '../../common/guards/roles.guard';
// import { Roles } from '../../common/decorators/roles.decorator';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';
// import { UserRole } from '@prisma/client';

// // ─── Role sets ────────────────────────────────────────────────────────────────
// // SuperAdmin + Admin + Moderator: all admin endpoints
// // SuperAdmin + Admin only: destructive operations (delete, refund, roles)
// // SuperAdmin only: user role promotion to admin/superadmin
// // ─────────────────────────────────────────────────────────────────────────────

// @ApiTags('🛡️ Admin Panel')
// @ApiBearerAuth('JWT-auth')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('admin')
// export class AdminController {
//   constructor(private readonly adminService: AdminService) {}

//   // ══════════════════════════════════════════════════════════════
//   // DASHBOARD
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/dashboard — main stats + charts + recent activity */
//   @Get('dashboard')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Admin dashboard: stats, revenue charts, top programs, recent activity' })
//   getDashboard() {
//     return this.adminService.getDashboard();
//   }

//   /** POST /api/v1/admin/analytics/snapshot — upsert today's analytics snapshot (call from cron) */
//   @Post('analytics/snapshot')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Upsert daily analytics snapshot (cron trigger)' })
//   snapshotAnalytics() {
//     return this.adminService.snapshotAnalytics();
//   }

//   /** GET /api/v1/admin/analytics/snapshots?days=30 */
//   @Get('analytics/snapshots')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get daily analytics snapshots for the last N days' })
//   @ApiQuery({ name: 'days', required: false, type: Number })
//   getSnapshots(@Query('days') days?: string) {
//     return this.adminService.getAnalyticsSnapshots(days ? parseInt(days) : 30);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // USER MANAGEMENT
//   // ══════════════════════════════════════════════════════════════

//   /**
//    * GET /api/v1/admin/users
//    * Query: page, limit, search, role, isPremium, isActive, sortBy, sortOrder
//    */
//   @Get('users')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List all users (paginated + filterable)' })
//   getUsers(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('search') search?: string,
//     @Query('role') role?: UserRole,
//     @Query('isPremium') isPremium?: string,
//     @Query('isActive') isActive?: string,
//     @Query('sortBy') sortBy?: 'createdAt' | 'lastLoginAt' | 'name' | 'email',
//     @Query('sortOrder') sortOrder?: 'asc' | 'desc',
//   ) {
//     return this.adminService.getUsers({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       search,
//       role,
//       isPremium: isPremium !== undefined ? isPremium === 'true' : undefined,
//       isActive: isActive !== undefined ? isActive === 'true' : undefined,
//       sortBy,
//       sortOrder,
//     });
//   }

//   /** GET /api/v1/admin/users/stats — breakdown by role, provider, growth */
//   @Get('users/stats')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'User statistics breakdown by role, provider, growth' })
//   getUserStats() {
//     return this.adminService.getUserStats();
//   }

//   /** GET /api/v1/admin/users/:id */
//   @Get('users/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get full user detail with subscription, programs, activity' })
//   getUserById(@Param('id') id: string) {
//     return this.adminService.getUserById(id);
//   }

//   /**
//    * PATCH /api/v1/admin/users/:id
//    * Body: { role?, isActive?, isPremium?, premiumUntil?, emailVerified?, name? }
//    */
//   @Patch('users/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @ApiOperation({ summary: 'Update user: role, status, premium, name' })
//   updateUser(
//     @Param('id') id: string,
//     @CurrentUser() admin: any,
//     @Body() dto: {
//       role?: UserRole;
//       isActive?: boolean;
//       isPremium?: boolean;
//       premiumUntil?: string;
//       emailVerified?: boolean;
//       name?: string;
//     },
//   ) {
//     return this.adminService.updateUser(admin.id, id, {
//       ...dto,
//       premiumUntil: dto.premiumUntil ? new Date(dto.premiumUntil) : undefined,
//     });
//   }

//   /** DELETE /api/v1/admin/users/:id — soft delete (deactivates account) */
//   @Delete('users/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Soft-delete user (deactivates, anonymises email)' })
//   deleteUser(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteUser(admin.id, id);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // COACH MANAGEMENT
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/coaches?isVerified=&isActive=&search= */
//   @Get('coaches')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List all coach profiles with client counts' })
//   getCoaches(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('search') search?: string,
//     @Query('isVerified') isVerified?: string,
//     @Query('isActive') isActive?: string,
//   ) {
//     return this.adminService.getCoaches({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       search,
//       isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
//       isActive: isActive !== undefined ? isActive === 'true' : undefined,
//     });
//   }

//   /** PATCH /api/v1/admin/coaches/:id/verify — approve/revoke coach verification */
//   @Patch('coaches/:id/verify')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @ApiOperation({ summary: 'Verify or unverify a coach profile' })
//   verifyCoach(
//     @Param('id') id: string,
//     @CurrentUser() admin: any,
//     @Body() dto: { isVerified: boolean },
//   ) {
//     return this.adminService.verifyCoach(admin.id, id, dto.isVerified);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // PROGRAM MANAGEMENT
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/programs */
//   @Get('programs')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List all programs with analytics' })
//   getPrograms(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('search') search?: string,
//     @Query('isPublished') isPublished?: string,
//     @Query('isPremium') isPremium?: string,
//     @Query('difficulty') difficulty?: string,
//   ) {
//     return this.adminService.getPrograms({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       search,
//       isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
//       isPremium: isPremium !== undefined ? isPremium === 'true' : undefined,
//       difficulty,
//     });
//   }

//   /** GET /api/v1/admin/programs/:id/analytics */
//   @Get('programs/:id/analytics')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get program enrollment, completion, and review analytics' })
//   getProgramAnalytics(@Param('id') id: string) {
//     return this.adminService.getProgramAnalytics(id);
//   }

//   /** PATCH /api/v1/admin/programs/:id */
//   @Patch('programs/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Update program metadata (publish, premium, sort order, etc.)' })
//   updateProgram(
//     @Param('id') id: string,
//     @CurrentUser() admin: any,
//     @Body() dto: any,
//   ) {
//     return this.adminService.updateProgram(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/programs/:id */
//   @Delete('programs/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Hard delete a program (blocked if users have it active)' })
//   deleteProgram(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteProgram(admin.id, id);
//   }

//   /** GET /api/v1/admin/programs/:id/week-locks */
//   @Get('programs/:id/week-locks')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get premium week lock config for a program' })
//   getWeekLocks(@Param('id') id: string) {
//     return this.adminService.getWeekLockConfig(id);
//   }

//   /** POST /api/v1/admin/programs/:id/week-locks — batch upsert */
//   @Post('programs/:id/week-locks')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Batch-save premium week lock config' })
//   saveWeekLocks(
//     @Param('id') id: string,
//     @CurrentUser() admin: any,
//     @Body() dto: { weeks: Array<{ weekNumber: number; isPremiumLock: boolean }> },
//   ) {
//     return this.adminService.saveWeekLockConfig(admin.id, id, dto.weeks);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // EXERCISE LIBRARY
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/exercises */
//   @Get('exercises')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List exercise library with media' })
//   getExercises(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('search') search?: string,
//     @Query('category') category?: string,
//     @Query('primaryMuscle') primaryMuscle?: string,
//     @Query('isPublished') isPublished?: string,
//   ) {
//     return this.adminService.getExercises({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       search,
//       category,
//       primaryMuscle,
//       isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
//     });
//   }

//   /** POST /api/v1/admin/exercises */
//   @Post('exercises')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({ summary: 'Create exercise with optional media' })
//   createExercise(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createExercise(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/exercises/:id */
//   @Patch('exercises/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Update exercise' })
//   updateExercise(
//     @Param('id') id: string,
//     @CurrentUser() admin: any,
//     @Body() dto: any,
//   ) {
//     return this.adminService.updateExercise(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/exercises/:id */
//   @Delete('exercises/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Delete exercise (blocked if in use in programs)' })
//   deleteExercise(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteExercise(admin.id, id);
//   }

//   // ── Training Methods ──────────────────────────────────────────
//   /** GET /api/v1/admin/training-methods */
//   @Get('training-methods')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List all training methods' })
//   getTrainingMethods() {
//     return this.adminService.getTrainingMethods();
//   }

//   /** POST /api/v1/admin/training-methods */
//   @Post('training-methods')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({ summary: 'Create training method' })
//   createTrainingMethod(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createTrainingMethod(admin.id, dto);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // CONTENT MANAGEMENT
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/content/home */
//   @Get('content/home')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get home page content (ordered banners/programs/announcements)' })
//   getHomeContent() {
//     return this.adminService.getHomePageContent();
//   }

//   /** POST /api/v1/admin/content/home */
//   @Post('content/home')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({ summary: 'Add home page content item' })
//   createHomeContent(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createHomePageContent(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/content/home/:id */
//   @Patch('content/home/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Update home page content item' })
//   updateHomeContent(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateHomePageContent(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/content/home/:id */
//   @Delete('content/home/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Delete home page content item' })
//   deleteHomeContent(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteHomePageContent(admin.id, id);
//   }

//   /** PATCH /api/v1/admin/content/home/reorder */
//   @Patch('content/home/reorder')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Reorder home page content items' })
//   reorderHomeContent(
//     @CurrentUser() admin: any,
//     @Body() dto: { items: Array<{ id: string; position: number }> },
//   ) {
//     return this.adminService.reorderHomePageContent(admin.id, dto.items);
//   }

//   // ── Execution Notes ───────────────────────────────────────────
//   /** GET /api/v1/admin/content/execution-notes */
//   @Get('content/execution-notes')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get execution notes/guidelines' })
//   getExecutionNotes() {
//     return this.adminService.getExecutionNotes();
//   }

//   /** POST /api/v1/admin/content/execution-notes */
//   @Post('content/execution-notes')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({ summary: 'Create execution note' })
//   createExecutionNote(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createExecutionNote(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/content/execution-notes/:id */
//   @Patch('content/execution-notes/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Update execution note' })
//   updateExecutionNote(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateExecutionNote(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/content/execution-notes/:id */
//   @Delete('content/execution-notes/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteExecutionNote(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteExecutionNote(admin.id, id);
//   }

//   // ── BFR Content ───────────────────────────────────────────────
//   /** GET /api/v1/admin/content/bfr?category= */
//   @Get('content/bfr')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get BFR content (safety, sessions, research)' })
//   getBFRContent(@Query('category') category?: string) {
//     return this.adminService.getBFRContent(category);
//   }

//   /** POST /api/v1/admin/content/bfr */
//   @Post('content/bfr')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({ summary: 'Create BFR content item' })
//   createBFRContent(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createBFRContent(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/content/bfr/:id */
//   @Patch('content/bfr/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   updateBFRContent(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateBFRContent(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/content/bfr/:id */
//   @Delete('content/bfr/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteBFRContent(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteBFRContent(admin.id, id);
//   }

//   // ── Essential Content ─────────────────────────────────────────
//   /** GET /api/v1/admin/content/essential?category= */
//   @Get('content/essential')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get essential content (Health Foundation articles)' })
//   getEssentialContent(@Query('category') category?: string) {
//     return this.adminService.getEssentialContent(category);
//   }

//   /** POST /api/v1/admin/content/essential */
//   @Post('content/essential')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @HttpCode(HttpStatus.CREATED)
//   createEssentialContent(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createEssentialContent(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/content/essential/:id */
//   @Patch('content/essential/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   updateEssentialContent(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateEssentialContent(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/content/essential/:id */
//   @Delete('content/essential/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteEssentialContent(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteEssentialContent(admin.id, id);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // ESSENTIAL MANAGEMENT
//   // ══════════════════════════════════════════════════════════════

//   // ── Health Markers ────────────────────────────────────────────
//   /** GET /api/v1/admin/essentials/health-markers */
//   @Get('essentials/health-markers')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get health marker groups with markers' })
//   getHealthMarkers() {
//     return this.adminService.getHealthMarkerGroups();
//   }

//   /** POST /api/v1/admin/essentials/health-markers */
//   @Post('essentials/health-markers')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.CREATED)
//   createHealthMarkerGroup(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createHealthMarkerGroup(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/essentials/health-markers/:id */
//   @Patch('essentials/health-markers/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   updateHealthMarkerGroup(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateHealthMarkerGroup(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/essentials/health-markers/:id */
//   @Delete('essentials/health-markers/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteHealthMarkerGroup(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteHealthMarkerGroup(admin.id, id);
//   }

//   // ── Partner Clinics ───────────────────────────────────────────
//   /** GET /api/v1/admin/essentials/clinics */
//   @Get('essentials/clinics')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   getPartnerClinics(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('city') city?: string,
//     @Query('country') country?: string,
//   ) {
//     return this.adminService.getPartnerClinics({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       city,
//       country,
//     });
//   }

//   /** POST /api/v1/admin/essentials/clinics */
//   @Post('essentials/clinics')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.CREATED)
//   createClinic(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createPartnerClinic(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/essentials/clinics/:id */
//   @Patch('essentials/clinics/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   updateClinic(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updatePartnerClinic(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/essentials/clinics/:id */
//   @Delete('essentials/clinics/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteClinic(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deletePartnerClinic(admin.id, id);
//   }

//   // ── Supplement Products ───────────────────────────────────────
//   /** GET /api/v1/admin/essentials/supplements */
//   @Get('essentials/supplements')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   getSupplements(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('category') category?: string,
//   ) {
//     return this.adminService.getSupplementProducts({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       category,
//     });
//   }

//   /** POST /api/v1/admin/essentials/supplements */
//   @Post('essentials/supplements')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.CREATED)
//   createSupplement(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createSupplementProduct(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/essentials/supplements/:id */
//   @Patch('essentials/supplements/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   updateSupplement(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateSupplementProduct(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/essentials/supplements/:id */
//   @Delete('essentials/supplements/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteSupplement(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteSupplementProduct(admin.id, id);
//   }

//   // ── Gyms ──────────────────────────────────────────────────────
//   /** GET /api/v1/admin/essentials/gyms */
//   @Get('essentials/gyms')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   getGyms(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('city') city?: string,
//     @Query('country') country?: string,
//   ) {
//     return this.adminService.getGyms({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       city,
//       country,
//     });
//   }

//   /** POST /api/v1/admin/essentials/gyms */
//   @Post('essentials/gyms')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.CREATED)
//   createGym(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createGym(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/essentials/gyms/:id */
//   @Patch('essentials/gyms/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   updateGym(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateGym(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/essentials/gyms/:id */
//   @Delete('essentials/gyms/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteGym(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteGym(admin.id, id);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // PREMIUM & PAYMENTS
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/premium/plans */
//   @Get('premium/plans')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Get subscription plan configs' })
//   getPlans() {
//     return this.adminService.getSubscriptionPlans();
//   }

//   /** PUT /api/v1/admin/premium/plans — upsert plan config */
//   @Put('premium/plans')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Upsert subscription plan config (create or update by plan type)' })
//   upsertPlan(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.upsertSubscriptionPlan(admin.id, dto);
//   }

//   /** GET /api/v1/admin/premium/payments */
//   @Get('premium/payments')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List payment transactions with revenue summary' })
//   getPayments(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('status') status?: string,
//     @Query('userId') userId?: string,
//     @Query('plan') plan?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//   ) {
//     return this.adminService.getPayments({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       status: status as any,
//       userId,
//       plan: plan as any,
//       from: from ? new Date(from) : undefined,
//       to: to ? new Date(to) : undefined,
//     });
//   }

//   /** GET /api/v1/admin/premium/payments/stats */
//   @Get('premium/payments/stats')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Payment stats breakdown by status, plan, and period' })
//   getPaymentStats() {
//     return this.adminService.getPaymentStats();
//   }

//   /** POST /api/v1/admin/premium/payments/:id/refund */
//   @Post('premium/payments/:id/refund')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Mark payment as refunded' })
//   refundPayment(
//     @Param('id') id: string,
//     @CurrentUser() admin: any,
//     @Body() dto: { refundAmount?: number },
//   ) {
//     return this.adminService.refundPayment(admin.id, id, dto.refundAmount);
//   }

//   // ══════════════════════════════════════════════════════════════
//   // NOTIFICATIONS
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/notifications/templates */
//   @Get('notifications/templates')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List notification templates' })
//   getTemplates() {
//     return this.adminService.getNotificationTemplates();
//   }

//   /** POST /api/v1/admin/notifications/templates */
//   @Post('notifications/templates')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.CREATED)
//   createTemplate(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.createNotificationTemplate(admin.id, dto);
//   }

//   /** PATCH /api/v1/admin/notifications/templates/:id */
//   @Patch('notifications/templates/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'Update/toggle notification template' })
//   updateTemplate(@Param('id') id: string, @CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.updateNotificationTemplate(admin.id, id, dto);
//   }

//   /** DELETE /api/v1/admin/notifications/templates/:id */
//   @Delete('notifications/templates/:id')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   deleteTemplate(@Param('id') id: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteNotificationTemplate(admin.id, id);
//   }

//   /** POST /api/v1/admin/notifications/blast */
//   @Post('notifications/blast')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Send notification blast to audience (immediate or scheduled)' })
//   sendBlast(@CurrentUser() admin: any, @Body() dto: any) {
//     return this.adminService.sendNotificationBlast(admin.id, dto);
//   }

//   /** GET /api/v1/admin/notifications/blasts */
//   @Get('notifications/blasts')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.MODERATOR)
//   @ApiOperation({ summary: 'List notification blast history' })
//   getBlasts(@Query('page') page?: string, @Query('limit') limit?: string) {
//     return this.adminService.getNotificationBlasts({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//     });
//   }

//   // ══════════════════════════════════════════════════════════════
//   // AUDIT LOG
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/audit-log */
//   @Get('audit-log')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @ApiOperation({ summary: 'Admin audit log with admin names enriched' })
//   getAuditLog(
//     @Query('page') page?: string,
//     @Query('limit') limit?: string,
//     @Query('adminUserId') adminUserId?: string,
//     @Query('action') action?: string,
//     @Query('targetType') targetType?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//   ) {
//     return this.adminService.getAuditLog({
//       page: page ? parseInt(page) : 1,
//       limit: limit ? parseInt(limit) : 20,
//       adminUserId,
//       action,
//       targetType,
//       from: from ? new Date(from) : undefined,
//       to: to ? new Date(to) : undefined,
//     });
//   }

//   // ══════════════════════════════════════════════════════════════
//   // APP CONFIG
//   // ══════════════════════════════════════════════════════════════

//   /** GET /api/v1/admin/config?group= */
//   @Get('config')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @ApiOperation({ summary: 'List app config key-value pairs' })
//   getConfig(@Query('group') group?: string) {
//     return this.adminService.getAppConfigs(group);
//   }

//   /** PUT /api/v1/admin/config/:key */
//   @Put('config/:key')
//   @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Upsert app config key' })
//   upsertConfig(
//     @Param('key') key: string,
//     @CurrentUser() admin: any,
//     @Body() dto: { value: string; type?: string; group?: string },
//   ) {
//     return this.adminService.upsertAppConfig(admin.id, key, dto);
//   }

//   /** DELETE /api/v1/admin/config/:key */
//   @Delete('config/:key')
//   @Roles(UserRole.SUPERADMIN)
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({ summary: 'Delete app config key (SuperAdmin only)' })
//   deleteConfig(@Param('key') key: string, @CurrentUser() admin: any) {
//     return this.adminService.deleteAppConfig(admin.id, key);
//   }
// }