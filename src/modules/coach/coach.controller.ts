// src/coach/coach.controller.ts
//
// TWO controllers in one file:
//   CoachController      — routes for authenticated COACH users  (prefix: /coach)
//   ClientCoachController — routes for authenticated CLIENT users (prefix: /client)
//   PublicCoachController — public routes (invitation acceptance) (prefix: /invite)

import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CoachService } from './coach.service';
import { UserRole } from '@prisma/client';
import {
  CreateAvailabilitySlotDto, AvailabilityQueryDto,
  BookSessionDto, UpdateSessionStatusDto, SessionQueryDto,
  GenerateInvitationDto, AcceptInvitationDto,
  SubmitParqDto, ReviewParqDto,
  SetupClientProfileDto,
  CreateBodyDimensionDto, UpdateBodyDimensionDto, BodyDimensionQueryDto,
  UpdateReminderPreferencesDto,
} from './dto/coach.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// ════════════════════════════════════════════════════════════════════════════
// COACH ROUTES — /coach/...
// Requires role: COACH
// ════════════════════════════════════════════════════════════════════════════
@Controller('coach')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COACH)
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────

  /**
   * GET /api/v1/coach/dashboard
   * Returns: totalClients, todaySessions, upcomingSessions, pendingParqCount, todaySchedule
   * Used by: Coach home screen
   */
  @Get('dashboard')
  getDashboard(@CurrentUser() user: any) {
    return this.coachService.getCoachDashboard(user.id);
  }

  // ── Availability ───────────────────────────────────────────────────────

  /**
   * POST /api/v1/coach/availability
   * Body: { date, startTime, endTime, gymName?, location? }
   * Creates a new bookable time slot.
   * Used by: "Add Slot" form in Availability Calendar screen
   */
  @Post('availability')
  @HttpCode(HttpStatus.CREATED)
  createSlot(@CurrentUser() user: any, @Body() dto: CreateAvailabilitySlotDto) {
    return this.coachService.createAvailabilitySlot(user.id, dto);
  }

  /**
   * GET /api/v1/coach/availability
   * Query: from?, to?, includeBooked?
   * Returns: { slots[], grouped: { "2026-01-08": [...] } }
   * Used by: Availability Calendar screen (left panel)
   */
  @Get('availability')
  getAvailability(@CurrentUser() user: any, @Query() query: AvailabilityQueryDto) {
    return this.coachService.getCoachAvailability(user.id, query);
  }

  /**
   * DELETE /api/v1/coach/availability/:slotId
   * Deletes an unbooked slot. Throws 400 if slot is already booked.
   */
  @Delete('availability/:slotId')
  deleteSlot(@CurrentUser() user: any, @Param('slotId') slotId: string) {
    return this.coachService.deleteAvailabilitySlot(user.id, slotId);
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  /**
   * GET /api/v1/coach/sessions
   * Query: status?, from?, to?, page?, limit?
   * Returns paginated sessions with client info and PAR-Q status badge.
   * Used by: Coach calendar + client list "All Schedules"
   */
  @Get('sessions')
  getSessions(@CurrentUser() user: any, @Query() query: SessionQueryDto) {
    return this.coachService.getCoachSessions(user.id, query);
  }

  /**
   * PATCH /api/v1/coach/sessions/:sessionId/status
   * Body: { status: "CONFIRMED"|"DECLINED"|"COMPLETED"|"CANCELLED", notes? }
   * Handles state machine: REQUESTED→CONFIRMED, CONFIRMED→COMPLETED, etc.
   * Notifies client on status change.
   */
  @Patch('sessions/:sessionId/status')
  updateSessionStatus(
    @CurrentUser() user: any,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionStatusDto,
  ) {
    return this.coachService.updateSessionStatus(user.id, sessionId, dto);
  }

  // ── Client Management ──────────────────────────────────────────────────

  /**
   * GET /api/v1/coach/clients
   * Returns all clients with PAR-Q badge status (APPROVED/PENDING_REVIEW/NOT_SUBMITTED).
   * Used by: "All Schedules" / Clients screen
   */
  @Get('clients')
  getClients(@CurrentUser() user: any) {
    return this.coachService.getCoachClients(user.id);
  }

  /**
   * GET /api/v1/coach/clients/:clientProfileId
   * Full detail: sessions, PAR-Q submissions, body dimension history.
   */
  @Get('clients/:clientProfileId')
  getClientDetails(
    @CurrentUser() user: any,
    @Param('clientProfileId') clientProfileId: string,
  ) {
    return this.coachService.getClientDetails(user.id, clientProfileId);
  }

  // ── Invitation ─────────────────────────────────────────────────────────

  /**
   * POST /api/v1/coach/invitations
   * Body: { expiryDays? }
   * Generates unique code + shareable link. One-time use, expires in 30 days.
   * Used by: "Invite Client" → "Generate Invite" button
   */
  @Post('invitations')
  @HttpCode(HttpStatus.CREATED)
  generateInvitation(@CurrentUser() user: any, @Body() dto: GenerateInvitationDto) {
    return this.coachService.generateInvitation(user.id, dto);
  }

  /**
   * GET /api/v1/coach/invitations
   * Returns all invitations with usage status.
   */
  @Get('invitations')
  getInvitations(@CurrentUser() user: any) {
    return this.coachService.getCoachInvitations(user.id);
  }

  // ── PAR-Q Review ───────────────────────────────────────────────────────

  /**
   * GET /api/v1/coach/parq/pending
   * Returns all PAR-Q submissions waiting for coach review.
   * Used by: "PAR-Q Submissions" card on dashboard (shows count badge)
   */
  @Get('parq/pending')
  getPendingParq(@CurrentUser() user: any) {
    return this.coachService.getPendingParqSubmissions(user.id);
  }

  /**
   * GET /api/v1/coach/parq/:submissionId
   * Full PAR-Q detail with all health answers.
   * Used by: Par-Q Review screen (right side screens in image 8)
   */
  @Get('parq/:submissionId')
  getParqDetail(
    @CurrentUser() user: any,
    @Param('submissionId') submissionId: string,
  ) {
    return this.coachService.getParqDetail(user.id, submissionId);
  }

  /**
   * PATCH /api/v1/coach/parq/:submissionId/review
   * Body: { approved: true/false, notes? }
   * Approve → client.status = ACTIVE (can book sessions)
   * Reject  → client stays PENDING_PAR_Q, notified
   */
  @Patch('parq/:submissionId/review')
  reviewParq(
    @CurrentUser() user: any,
    @Param('submissionId') submissionId: string,
    @Body() dto: ReviewParqDto,
  ) {
    return this.coachService.reviewParq(user.id, submissionId, dto);
  }

  // ── Body Dimensions (Coach views client data) ──────────────────────────

  /**
   * GET /api/v1/coach/body-dimensions
   * Returns body dimension history for ALL clients.
   * Used by: "Body Dimension Tracker — All Clients" screen (image 10)
   */
  @Get('body-dimensions')
  getAllClientsBodyDimensions(@CurrentUser() user: any) {
    return this.coachService.getClientsBodyDimensions(user.id);
  }

  /**
   * GET /api/v1/coach/body-dimensions/:clientProfileId
   * Query: from?, to?, page?, limit?
   * One client's body dimension history.
   */
  @Get('body-dimensions/:clientProfileId')
  getClientBodyDimensions(
    @CurrentUser() user: any,
    @Param('clientProfileId') clientProfileId: string,
    @Query() query: BodyDimensionQueryDto,
  ) {
    return this.coachService.getClientBodyDimensions(user.id, clientProfileId, query);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CLIENT ROUTES — /client/...
// Requires: any authenticated user who has a ClientProfile
// ════════════════════════════════════════════════════════════════════════════
@Controller('client')
@UseGuards(JwtAuthGuard)
export class ClientCoachController {
  constructor(private readonly coachService: CoachService) {}

  // ── Profile Setup ──────────────────────────────────────────────────────

  /**
   * PATCH /api/v1/client/profile
   * Body: { name?, age?, phoneNumber?, avatarUrl?, gender? }
   * First screen after accepting invite: "Complete Your Profile"
   */
  @Patch('profile')
  setupProfile(@CurrentUser() user: any, @Body() dto: SetupClientProfileDto) {
    return this.coachService.setupClientProfile(user.id, dto);
  }

  /**
   * GET /api/v1/client/coach
   * Returns current coach info + upcoming sessions.
   * Used by: Client home screen "Book a Session" with coach name shown
   */
  @Get('coach')
  getMyCoach(@CurrentUser() user: any) {
    return this.coachService.getMyCoachInfo(user.id);
  }

  // ── PAR-Q ──────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/client/parq
   * Body: full PAR-Q form with all health questions + signature
   * Required before booking sessions.
   * Used by: PAR-Q form screen (image 2)
   */
  @Post('parq')
  @HttpCode(HttpStatus.CREATED)
  submitParq(@CurrentUser() user: any, @Body() dto: SubmitParqDto) {
    return this.coachService.submitParq(user.id, dto);
  }

  /**
   * GET /api/v1/client/parq
   * Returns client's PAR-Q submission history.
   */
  @Get('parq')
  getParqHistory(@CurrentUser() user: any) {
    return this.coachService.getClientParqHistory(user.id);
  }

  // ── Session Booking ────────────────────────────────────────────────────

  /**
   * GET /api/v1/client/coach/availability
   * Query: from?, to?
   * Returns available (unbooked) slots from client's coach, grouped by date.
   * Used by: "Available Time Slots" section in Book a Session screen
   */
  @Get('coach/availability')
  getCoachAvailability(@CurrentUser() user: any, @Query() query: AvailabilityQueryDto) {
    // We need the client's coachId first — resolved inside service
    return this.coachService.getMyCoachInfo(user.id).then(async (info) => {
      return this.coachService.getCoachPublicAvailability(info.coach.id, query);
    });
  }

  /**
   * POST /api/v1/client/sessions/book
   * Body: { availabilityId, sessionType?, notes? }
   * Books a time slot. Fails if PAR-Q not approved.
   * Used by: "Confirm Booking" button in time slot picker
   */
  @Post('sessions/book')
  @HttpCode(HttpStatus.CREATED)
  bookSession(@CurrentUser() user: any, @Body() dto: BookSessionDto) {
    return this.coachService.bookSession(user.id, dto);
  }

  /**
   * POST /api/v1/client/sessions/:availabilityId/confirm
   * Confirms a session the client has requested.
   */
  @Post('sessions/:availabilityId/confirm')
  @HttpCode(HttpStatus.OK)
  confirmSession(
    @CurrentUser() user: any,
    @Param('availabilityId') availabilityId: string,
  ) {
    return this.coachService.confirmSessionBooking(user.id, availabilityId);
  }

  // ── Body Dimensions ────────────────────────────────────────────────────

  /**
   * POST /api/v1/client/body-dimensions
   * Body: { date, weight?, height?, waist?, leg?, arm?, bodyFatPercent?, weightUnit?, measureUnit? }
   * Used by: "Body Dimensions Tracker" screen (initial setup in image 1 + update in image 10)
   */
  @Post('body-dimensions')
  @HttpCode(HttpStatus.CREATED)
  createBodyDimension(@CurrentUser() user: any, @Body() dto: CreateBodyDimensionDto) {
    return this.coachService.createBodyDimension(user.id, dto);
  }

  /**
   * PATCH /api/v1/client/body-dimensions/:id
   * Body: any body dimension fields (partial update)
   * Used by: "Update Body Dimension" button in client detail screen
   */
  @Patch('body-dimensions/:id')
  updateBodyDimension(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateBodyDimensionDto,
  ) {
    return this.coachService.updateBodyDimension(user.id, id, dto);
  }

  /**
   * GET /api/v1/client/body-dimensions
   * Query: from?, to?, page?, limit?
   * Client's own measurement history.
   * Used by: "Measurement Progress" screen (image 3)
   */
  @Get('body-dimensions')
  getBodyDimensions(@CurrentUser() user: any, @Query() query: BodyDimensionQueryDto) {
    return this.coachService.getMyBodyDimensions(user.id, query);
  }

  // ── Reminders ──────────────────────────────────────────────────────────

  /**
   * GET /api/v1/client/reminders
   * Returns upcoming sessions formatted for the Reminders calendar screen.
   */
  @Get('reminders')
  async getReminders(@CurrentUser() user: any) {
    const info = await this.coachService.getMyCoachInfo(user.id);
    return {
      upcomingSessions: info.upcomingSessions,
    };
  }

  /**
   * GET /api/v1/client/reminders/preferences
   * Returns push/email/SMS reminder toggle preferences.
   * Used by: "Reminder Preferences" screen (image 4 right)
   */
  @Get('reminders/preferences')
  getReminderPreferences(@CurrentUser() user: any) {
    return this.coachService.getReminderPreferences(user.id);
  }

  /**
   * PATCH /api/v1/client/reminders/preferences
   * Body: { pushNotifications?, emailReminders?, smsReminders? }
   * Used by: toggle switches in Reminder Preferences screen
   */
  @Patch('reminders/preferences')
  updateReminderPreferences(
    @CurrentUser() user: any,
    @Body() dto: UpdateReminderPreferencesDto,
  ) {
    return this.coachService.updateReminderPreferences(user.id, dto);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES — /invite/...
// No auth required — invitation acceptance flow
// ════════════════════════════════════════════════════════════════════════════
@Controller('invite')
export class PublicCoachController {
  constructor(private readonly coachService: CoachService) {}

  /**
   * GET /api/v1/invite/:code
   * Preview invitation details before accepting.
   * Lets the app show "You're invited to join [CoachName]" screen.
   */
  @Get(':code')
  async previewInvitation(@Param('code') code: string) {
    const invitation = await this.coachService['prisma'].coachInvitation.findUnique({
      where: { code },
      include: {
        coach: {
          include: {
            user: { select: { name: true, avatar: true } },
          },
        },
      },
    });
    if (!invitation) throw new Error('Invitation not found');
    if (invitation.isUsed) return { valid: false, reason: 'This invitation has already been used.' };
    if (invitation.expiresAt < new Date()) return { valid: false, reason: 'This invitation has expired.' };

    return {
      valid: true,
      coachName:   invitation.coach.user.name,
      coachAvatar: invitation.coach.user.avatar,
      gymName:     invitation.coach.gymName,
      expiresAt:   invitation.expiresAt,
    };
  }

  /**
   * POST /api/v1/invite/accept
   * Body: { code, name?, email?, password? (if new user) }
   *
   * TWO PATHS:
   *   1. Existing logged-in user — send JWT, no name/email/password needed
   *   2. New user — provide name + email + password to create account inline
   *
   * After success:
   *   - ClientProfile created with status=PENDING_PAR_Q
   *   - Returns { nextStep: "SUBMIT_PAR_Q" }
   */
  @Post('accept')
  @UseGuards() // No guard — public endpoint
  @HttpCode(HttpStatus.CREATED)
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    // No existingUserId here — new user flow only
    // For logged-in users: use POST /api/v1/invite/accept-authenticated
    return this.coachService.acceptInvitation(dto);
  }

  /**
   * POST /api/v1/invite/accept-authenticated
   * For an EXISTING logged-in user joining a coach.
   * Requires JWT. No name/email/password needed — already have an account.
   */
  @Post('accept-authenticated')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  acceptInvitationAuthenticated(
    @CurrentUser() user: any,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.coachService.acceptInvitation(dto, user.id);
  }
}