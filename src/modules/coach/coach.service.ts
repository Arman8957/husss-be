import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CreateAvailabilitySlotDto,
  AvailabilityQueryDto,
  BookSessionDto,
  UpdateSessionStatusDto,
  SessionQueryDto,
  GenerateInvitationDto,
  AcceptInvitationDto,
  SubmitParqDto,
  ReviewParqDto,
  SetupClientProfileDto,
  CreateBodyDimensionDto,
  UpdateBodyDimensionDto,
  BodyDimensionQueryDto,
  UpdateReminderPreferencesDto,
  SendInvitationEmailDto,
  UpdateTraineeDto,
  RestrictTraineeDto,
} from './dto/coach.dto';
import { AuthProvider, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/common/email/email.service';

@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // AVAILABILITY SLOTS
  async createAvailabilitySlot(
    coachUserId: string,
    dto: CreateAvailabilitySlotDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const slotDate = new Date(dto.date);
    const startTime = this.buildDateTime(dto.date, dto.startTime);
    const endTime = this.buildDateTime(dto.date, dto.endTime);
    if (startTime >= endTime)
      throw new BadRequestException('End time must be after start time');
    if (startTime < new Date())
      throw new BadRequestException(
        'Cannot create availability slots in the past',
      );
    const overlap = await this.prisma.coachAvailability.findFirst({
      where: {
        coachId: coachProfile.id,
        date: slotDate,
        isBooked: false,
        OR: [
          { startTime: { lte: startTime }, endTime: { gt: startTime } },
          { startTime: { lt: endTime }, endTime: { gte: endTime } },
          { startTime: { gte: startTime }, endTime: { lte: endTime } },
        ],
      },
    });
    if (overlap)
      throw new ConflictException(
        'This time slot overlaps with an existing availability slot',
      );
    return this.prisma.coachAvailability.create({
      data: {
        coachId: coachProfile.id,
        date: slotDate,
        startTime,
        endTime,
        gymName: dto.gymName ?? coachProfile.gymName ?? null,
        location: dto.location ?? coachProfile.gymLocation ?? null,
      },
    });
  }

  async getCoachAvailability(coachUserId: string, query: AvailabilityQueryDto) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const where: any = { coachId: coachProfile.id };
    if (!query.includeBooked) where.isBooked = false;
    if (query.from) where.date = { ...where.date, gte: new Date(query.from) };
    if (query.to) where.date = { ...where.date, lte: new Date(query.to) };
    const slots = await this.prisma.coachAvailability.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        sessions: {
          select: {
            id: true,
            status: true,
            client: {
              select: {
                user: { select: { name: true, email: true, avatar: true } },
              },
            },
          },
        },
      },
    });
    const grouped: Record<string, typeof slots> = {};
    for (const slot of slots) {
      const key = slot.date.toISOString().split('T')[0];
      grouped[key] = grouped[key] ?? [];
      grouped[key].push(slot);
    }
    return { slots, grouped };
  }

  async getCoachPublicAvailability(
    coachProfileId: string,
    query: AvailabilityQueryDto,
  ) {
    const where: any = {
      coachId: coachProfileId,
      isBooked: false,
      startTime: { gt: new Date() },
    };
    if (query.from) where.date = { ...where.date, gte: new Date(query.from) };
    if (query.to) where.date = { ...where.date, lte: new Date(query.to) };
    const slots = await this.prisma.coachAvailability.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        gymName: true,
        location: true,
      },
    });
    const grouped: Record<string, typeof slots> = {};
    for (const slot of slots) {
      const key = slot.date.toISOString().split('T')[0];
      grouped[key] = grouped[key] ?? [];
      grouped[key].push(slot);
    }
    return { grouped };
  }

  async deleteAvailabilitySlot(coachUserId: string, slotId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const slot = await this.prisma.coachAvailability.findFirst({
      where: { id: slotId, coachId: coachProfile.id },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.isBooked)
      throw new BadRequestException(
        'Cannot delete a booked slot. Cancel the session first.',
      );
    await this.prisma.coachAvailability.delete({ where: { id: slotId } });
    return { success: true, message: 'Slot deleted' };
  }

  // BOOK SESSION
  async bookSession(clientUserId: string, dto: BookSessionDto) {
    const clientProfile = await this.getClientProfileOrThrow(clientUserId);
    if (clientProfile.status === 'PENDING_PAR_Q')
      throw new ForbiddenException(
        'You must complete and have your PAR-Q approved before booking sessions.',
      );
    if (clientProfile.status === 'SUSPENDED')
      throw new ForbiddenException(
        'Your access has been restricted by your coach. Please contact them.',
      );
    const slot = await this.prisma.coachAvailability.findFirst({
      where: {
        id: dto.availabilityId,
        coachId: clientProfile.coachId,
        isBooked: false,
      },
    });
    if (!slot)
      throw new NotFoundException('Time slot not found or already booked.');
    const conflicting = await this.prisma.coachSession.findFirst({
      where: {
        clientProfileId: clientProfile.id,
        scheduledAt: slot.startTime,
        status: { in: ['CONFIRMED', 'REQUESTED'] },
      },
    });
    if (conflicting)
      throw new ConflictException('You already have a session at this time.');
    return this.prisma.$transaction(async (tx) => {
      await tx.coachAvailability.update({
        where: { id: slot.id },
        data: { isBooked: true },
      });
      const session = await tx.coachSession.create({
        data: {
          coachId: clientProfile.coachId,
          clientProfileId: clientProfile.id,
          availabilityId: slot.id,
          status: 'REQUESTED',
          sessionType: dto.sessionType ?? 'Training Session',
          scheduledAt: slot.startTime,
          durationMinutes: this.minutesBetween(slot.startTime, slot.endTime),
          notes: dto.notes ?? null,
        },
        include: {
          coach: {
            select: {
              user: { select: { name: true, email: true, avatar: true } },
              gymName: true,
              gymLocation: true,
            },
          },
        },
      });
      await tx.notification.create({
        data: {
          userId: await this.getUserIdFromCoachProfileId(
            tx,
            clientProfile.coachId,
          ),
          type: 'SESSION_REQUESTED',
          title: 'New Session Request',
          body: `A client has requested a session on ${this.formatDate(slot.startTime)}`,
          data: { sessionId: session.id },
        },
      });
      return session;
    });
  }

  async confirmSessionBooking(clientUserId: string, availabilityId: string) {
    const clientProfile = await this.getClientProfileOrThrow(clientUserId);
    const session = await this.prisma.coachSession.findFirst({
      where: {
        availabilityId,
        clientProfileId: clientProfile.id,
        status: 'REQUESTED',
      },
      include: { coach: true },
    });
    if (!session)
      throw new NotFoundException('Session not found or already confirmed');
    return this.prisma.coachSession.update({
      where: { id: session.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  }

  // SESSION MANAGEMENT
  async getCoachSessions(coachUserId: string, query: SessionQueryDto) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const where: any = { coachId: coachProfile.id };
    if (query.status) where.status = query.status;
    if (query.from)
      where.scheduledAt = { ...where.scheduledAt, gte: new Date(query.from) };
    if (query.to)
      where.scheduledAt = { ...where.scheduledAt, lte: new Date(query.to) };
    const [sessions, total] = await Promise.all([
      this.prisma.coachSession.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (query.page! - 1) * query.limit!,
        take: query.limit,
        include: {
          client: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatar: true },
              },
              parqSubmissions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { isApproved: true },
              },
            },
          },
          availability: { select: { gymName: true, location: true } },
        },
      }),
      this.prisma.coachSession.count({ where }),
    ]);
    const now = new Date();
    return {
      data: sessions.map((s) => ({
        ...s,
        hasPendingParQ: s.client.parqSubmissions[0]
          ? !s.client.parqSubmissions[0].isApproved
          : true,
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit!),
        todayCount: sessions.filter((s) => this.isSameDay(s.scheduledAt, now))
          .length,
        upcomingCount: sessions.filter(
          (s) => s.scheduledAt > now && s.status === 'CONFIRMED',
        ).length,
      },
    };
  }

  async updateSessionStatus(
    coachUserId: string,
    sessionId: string,
    dto: UpdateSessionStatusDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const session = await this.prisma.coachSession.findFirst({
      where: { id: sessionId, coachId: coachProfile.id },
      include: { client: { include: { user: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    const allowed: Record<string, string[]> = {
      REQUESTED: ['CONFIRMED', 'DECLINED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      DECLINED: [],
      CANCELLED: [],
    };
    if (!allowed[session.status]?.includes(dto.status))
      throw new BadRequestException(
        `Cannot transition session from ${session.status} to ${dto.status}`,
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.coachSession.update({
        where: { id: sessionId },
        data: {
          status: dto.status as any,
          notes: dto.notes ?? session.notes,
          ...(dto.status === 'CONFIRMED' && { confirmedAt: new Date() }),
          ...(dto.status === 'COMPLETED' && { completedAt: new Date() }),
          ...(dto.status === 'CANCELLED' && { cancelledAt: new Date() }),
        },
      });
      if (dto.status === 'COMPLETED')
        await tx.coachProfile.update({
          where: { id: coachProfile.id },
          data: { totalSessionsHeld: { increment: 1 } },
        });
      if (dto.status === 'CANCELLED' && session.availabilityId)
        await tx.coachAvailability.update({
          where: { id: session.availabilityId },
          data: { isBooked: false },
        });
      const notifMap: Record<string, string> = {
        CONFIRMED: 'Your session has been confirmed!',
        DECLINED: 'Your session request was declined.',
        COMPLETED: 'Your session has been marked as complete.',
        CANCELLED: 'Your session has been cancelled.',
      };
      await tx.notification.create({
        data: {
          userId: session.client.userId,
          type: 'SESSION_CONFIRMED',
          title: `Session ${dto.status}`,
          body:
            notifMap[dto.status] ?? `Session status updated to ${dto.status}`,
          data: { sessionId },
        },
      });
      return updated;
    });
  }

  async getCoachDashboard(coachUserId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const [
      totalClients,
      pendingParqCount,
      todaySessions,
      upcomingSessions,
      thisWeekSessions,
      pendingReviews,
      suspendedCount,
    ] = await Promise.all([
      this.prisma.clientProfile.count({
        where: { coachId: coachProfile.id, status: 'ACTIVE' },
      }),
      this.prisma.parqSubmission.count({
        where: {
          clientProfile: { coachId: coachProfile.id },
          isApproved: false,
        },
      }),
      this.prisma.coachSession.findMany({
        where: {
          coachId: coachProfile.id,
          scheduledAt: { gte: startOfToday, lte: endOfToday },
        },
        include: {
          client: {
            include: {
              user: { select: { name: true, email: true, avatar: true } },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.coachSession.count({
        where: {
          coachId: coachProfile.id,
          status: 'CONFIRMED',
          scheduledAt: { gt: new Date() },
        },
      }),
      this.prisma.coachSession.count({
        where: { coachId: coachProfile.id, scheduledAt: { gte: startOfWeek } },
      }),
      this.prisma.parqSubmission.count({
        where: {
          clientProfile: { coachId: coachProfile.id },
          isApproved: false,
        },
      }),
      this.prisma.clientProfile.count({
        where: { coachId: coachProfile.id, status: 'SUSPENDED' },
      }),
    ]);
    return {
      stats: {
        totalClients,
        todaySessionsCount: todaySessions.length,
        thisWeekSessions,
        upcomingSessions,
        pendingReviews,
        pendingParqCount,
        suspendedCount,
        isApproved: coachProfile.isActive,
      },
      todaySchedule: todaySessions,
    };
  }

  // TRAINEE MANAGEMENT
  async getCoachClients(coachUserId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const clients = await this.prisma.clientProfile.findMany({
      where: { coachId: coachProfile.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phoneNumber: true,
            gender: true,
            age: true,
          },
        },
        parqSubmissions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, isApproved: true, createdAt: true },
        },
        sessions: {
          select: { id: true, status: true, scheduledAt: true },
          orderBy: { scheduledAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return clients.map((c) => ({
      ...c,
      parqStatus: c.parqSubmissions[0]
        ? c.parqSubmissions[0].isApproved
          ? 'APPROVED'
          : 'PENDING_REVIEW'
        : 'NOT_SUBMITTED',
      totalSessions: c.sessions.length,
      upcomingSessions: c.sessions.filter(
        (s) => s.scheduledAt > new Date() && s.status === 'CONFIRMED',
      ).length,
    }));
  }

  async getClientDetails(coachUserId: string, clientProfileId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const client = await this.prisma.clientProfile.findFirst({
      where: { id: clientProfileId, coachId: coachProfile.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            phoneNumber: true,
            gender: true,
            age: true,
          },
        },
        parqSubmissions: { orderBy: { createdAt: 'desc' } },
        sessions: {
          orderBy: { scheduledAt: 'desc' },
          include: {
            availability: { select: { gymName: true, location: true } },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    const bodyDimensions = await this.prisma.bodyDimension.findMany({
      where: { userId: client.userId },
      orderBy: { date: 'desc' },
    });
    return { ...client, bodyDimensions };
  }

  /**
   * Update trainee gym info / notes.
   * PATCH /coach/trainees/:clientProfileId
   */
  async updateTrainee(
    coachUserId: string,
    clientProfileId: string,
    dto: UpdateTraineeDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const client = await this.prisma.clientProfile.findFirst({
      where: { id: clientProfileId, coachId: coachProfile.id },
    });
    if (!client) throw new NotFoundException('Trainee not found');
    return this.prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: {
        ...(dto.gymName !== undefined && { gymName: dto.gymName }),
        ...(dto.gymLocation !== undefined && { gymLocation: dto.gymLocation }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });
  }

  /**
   * Restrict (SUSPENDED) or restore (ACTIVE) a trainee.
   * PATCH /coach/trainees/:clientProfileId/restrict
   */
  async restrictTrainee(
    coachUserId: string,
    clientProfileId: string,
    dto: RestrictTraineeDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const client = await this.prisma.clientProfile.findFirst({
      where: { id: clientProfileId, coachId: coachProfile.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!client) throw new NotFoundException('Trainee not found');
    if (client.status === 'PENDING_PAR_Q' && dto.restrict)
      throw new BadRequestException(
        'Cannot restrict a trainee who is still pending PAR-Q submission.',
      );
    const newStatus = dto.restrict ? 'SUSPENDED' : 'ACTIVE';
    if (client.status === newStatus)
      throw new ConflictException(
        dto.restrict
          ? 'This trainee is already restricted.'
          : 'This trainee is already active.',
      );

    const coachUser = await this.prisma.user.findUnique({
      where: { id: coachUserId },
      select: { name: true },
    });

    await this.prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: { status: newStatus as any },
    });
    await this.prisma.notification.create({
      data: {
        userId: client.user.id,
        type: 'SESSION_CONFIRMED',
        title: dto.restrict ? '🚫 Account Restricted' : '✅ Account Restored',
        body: dto.restrict
          ? `Your coach has restricted your access. ${dto.reason ?? ''}`
          : 'Your coach has restored your access.',
        data: { clientProfileId },
      },
    });
    this.emailService
      .sendTraineeStatusEmail(
        client.user.email,
        client.user.name ?? 'Trainee',
        coachUser?.name ?? 'Your coach',
        dto.restrict,
        dto.reason,
      )
      .catch((err) =>
        this.logger.error('Failed to send trainee status email:', err),
      );

    return {
      success: true,
      message: dto.restrict
        ? `${client.user.name} has been restricted.`
        : `${client.user.name}'s access has been restored.`,
      status: newStatus,
    };
  }

  /**
   * Remove trainee from roster (sets INACTIVE).
   * DELETE /coach/trainees/:clientProfileId
   */
  async removeTrainee(coachUserId: string, clientProfileId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const client = await this.prisma.clientProfile.findFirst({
      where: { id: clientProfileId, coachId: coachProfile.id },
      include: { user: { select: { name: true } } },
    });
    if (!client) throw new NotFoundException('Trainee not found');
    await this.prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: { status: 'INACTIVE' as any },
    });
    await this.prisma.coachProfile.update({
      where: { id: coachProfile.id },
      data: { totalClients: { decrement: 1 } },
    });
    return {
      success: true,
      message: `${client.user.name} has been removed from your roster.`,
    };
  }

  // INVITATION SYSTEM
  async generateInvitation(coachUserId: string, dto: GenerateInvitationDto) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const currentClients = await this.prisma.clientProfile.count({
      where: { coachId: coachProfile.id, status: { not: 'INACTIVE' } },
    });
    const sub = await this.prisma.subscription.findUnique({
      where: { userId: coachUserId },
      select: { maxClients: true, isCoachPremium: true },
    });
    if (sub && sub.maxClients > 0 && currentClients >= sub.maxClients)
      throw new ForbiddenException(
        `You have reached your client limit (${sub.maxClients}). Upgrade your coach subscription to add more clients.`,
      );
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (dto.expiryDays ?? 30));
    const baseUrl =
      process.env.APP_BASE_URL ?? 'https://app.monsterconfusion.com';
    const link = `${baseUrl}/invite/${code}`;
    const invitation = await this.prisma.coachInvitation.create({
      data: { coachId: coachProfile.id, code, link, expiresAt },
    });
    return {
      invitationId: invitation.id,
      code,
      link,
      expiresAt,
      message: 'Share this link or code with your client.',
    };
  }

  /**
   * Send invitation email(s) after generating a code.
   * Detects registered vs unregistered users automatically.
   * POST /coach/invitations/:invitationId/send-email
   * Body: { emails: ["client@email.com"] }
   */
  async sendInvitationEmail(
    coachUserId: string,
    invitationId: string,
    dto: SendInvitationEmailDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const invitation = await this.prisma.coachInvitation.findFirst({
      where: { id: invitationId, coachId: coachProfile.id },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    if (invitation.isUsed)
      throw new BadRequestException('This invitation has already been used.');
    if (invitation.expiresAt < new Date())
      throw new BadRequestException('This invitation has expired.');

    const coachUser = await this.prisma.user.findUnique({
      where: { id: coachUserId },
      select: { name: true },
    });
    const results: { email: string; sent: boolean; isExistingUser: boolean }[] =
      [];

    for (const email of dto.emails) {
      const normalised = email.toLowerCase().trim();
      const existing = await this.prisma.user.findUnique({
        where: { email: normalised },
        select: { id: true },
      });
      const isExistingUser = !!existing;
      const sent = await this.emailService.sendCoachInvitationEmail(
        normalised,
        coachUser?.name ?? 'Your coach',
        coachProfile.gymName ?? null,
        invitation.code,
        invitation.link,
        invitation.expiresAt,
        isExistingUser,
      );
      results.push({ email: normalised, sent, isExistingUser });
    }

    return {
      message: `Invitation sent to ${results.filter((r) => r.sent).length} of ${dto.emails.length} recipient(s).`,
      results,
      code: invitation.code,
      link: invitation.link,
    };
  }

  async getCoachInvitations(coachUserId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    return this.prisma.coachInvitation.findMany({
      where: { coachId: coachProfile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvitation(dto: AcceptInvitationDto, existingUserId?: string) {
    const invitation = await this.prisma.coachInvitation.findUnique({
      where: { code: dto.code },
      include: { coach: { include: { user: true } } },
    });
    if (!invitation)
      throw new NotFoundException(
        'Invitation not found. Please check the code.',
      );
    if (invitation.isUsed)
      throw new BadRequestException('This invitation has already been used.');
    if (invitation.expiresAt < new Date())
      throw new BadRequestException('This invitation has expired.');

    let userId = existingUserId;
    if (!userId) {
      if (!dto.email || !dto.password || !dto.name)
        throw new BadRequestException(
          'Name, email, and password are required to create a new account via invitation.',
        );
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existing)
        throw new ConflictException(
          'An account with this email already exists. Please log in first, then use the invitation link.',
        );
      const passwordHash = await bcrypt.hash(dto.password, 12);
      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          name: dto.name.trim(),
          passwordHash,
          provider: AuthProvider.EMAIL,
          role: UserRole.USER,
          emailVerified: false,
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        },
      });
      userId = newUser.id;
    }

    const existingClient = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });
    if (existingClient)
      throw new ConflictException(
        'You are already connected to a coach. You can only have one coach at a time.',
      );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.coachInvitation.update({
        where: { id: invitation.id },
        data: { isUsed: true, usedBy: userId },
      });
      const clientProfile = await tx.clientProfile.create({
        data: {
          userId: userId!,
          coachId: invitation.coachId,
          status: 'PENDING_PAR_Q',
          invitationId: invitation.id,
          gymName: dto.gymName ?? invitation.coach.gymName ?? null,
          gymLocation: dto.gymLocation ?? invitation.coach.gymLocation ?? null,
        },
      });
      await tx.coachProfile.update({
        where: { id: invitation.coachId },
        data: { totalClients: { increment: 1 } },
      });
      await tx.notification.create({
        data: {
          userId: invitation.coach.userId,
          type: 'SESSION_REQUESTED',
          title: 'New Client Joined',
          body: 'A new client has joined via your invitation link.',
          data: { clientProfileId: clientProfile.id },
        },
      });
      return {
        message:
          'Successfully joined your coach. Please complete the PAR-Q health form before booking sessions.',
        clientProfileId: clientProfile.id,
        coachName: invitation.coach.user.name,
        nextStep: 'SUBMIT_PAR_Q',
      };
    });

    // Email coach: new trainee joined
    const newUserData = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const dashboardUrl = `${process.env.APP_BASE_URL ?? 'https://app.monsterconfusion.com'}/coach/dashboard`;
    this.emailService
      .sendClientJoinedEmail(
        invitation.coach.user.email,
        invitation.coach.user.name ?? 'Coach',
        newUserData?.name ?? 'A new client',
        newUserData?.email ?? '',
        dashboardUrl,
      )
      .catch((err) =>
        this.logger.error('Failed to send client-joined email:', err),
      );

    return result;
  }

  // PAR-Q
  async submitParq(clientUserId: string, dto: SubmitParqDto) {
    const clientProfile = await this.getClientProfileOrThrow(clientUserId);
    const requiresDoctorClearance =
      dto.hasHeartCondition ||
      dto.chestPainDuringActivity ||
      dto.chestPainAtRest ||
      dto.losesBalanceDizziness ||
      dto.hasHighBloodPressure;
    const submission = await this.prisma.parqSubmission.create({
      data: {
        userId: clientUserId,
        clientProfileId: clientProfile.id,
        hasHeartCondition: dto.hasHeartCondition,
        chestPainDuringActivity: dto.chestPainDuringActivity,
        chestPainAtRest: dto.chestPainAtRest,
        losesBalanceDizziness: dto.losesBalanceDizziness,
        hasHighBloodPressure: dto.hasHighBloodPressure,
        doctorLimitedActivity: dto.doctorLimitedActivity,
        hasBoneJointProblem: dto.hasBoneJointProblem,
        takingPrescription: dto.takingPrescription,
        hasOtherReason: dto.hasOtherReason,
        otherReasonDetails: dto.otherReasonDetails ?? null,
        signature: dto.signatureData ?? dto.signatureName,
        signedAt: new Date(),
        isApproved: false,
      },
    });

    const coachUserId = await this.getUserIdFromCoachProfileId(
      this.prisma as any,
      clientProfile.coachId,
    );
    await this.prisma.notification.create({
      data: {
        userId: coachUserId,
        type: 'PAR_Q_REVIEW',
        title: 'New PAR-Q Submission',
        body: 'A client has submitted their health questionnaire for review.',
        data: { parqId: submission.id, clientProfileId: clientProfile.id },
      },
    });

    // Email coach
    const [coachUser, clientUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: coachUserId },
        select: { name: true, email: true },
      }),
      this.prisma.user.findUnique({
        where: { id: clientUserId },
        select: { name: true },
      }),
    ]);
    const dashboardUrl = `${process.env.APP_BASE_URL ?? 'https://app.monsterconfusion.com'}/coach/parq`;
    if (coachUser?.email) {
      this.emailService
        .sendParqSubmittedEmail(
          coachUser.email,
          coachUser.name ?? 'Coach',
          clientUser?.name ?? 'A client',
          dashboardUrl,
        )
        .catch((err) =>
          this.logger.error('Failed to send PAR-Q submitted email:', err),
        );
    }

    return {
      message: requiresDoctorClearance
        ? 'PAR-Q submitted. Your coach will review it. Some answers may require doctor clearance.'
        : 'PAR-Q submitted successfully. Your coach will review and approve it shortly.',
      submissionId: submission.id,
      requiresDoctorClearance,
    };
  }

  async getClientParqHistory(clientUserId: string) {
    const clientProfile = await this.getClientProfileOrThrow(clientUserId);
    return this.prisma.parqSubmission.findMany({
      where: { clientProfileId: clientProfile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewParq(
    coachUserId: string,
    submissionId: string,
    dto: ReviewParqDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const submission = await this.prisma.parqSubmission.findFirst({
      where: { id: submissionId, clientProfile: { coachId: coachProfile.id } },
      include: { clientProfile: true, user: true },
    });
    if (!submission) throw new NotFoundException('PAR-Q submission not found');
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.parqSubmission.update({
        where: { id: submissionId },
        data: { isApproved: dto.approved, reviewedByCoachAt: new Date() },
      });
      if (dto.approved)
        await tx.clientProfile.update({
          where: { id: submission.clientProfileId },
          data: { status: 'ACTIVE' },
        });
      await tx.notification.create({
        data: {
          userId: submission.userId,
          type: 'PAR_Q_REVIEW',
          title: dto.approved
            ? 'PAR-Q Approved ✅'
            : 'PAR-Q Requires Attention',
          body: dto.approved
            ? 'Your health questionnaire has been approved. You can now book sessions!'
            : `Your PAR-Q needs attention. ${dto.notes ?? 'Please contact your coach.'}`,
          data: { parqId: submissionId, approved: dto.approved },
        },
      });
      return {
        ...updated,
        message: dto.approved
          ? 'PAR-Q approved. Client can now book sessions.'
          : 'PAR-Q rejected. Client has been notified.',
      };
    });

    // Email client
    const coachUser = await this.prisma.user.findUnique({
      where: { id: coachUserId },
      select: { name: true },
    });
    this.emailService
      .sendParqReviewedEmail(
        submission.user.email,
        submission.user.name ?? 'there',
        coachUser?.name ?? 'Your coach',
        dto.approved,
        dto.notes,
      )
      .catch((err) =>
        this.logger.error('Failed to send PAR-Q reviewed email:', err),
      );

    return result;
  }

  async getPendingParqSubmissions(coachUserId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    return this.prisma.parqSubmission.findMany({
      where: { clientProfile: { coachId: coachProfile.id }, isApproved: false },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            avatar: true,
            phoneNumber: true,
            gender: true,
          },
        },
        clientProfile: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getParqDetail(coachUserId: string, submissionId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const submission = await this.prisma.parqSubmission.findFirst({
      where: { id: submissionId, clientProfile: { coachId: coachProfile.id } },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            avatar: true,
            phoneNumber: true,
            gender: true,
            age: true,
          },
        },
        clientProfile: { select: { id: true, status: true } },
      },
    });
    if (!submission) throw new NotFoundException('PAR-Q submission not found');
    return submission;
  }

  // BODY DIMENSIONS
  async createBodyDimension(userId: string, dto: CreateBodyDimensionDto) {
    const existing = await this.prisma.bodyDimension.findFirst({
      where: { userId, date: new Date(dto.date) },
    });
    if (existing)
      throw new ConflictException(
        `A measurement for ${dto.date} already exists. Use PATCH to update it.`,
      );
    return this.prisma.bodyDimension.create({
      data: {
        userId,
        date: new Date(dto.date),
        weight: dto.weight ?? null,
        weightUnit: (dto.weightUnit as any) ?? 'KG',
        measureUnit: (dto.measureUnit as any) ?? 'CM',
        height: dto.height ?? null,
        waist: dto.waist ?? null,
        leg: dto.leg ?? null,
        arm: dto.arm ?? null,
        bodyFatPercent: dto.bodyFatPercent ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateBodyDimension(
    userId: string,
    dimensionId: string,
    dto: UpdateBodyDimensionDto,
  ) {
    const bd = await this.prisma.bodyDimension.findFirst({
      where: { id: dimensionId, userId },
    });
    if (!bd) throw new NotFoundException('Measurement not found');
    return this.prisma.bodyDimension.update({
      where: { id: dimensionId },
      data: {
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.weightUnit !== undefined && {
          weightUnit: dto.weightUnit as any,
        }),
        ...(dto.measureUnit !== undefined && {
          measureUnit: dto.measureUnit as any,
        }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.waist !== undefined && { waist: dto.waist }),
        ...(dto.leg !== undefined && { leg: dto.leg }),
        ...(dto.arm !== undefined && { arm: dto.arm }),
        ...(dto.bodyFatPercent !== undefined && {
          bodyFatPercent: dto.bodyFatPercent,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async getMyBodyDimensions(userId: string, query: BodyDimensionQueryDto) {
    const where: any = { userId };
    if (query.from) where.date = { ...where.date, gte: new Date(query.from) };
    if (query.to) where.date = { ...where.date, lte: new Date(query.to) };
    const [data, total] = await Promise.all([
      this.prisma.bodyDimension.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (query.page! - 1) * query.limit!,
        take: query.limit,
      }),
      this.prisma.bodyDimension.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit!),
      },
    };
  }

  async getClientsBodyDimensions(coachUserId: string) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const clients = await this.prisma.clientProfile.findMany({
      where: { coachId: coachProfile.id },
      select: {
        userId: true,
        user: { select: { name: true, email: true, avatar: true } },
      },
    });
    return Promise.all(
      clients.map(async (c) => ({
        client: c.user,
        measurements: await this.prisma.bodyDimension.findMany({
          where: { userId: c.userId },
          orderBy: { date: 'desc' },
          take: 10,
        }),
      })),
    );
  }

  async getClientBodyDimensions(
    coachUserId: string,
    clientProfileId: string,
    query: BodyDimensionQueryDto,
  ) {
    const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
    const client = await this.prisma.clientProfile.findFirst({
      where: { id: clientProfileId, coachId: coachProfile.id },
      select: {
        userId: true,
        user: { select: { name: true, email: true, avatar: true } },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return this.getMyBodyDimensions(client.userId, query);
  }

  // CLIENT PROFILE
  async setupClientProfile(userId: string, dto: SetupClientProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.age && { age: dto.age }),
        ...(dto.phoneNumber && { phoneNumber: dto.phoneNumber }),
        ...(dto.gender && { gender: dto.gender as any }),
        ...(dto.avatarUrl && { avatar: dto.avatarUrl }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        age: true,
        gender: true,
        phoneNumber: true,
      },
    });
  }

  async getMyCoachInfo(clientUserId: string) {
    const clientProfile = await this.getClientProfileOrThrow(clientUserId);
    const coach = await this.prisma.coachProfile.findUnique({
      where: { id: clientProfile.coachId },
      include: { user: { select: { name: true, email: true, avatar: true } } },
    });
    if (!coach) throw new NotFoundException('Coach not found');
    const [upcomingSessions, completedSessions] = await Promise.all([
      this.prisma.coachSession.findMany({
        where: {
          clientProfileId: clientProfile.id,
          status: { in: ['CONFIRMED', 'REQUESTED'] },
          scheduledAt: { gt: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: {
          availability: { select: { gymName: true, location: true } },
        },
      }),
      this.prisma.coachSession.findMany({
        where: { clientProfileId: clientProfile.id, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
    ]);
    return {
      coach: {
        id: coach.id,
        name: coach.user.name,
        email: coach.user.email,
        avatar: coach.user.avatar,
        gymName: coach.gymName,
        gymLocation: coach.gymLocation,
        bio: coach.bio,
        rating: coach.rating,
      },
      clientStatus: clientProfile.status,
      upcomingSessions,
      completedSessions,
    };
  }

  // REMINDERS
  async updateReminderPreferences(
    userId: string,
    dto: UpdateReminderPreferencesDto,
  ) {
    const key = `reminder_prefs:${userId}`;
    await this.prisma.appConfig.upsert({
      where: { key },
      create: {
        key,
        value: JSON.stringify(dto),
        type: 'json',
        group: 'reminders',
      },
      update: { value: JSON.stringify(dto) },
    });
    return { message: 'Reminder preferences saved', preferences: dto };
  }

  async getReminderPreferences(userId: string) {
    const cfg = await this.prisma.appConfig.findUnique({
      where: { key: `reminder_prefs:${userId}` },
    });
    if (!cfg)
      return {
        pushNotifications: true,
        emailReminders: true,
        smsReminders: false,
      };
    return JSON.parse(cfg.value);
  }

  // PRIVATE HELPERS
  private async getCoachProfileOrThrow(userId: string) {
    const coach = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });
    if (!coach)
      throw new ForbiddenException(
        'Coach profile not found. Only coaches can access this.',
      );
    return coach;
  }

  private async getClientProfileOrThrow(userId: string) {
    const client = await this.prisma.clientProfile.findUnique({
      where: { userId },
    });
    if (!client)
      throw new NotFoundException(
        'Client profile not found. Please accept a coach invitation first.',
      );
    return client;
  }

  private async getUserIdFromCoachProfileId(
    tx: any,
    coachProfileId: string,
  ): Promise<string> {
    const coach = await tx.coachProfile.findUnique({
      where: { id: coachProfileId },
      select: { userId: true },
    });
    return coach?.userId ?? '';
  }

  private buildDateTime(date: string, time: string): Date {
    return new Date(`${date}T${time}:00.000Z`);
  }
  private minutesBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }
  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
  private formatDate(d: Date): string {
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }
}

// import {
//   Injectable, NotFoundException, BadRequestException,
//   ForbiddenException, ConflictException, Logger,
// } from '@nestjs/common';

// import * as crypto from 'crypto';
// import {
//   CreateAvailabilitySlotDto, AvailabilityQueryDto,
//   BookSessionDto, UpdateSessionStatusDto, SessionQueryDto,
//   GenerateInvitationDto, AcceptInvitationDto,
//   SubmitParqDto, ReviewParqDto,
//   SetupClientProfileDto,
//   CreateBodyDimensionDto, UpdateBodyDimensionDto, BodyDimensionQueryDto,
//   UpdateReminderPreferencesDto,
// } from './dto/coach.dto';
// import { AuthProvider, UserRole } from '@prisma/client';
// import * as bcrypt from 'bcryptjs';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Injectable()
// export class CoachService {
//   private readonly logger = new Logger(CoachService.name);

//   constructor(private readonly prisma: PrismaService) {}

//   // ══════════════════════════════════════════════════════════════════════════
//   // COACH — Availability Slots
//   // ══════════════════════════════════════════════════════════════════════════

//   /**
//    * Coach creates a new available time slot on their calendar.
//    * Validates: no overlap with existing slots for same coach on same day.
//    */
//   async createAvailabilitySlot(coachUserId: string, dto: CreateAvailabilitySlotDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

//     const slotDate   = new Date(dto.date);
//     const startTime  = this.buildDateTime(dto.date, dto.startTime);
//     const endTime    = this.buildDateTime(dto.date, dto.endTime);

//     if (startTime >= endTime) {
//       throw new BadRequestException('End time must be after start time');
//     }
//     if (startTime < new Date()) {
//       throw new BadRequestException('Cannot create availability slots in the past');
//     }

//     // Overlap check: no two slots for same coach can overlap
//     const overlap = await this.prisma.coachAvailability.findFirst({
//       where: {
//         coachId: coachProfile.id,
//         date: slotDate,
//         isBooked: false,
//         OR: [
//           { startTime: { lte: startTime }, endTime: { gt: startTime } },
//           { startTime: { lt: endTime },   endTime: { gte: endTime } },
//           { startTime: { gte: startTime }, endTime: { lte: endTime } },
//         ],
//       },
//     });
//     if (overlap) {
//       throw new ConflictException('This time slot overlaps with an existing availability slot');
//     }

//     return this.prisma.coachAvailability.create({
//       data: {
//         coachId:   coachProfile.id,
//         date:      slotDate,
//         startTime,
//         endTime,
//         gymName:   dto.gymName  ?? coachProfile.gymName  ?? null,
//         location:  dto.location ?? coachProfile.gymLocation ?? null,
//       },
//     });
//   }

//   /**
//    * Coach views their availability calendar.
//    * Optionally filter by date range. By default only unbooked slots.
//    */
//   async getCoachAvailability(coachUserId: string, query: AvailabilityQueryDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

//     const where: any = { coachId: coachProfile.id };
//     if (!query.includeBooked) where.isBooked = false;
//     if (query.from) where.date = { ...where.date, gte: new Date(query.from) };
//     if (query.to)   where.date = { ...where.date, lte: new Date(query.to) };

//     const slots = await this.prisma.coachAvailability.findMany({
//       where,
//       orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
//       include: {
//         sessions: {
//           select: {
//             id: true, status: true,
//             client: { select: { user: { select: { name: true, email: true, avatar: true } } } },
//           },
//         },
//       },
//     });

//     // Group by date for calendar display
//     const grouped: Record<string, typeof slots> = {};
//     for (const slot of slots) {
//       const key = slot.date.toISOString().split('T')[0];
//       grouped[key] = grouped[key] ?? [];
//       grouped[key].push(slot);
//     }
//     return { slots, grouped };
//   }

//   /**
//    * Client views a coach's available (unbooked) slots.
//    * Used in "Book a Session" screen.
//    */
//   async getCoachPublicAvailability(coachProfileId: string, query: AvailabilityQueryDto) {
//     const where: any = {
//       coachId: coachProfileId,
//       isBooked: false,
//       startTime: { gt: new Date() }, // only future slots
//     };
//     if (query.from) where.date = { ...where.date, gte: new Date(query.from) };
//     if (query.to)   where.date = { ...where.date, lte: new Date(query.to) };

//     const slots = await this.prisma.coachAvailability.findMany({
//       where,
//       orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
//       select: {
//         id: true, date: true, startTime: true, endTime: true,
//         gymName: true, location: true,
//       },
//     });

//     // Group by date for the "Available Time Slots" UI section
//     const grouped: Record<string, typeof slots> = {};
//     for (const slot of slots) {
//       const key = slot.date.toISOString().split('T')[0];
//       grouped[key] = grouped[key] ?? [];
//       grouped[key].push(slot);
//     }
//     return { grouped };
//   }

//   /** Coach deletes an unbooked availability slot */
//   async deleteAvailabilitySlot(coachUserId: string, slotId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const slot = await this.prisma.coachAvailability.findFirst({
//       where: { id: slotId, coachId: coachProfile.id },
//     });
//     if (!slot) throw new NotFoundException('Slot not found');
//     if (slot.isBooked) throw new BadRequestException('Cannot delete a booked slot. Cancel the session first.');
//     await this.prisma.coachAvailability.delete({ where: { id: slotId } });
//     return { success: true, message: 'Slot deleted' };
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // CLIENT — Book a Session
//   // ══════════════════════════════════════════════════════════════════════════

//   /**
//    * Client books a session from a coach's available slot.
//    * Guards: client must have completed PAR-Q before booking.
//    * Marks the slot as booked atomically.
//    */
//   async bookSession(clientUserId: string, dto: BookSessionDto) {
//     const clientProfile = await this.getClientProfileOrThrow(clientUserId);

//     // PAR-Q gate: client must have an approved PAR-Q
//     if (clientProfile.status === 'PENDING_PAR_Q') {
//       throw new ForbiddenException(
//         'You must complete and have your PAR-Q approved before booking sessions.',
//       );
//     }

//     const slot = await this.prisma.coachAvailability.findFirst({
//       where: { id: dto.availabilityId, coachId: clientProfile.coachId, isBooked: false },
//     });
//     if (!slot) {
//       throw new NotFoundException('Time slot not found or already booked. Please choose another.');
//     }

//     // Check if client already has a session at this time
//     const conflicting = await this.prisma.coachSession.findFirst({
//       where: {
//         clientProfileId: clientProfile.id,
//         scheduledAt: slot.startTime,
//         status: { in: ['CONFIRMED', 'REQUESTED'] },
//       },
//     });
//     if (conflicting) {
//       throw new ConflictException('You already have a session at this time.');
//     }

//     return this.prisma.$transaction(async (tx) => {
//       // Mark slot as booked
//       await tx.coachAvailability.update({
//         where: { id: slot.id },
//         data: { isBooked: true },
//       });

//       // Create session
//       const session = await tx.coachSession.create({
//         data: {
//           coachId:         clientProfile.coachId,
//           clientProfileId: clientProfile.id,
//           availabilityId:  slot.id,
//           status:          'REQUESTED',
//           sessionType:     dto.sessionType ?? 'Training Session',
//           scheduledAt:     slot.startTime,
//           durationMinutes: this.minutesBetween(slot.startTime, slot.endTime),
//           notes:           dto.notes ?? null,
//         },
//         include: {
//           coach: {
//             select: {
//               user: { select: { name: true, email: true, avatar: true } },
//               gymName: true, gymLocation: true,
//             },
//           },
//         },
//       });

//       // Notify coach of new booking request
//       await tx.notification.create({
//         data: {
//           userId: await this.getUserIdFromCoachProfileId(tx, clientProfile.coachId),
//           type: 'SESSION_REQUESTED',
//           title: 'New Session Request',
//           body:  `${session.coach.user.name ?? 'A client'} has requested a session on ${this.formatDate(slot.startTime)}`,
//           data:  { sessionId: session.id },
//         },
//       });

//       return session;
//     });
//   }

//   /** Confirm a session booking confirmed */
//   async confirmSessionBooking(clientUserId: string, availabilityId: string) {
//     const clientProfile = await this.getClientProfileOrThrow(clientUserId);
//     const session = await this.prisma.coachSession.findFirst({
//       where: {
//         availabilityId,
//         clientProfileId: clientProfile.id,
//         status: 'REQUESTED',
//       },
//       include: { coach: true },
//     });
//     if (!session) throw new NotFoundException('Session not found or already confirmed');

//     return this.prisma.coachSession.update({
//       where: { id: session.id },
//       data: { status: 'CONFIRMED', confirmedAt: new Date() },
//     });
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // COACH — Session Management
//   // ══════════════════════════════════════════════════════════════════════════

//   /** Coach views all their sessions (today, upcoming, history) */
//   async getCoachSessions(coachUserId: string, query: SessionQueryDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const where: any = { coachId: coachProfile.id };
//     if (query.status) where.status = query.status;
//     if (query.from) where.scheduledAt = { ...where.scheduledAt, gte: new Date(query.from) };
//     if (query.to)   where.scheduledAt = { ...where.scheduledAt, lte: new Date(query.to) };

//     const [sessions, total] = await Promise.all([
//       this.prisma.coachSession.findMany({
//         where,
//         orderBy: { scheduledAt: 'asc' },
//         skip: (query.page! - 1) * query.limit!,
//         take: query.limit,
//         include: {
//           client: {
//             include: {
//               user: { select: { id: true, name: true, email: true, avatar: true } },
//               parqSubmissions: { orderBy: { createdAt: 'desc' }, take: 1, select: { isApproved: true } },
//             },
//           },
//           availability: { select: { gymName: true, location: true } },
//         },
//       }),
//       this.prisma.coachSession.count({ where }),
//     ]);

//     // Separate into upcoming and completed for dashboard
//     const now = new Date();
//     return {
//       data: sessions.map((s) => ({
//         ...s,
//         hasPendingParQ: s.client.parqSubmissions[0]
//           ? !s.client.parqSubmissions[0].isApproved
//           : true,
//       })),
//       meta: {
//         total,
//         page: query.page,
//         limit: query.limit,
//         totalPages: Math.ceil(total / query.limit!),
//         todayCount: sessions.filter((s) => this.isSameDay(s.scheduledAt, now)).length,
//         upcomingCount: sessions.filter((s) => s.scheduledAt > now && s.status === 'CONFIRMED').length,
//       },
//     };
//   }

//   /** Coach updates session status (confirm/decline/complete) */
//   async updateSessionStatus(coachUserId: string, sessionId: string, dto: UpdateSessionStatusDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const session = await this.prisma.coachSession.findFirst({
//       where: { id: sessionId, coachId: coachProfile.id },
//       include: { client: { include: { user: true } } },
//     });
//     if (!session) throw new NotFoundException('Session not found');

//     // State machine validation
//     const allowed: Record<string, string[]> = {
//       REQUESTED:  ['CONFIRMED', 'DECLINED'],
//       CONFIRMED:  ['COMPLETED', 'CANCELLED'],
//       COMPLETED:  [],
//       DECLINED:   [],
//       CANCELLED:  [],
//     };
//     if (!allowed[session.status]?.includes(dto.status)) {
//       throw new BadRequestException(
//         `Cannot transition session from ${session.status} to ${dto.status}`,
//       );
//     }

//     return this.prisma.$transaction(async (tx) => {
//       const updated = await tx.coachSession.update({
//         where: { id: sessionId },
//         data: {
//           status: dto.status as any,
//           notes:  dto.notes ?? session.notes,
//           ...(dto.status === 'CONFIRMED'  && { confirmedAt:  new Date() }),
//           ...(dto.status === 'COMPLETED'  && { completedAt:  new Date() }),
//           ...(dto.status === 'CANCELLED'  && { cancelledAt:  new Date() }),
//         },
//       });

//       // If session completed, increment coach stats
//       if (dto.status === 'COMPLETED') {
//         await tx.coachProfile.update({
//           where: { id: coachProfile.id },
//           data: { totalSessionsHeld: { increment: 1 } },
//         });
//       }

//       // If cancelled, unbook the availability slot
//       if (dto.status === 'CANCELLED' && session.availabilityId) {
//         await tx.coachAvailability.update({
//           where: { id: session.availabilityId },
//           data: { isBooked: false },
//         });
//       }

//       // Notify client
//       const notifMap: Record<string, string> = {
//         CONFIRMED:  'Your session has been confirmed!',
//         DECLINED:   'Your session request was declined.',
//         COMPLETED:  'Your session has been marked as complete.',
//         CANCELLED:  'Your session has been cancelled.',
//       };
//       await tx.notification.create({
//         data: {
//           userId: session.client.userId,
//           type:   'SESSION_CONFIRMED',
//           title:  `Session ${dto.status}`,
//           body:   notifMap[dto.status] ?? `Session status updated to ${dto.status}`,
//           data:   { sessionId },
//         },
//       });

//       return updated;
//     });
//   }

//   /** Coach views their dashboard summary */
//   async getCoachDashboard(coachUserId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const now = new Date();
//     const startOfToday = new Date(now.setHours(0, 0, 0, 0));
//     const endOfToday   = new Date(now.setHours(23, 59, 59, 999));
//     const startOfWeek  = new Date(now);
//     startOfWeek.setDate(now.getDate() - now.getDay());

//     const [
//       totalClients,
//       pendingParqCount,
//       todaySessions,
//       upcomingSessions,
//       thisWeekSessions,
//       pendingReviews,
//     ] = await Promise.all([
//       this.prisma.clientProfile.count({ where: { coachId: coachProfile.id, status: 'ACTIVE' } }),
//       this.prisma.parqSubmission.count({
//         where: { clientProfile: { coachId: coachProfile.id }, isApproved: false },
//       }),
//       this.prisma.coachSession.findMany({
//         where: {
//           coachId: coachProfile.id,
//           scheduledAt: { gte: startOfToday, lte: endOfToday },
//         },
//         include: {
//           client: { include: { user: { select: { name: true, email: true, avatar: true } } } },
//         },
//         orderBy: { scheduledAt: 'asc' },
//       }),
//       this.prisma.coachSession.count({
//         where: { coachId: coachProfile.id, status: 'CONFIRMED', scheduledAt: { gt: new Date() } },
//       }),
//       this.prisma.coachSession.count({
//         where: { coachId: coachProfile.id, scheduledAt: { gte: startOfWeek } },
//       }),
//       this.prisma.parqSubmission.count({
//         where: { clientProfile: { coachId: coachProfile.id }, isApproved: false },
//       }),
//     ]);

//     return {
//       stats: {
//         totalClients,
//         todaySessionsCount: todaySessions.length,
//         thisWeekSessions,
//         upcomingSessions,
//         pendingReviews,
//         pendingParqCount,
//       },
//       todaySchedule: todaySessions,
//     };
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // COACH — Client Management
//   // ══════════════════════════════════════════════════════════════════════════

//   /** Coach views all their clients with PAR-Q status indicators */
//   async getCoachClients(coachUserId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const clients = await this.prisma.clientProfile.findMany({
//       where: { coachId: coachProfile.id },
//       include: {
//         user: { select: { id: true, name: true, email: true, avatar: true, phoneNumber: true, gender: true, age: true } },
//         parqSubmissions: {
//           orderBy: { createdAt: 'desc' },
//           take: 1,
//           select: { id: true, isApproved: true, createdAt: true },
//         },
//         sessions: {
//           select: { id: true, status: true, scheduledAt: true },
//           orderBy: { scheduledAt: 'desc' },
//         },
//       },
//       orderBy: { createdAt: 'desc' },
//     });

//     return clients.map((c) => ({
//       ...c,
//       parqStatus: c.parqSubmissions[0]
//         ? (c.parqSubmissions[0].isApproved ? 'APPROVED' : 'PENDING_REVIEW')
//         : 'NOT_SUBMITTED',
//       totalSessions: c.sessions.length,
//       upcomingSessions: c.sessions.filter(
//         (s) => s.scheduledAt > new Date() && s.status === 'CONFIRMED',
//       ).length,
//     }));
//   }

//   /** Coach views a single client's full details */
//   async getClientDetails(coachUserId: string, clientProfileId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const client = await this.prisma.clientProfile.findFirst({
//       where: { id: clientProfileId, coachId: coachProfile.id },
//       include: {
//         user: { select: { id: true, name: true, email: true, avatar: true, phoneNumber: true, gender: true, age: true } },
//         parqSubmissions: { orderBy: { createdAt: 'desc' } },
//         sessions: {
//           orderBy: { scheduledAt: 'desc' },
//           include: { availability: { select: { gymName: true, location: true } } },
//         },
//       },
//     });
//     if (!client) throw new NotFoundException('Client not found');

//     // Get body dimension history
//     const bodyDimensions = await this.prisma.bodyDimension.findMany({
//       where: { userId: client.userId },
//       orderBy: { date: 'desc' },
//     });

//     return { ...client, bodyDimensions };
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // INVITATION SYSTEM
//   // ══════════════════════════════════════════════════════════════════════════

//   /**
//    * Coach generates a unique invitation link + code.
//    * The link can be shared via email or message.
//    * Invitation expires in `expiryDays` days (default 30).
//    */
//   async generateInvitation(coachUserId: string, dto: GenerateInvitationDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

//     // Check subscription limit
//     const currentClients = await this.prisma.clientProfile.count({
//       where: { coachId: coachProfile.id, status: { not: 'INACTIVE' } },
//     });

//     const sub = await this.prisma.subscription.findUnique({
//       where: { userId: coachUserId },
//       select: { maxClients: true, isCoachPremium: true },
//     });

//     if (sub && sub.maxClients > 0 && currentClients >= sub.maxClients) {
//       throw new ForbiddenException(
//         `You have reached your client limit (${sub.maxClients}). Upgrade your coach subscription to add more clients.`,
//       );
//     }

//     const code      = crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A1B2C3D4"
//     const expiresAt = new Date();
//     expiresAt.setDate(expiresAt.getDate() + (dto.expiryDays ?? 30));

//     // Build full link — base URL from env, fallback to placeholder
//     const baseUrl = process.env.APP_BASE_URL ?? 'https://app.monsterconfusion.com';
//     const link    = `${baseUrl}/invite/${code}`;

//     const invitation = await this.prisma.coachInvitation.create({
//       data: { coachId: coachProfile.id, code, link, expiresAt },
//     });

//     return {
//       invitationId: invitation.id,
//       code,
//       link,
//       expiresAt,
//       message: 'Share this link or code with your client. It can only be used once and expires in 30 days.',
//     };
//   }

//   /** Get all invitations for a coach (with usage status) */
//   async getCoachInvitations(coachUserId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     return this.prisma.coachInvitation.findMany({
//       where: { coachId: coachProfile.id },
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   /**
//    * Accept an invitation — works for BOTH:
//    *   A) An existing logged-in user (clientUserId provided via JWT)
//    *   B) A brand new user (no account yet — creates account inline)
//    *
//    * After accepting:
//    *   - ClientProfile is created with status = PENDING_PAR_Q
//    *   - Client is redirected to PAR-Q form
//    */
//   async acceptInvitation(dto: AcceptInvitationDto, existingUserId?: string) {
//     const invitation = await this.prisma.coachInvitation.findUnique({
//       where: { code: dto.code },
//       include: { coach: { include: { user: true } } },
//     });

//     if (!invitation)           throw new NotFoundException('Invitation not found. Please check the code.');
//     if (invitation.isUsed)     throw new BadRequestException('This invitation has already been used.');
//     if (invitation.expiresAt < new Date()) throw new BadRequestException('This invitation has expired.');

//     let userId = existingUserId;

//     // Case B: new user — create account first
//     if (!userId) {
//       if (!dto.email || !dto.password || !dto.name) {
//         throw new BadRequestException(
//           'Name, email, and password are required to create a new account via invitation.',
//         );
//       }

//       const existing = await this.prisma.user.findUnique({
//         where: { email: dto.email.toLowerCase() },
//       });
//       if (existing) {
//         // They already have an account — they should log in first then use the link
//         throw new ConflictException(
//           'An account with this email already exists. Please log in first, then use the invitation link.',
//         );
//       }

//       const passwordHash = await bcrypt.hash(dto.password, 12);
//       const newUser = await this.prisma.user.create({
//         data: {
//           email: dto.email.toLowerCase().trim(),
//           name:  dto.name.trim(),
//           passwordHash,
//           provider: AuthProvider.EMAIL,
//           role: UserRole.USER,
//           emailVerified: false,
//           subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
//         },
//       });
//       userId = newUser.id;
//     }

//     // Guard: user can only have ONE coach at a time
//     const existingClient = await this.prisma.clientProfile.findUnique({
//       where: { userId },
//     });
//     if (existingClient) {
//       throw new ConflictException(
//         'You are already connected to a coach. You can only have one coach at a time.',
//       );
//     }

//     return this.prisma.$transaction(async (tx) => {
//       // Mark invitation as used
//       await tx.coachInvitation.update({
//         where: { id: invitation.id },
//         data: { isUsed: true, usedBy: userId },
//       });

//       // Create client profile — status starts as PENDING_PAR_Q
//       const clientProfile = await tx.clientProfile.create({
//         data: {
//           userId:       userId!,
//           coachId:      invitation.coachId,
//           status:       'PENDING_PAR_Q',
//           invitationId: invitation.id,
//           gymName:      dto.gymName    ?? invitation.coach.gymName    ?? null,
//           gymLocation:  dto.gymLocation ?? invitation.coach.gymLocation ?? null,
//         },
//       });

//       // Increment coach's client count
//       await tx.coachProfile.update({
//         where: { id: invitation.coachId },
//         data: { totalClients: { increment: 1 } },
//       });

//       // Notify the coach
//       await tx.notification.create({
//         data: {
//           userId: invitation.coach.userId,
//           type:   'SESSION_REQUESTED',
//           title:  'New Client Joined',
//           body:   `A new client has joined via your invitation link.`,
//           data:   { clientProfileId: clientProfile.id },
//         },
//       });

//       return {
//         message: 'Successfully joined your coach. Please complete the PAR-Q health form before booking sessions.',
//         clientProfileId: clientProfile.id,
//         coachName: invitation.coach.user.name,
//         nextStep: 'SUBMIT_PAR_Q',
//       };
//     });
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // PAR-Q — Client submits, Coach reviews
//   // ══════════════════════════════════════════════════════════════════════════

//   /**
//    * Client submits PAR-Q. Can only submit if they have a coach.
//    * If a submission already exists, it creates a new one (history preserved).
//    */
//   async submitParq(clientUserId: string, dto: SubmitParqDto) {
//     const clientProfile = await this.getClientProfileOrThrow(clientUserId);

//     // Any "Yes" answer to a cardiovascular question might require doctor clearance
//     const requiresDoctorClearance =
//       dto.hasHeartCondition ||
//       dto.chestPainDuringActivity ||
//       dto.chestPainAtRest ||
//       dto.losesBalanceDizziness ||
//       dto.hasHighBloodPressure;

//     const submission = await this.prisma.parqSubmission.create({
//       data: {
//         userId:                  clientUserId,
//         clientProfileId:         clientProfile.id,
//         // General Health
//         hasHeartCondition:       dto.hasHeartCondition,
//         chestPainDuringActivity: dto.chestPainDuringActivity,
//         chestPainAtRest:         dto.chestPainAtRest,
//         losesBalanceDizziness:   dto.losesBalanceDizziness,
//         // Blood Pressure
//         hasHighBloodPressure:    dto.hasHighBloodPressure,
//         doctorLimitedActivity:   dto.doctorLimitedActivity,
//         // Musculoskeletal
//         hasBoneJointProblem:     dto.hasBoneJointProblem,
//         takingPrescription:      dto.takingPrescription,
//         // Other
//         hasOtherReason:          dto.hasOtherReason,
//         otherReasonDetails:      dto.otherReasonDetails ?? null,
//         // Declaration
//         signature:               dto.signatureData ?? dto.signatureName,
//         signedAt:                new Date(),
//         isApproved:              false,
//       },
//     });

//     // Notify the coach a new PAR-Q is waiting for review
//     const coachUserId = await this.getUserIdFromCoachProfileId(
//       this.prisma as any,
//       clientProfile.coachId,
//     );
//     await this.prisma.notification.create({
//       data: {
//         userId: coachUserId,
//         type:   'PAR_Q_REVIEW',
//         title:  'New PAR-Q Submission',
//         body:   'A client has submitted their health questionnaire for review.',
//         data:   { parqId: submission.id, clientProfileId: clientProfile.id },
//       },
//     });

//     return {
//       message: requiresDoctorClearance
//         ? 'PAR-Q submitted. Your coach will review it. Some of your answers may require doctor clearance before training.'
//         : 'PAR-Q submitted successfully. Your coach will review and approve it shortly.',
//       submissionId: submission.id,
//       requiresDoctorClearance,
//     };
//   }

//   /** Client views their PAR-Q submission history */
//   async getClientParqHistory(clientUserId: string) {
//     const clientProfile = await this.getClientProfileOrThrow(clientUserId);
//     return this.prisma.parqSubmission.findMany({
//       where: { clientProfileId: clientProfile.id },
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   /**
//    * Coach reviews a PAR-Q submission — approves or rejects.
//    * On approval: client status → ACTIVE (can now book sessions).
//    * On rejection: client status stays PENDING_PAR_Q.
//    */
//   async reviewParq(coachUserId: string, submissionId: string, dto: ReviewParqDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);

//     const submission = await this.prisma.parqSubmission.findFirst({
//       where: {
//         id: submissionId,
//         clientProfile: { coachId: coachProfile.id },
//       },
//       include: { clientProfile: true, user: true },
//     });
//     if (!submission) throw new NotFoundException('PAR-Q submission not found');

//     return this.prisma.$transaction(async (tx) => {
//       // Update submission
//       const updated = await tx.parqSubmission.update({
//         where: { id: submissionId },
//         data: {
//           isApproved:       dto.approved,
//           reviewedByCoachAt: new Date(),
//         },
//       });

//       // Update client status
//       if (dto.approved) {
//         await tx.clientProfile.update({
//           where: { id: submission.clientProfileId },
//           data: { status: 'ACTIVE' },
//         });
//       }

//       // Notify client
//       await tx.notification.create({
//         data: {
//           userId: submission.userId,
//           type:   'PAR_Q_REVIEW',
//           title:  dto.approved ? 'PAR-Q Approved ✅' : 'PAR-Q Requires Attention',
//           body:   dto.approved
//             ? 'Your health questionnaire has been approved. You can now book sessions!'
//             : `Your PAR-Q needs attention. ${dto.notes ?? 'Please contact your coach.'}`,
//           data: { parqId: submissionId, approved: dto.approved },
//         },
//       });

//       return {
//         ...updated,
//         message: dto.approved
//           ? 'PAR-Q approved. Client can now book sessions.'
//           : 'PAR-Q rejected. Client has been notified.',
//       };
//     });
//   }

//   /** Coach views all pending PAR-Q submissions */
//   async getPendingParqSubmissions(coachUserId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     return this.prisma.parqSubmission.findMany({
//       where: {
//         clientProfile: { coachId: coachProfile.id },
//         isApproved: false,
//       },
//       include: {
//         user: { select: { name: true, email: true, avatar: true, phoneNumber: true, gender: true } },
//         clientProfile: { select: { id: true, status: true } },
//       },
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   /** Coach views a specific PAR-Q in full detail */
//   async getParqDetail(coachUserId: string, submissionId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const submission = await this.prisma.parqSubmission.findFirst({
//       where: { id: submissionId, clientProfile: { coachId: coachProfile.id } },
//       include: {
//         user: { select: { name: true, email: true, avatar: true, phoneNumber: true, gender: true, age: true } },
//         clientProfile: { select: { id: true, status: true } },
//       },
//     });
//     if (!submission) throw new NotFoundException('PAR-Q submission not found');
//     return submission;
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // BODY DIMENSIONS
//   // ══════════════════════════════════════════════════════════════════════════

//   /** User (or client) saves a new body dimension measurement */
//   async createBodyDimension(userId: string, dto: CreateBodyDimensionDto) {
//     // Check for duplicate on same date
//     const existing = await this.prisma.bodyDimension.findFirst({
//       where: { userId, date: new Date(dto.date) },
//     });
//     if (existing) {
//       throw new ConflictException(
//         `A measurement for ${dto.date} already exists. Use PATCH to update it.`,
//       );
//     }

//     return this.prisma.bodyDimension.create({
//       data: {
//         userId,
//         date:            new Date(dto.date),
//         weight:          dto.weight ?? null,
//         weightUnit:      (dto.weightUnit as any) ?? 'KG',
//         measureUnit:     (dto.measureUnit as any) ?? 'CM',
//         height:          dto.height ?? null,
//         waist:           dto.waist ?? null,
//         leg:             dto.leg ?? null,
//         arm:             dto.arm ?? null,
//         bodyFatPercent:  dto.bodyFatPercent ?? null,
//         notes:           dto.notes ?? null,
//       },
//     });
//   }

//   /** Update an existing body dimension entry */
//   async updateBodyDimension(userId: string, dimensionId: string, dto: UpdateBodyDimensionDto) {
//     const bd = await this.prisma.bodyDimension.findFirst({
//       where: { id: dimensionId, userId },
//     });
//     if (!bd) throw new NotFoundException('Measurement not found');

//     return this.prisma.bodyDimension.update({
//       where: { id: dimensionId },
//       data: {
//         ...(dto.weight          !== undefined && { weight:          dto.weight }),
//         ...(dto.weightUnit      !== undefined && { weightUnit:      dto.weightUnit as any }),
//         ...(dto.measureUnit     !== undefined && { measureUnit:     dto.measureUnit as any }),
//         ...(dto.height          !== undefined && { height:          dto.height }),
//         ...(dto.waist           !== undefined && { waist:           dto.waist }),
//         ...(dto.leg             !== undefined && { leg:             dto.leg }),
//         ...(dto.arm             !== undefined && { arm:             dto.arm }),
//         ...(dto.bodyFatPercent  !== undefined && { bodyFatPercent:  dto.bodyFatPercent }),
//         ...(dto.notes           !== undefined && { notes:           dto.notes }),
//       },
//     });
//   }

//   /** User views their own body dimension history */
//   async getMyBodyDimensions(userId: string, query: BodyDimensionQueryDto) {
//     const where: any = { userId };
//     if (query.from) where.date = { ...where.date, gte: new Date(query.from) };
//     if (query.to)   where.date = { ...where.date, lte: new Date(query.to) };

//     const [data, total] = await Promise.all([
//       this.prisma.bodyDimension.findMany({
//         where,
//         orderBy: { date: 'desc' },
//         skip: (query.page! - 1) * query.limit!,
//         take: query.limit,
//       }),
//       this.prisma.bodyDimension.count({ where }),
//     ]);

//     return {
//       data,
//       meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit!) },
//     };
//   }

//   /** Coach views body dimensions for ALL their clients */
//   async getClientsBodyDimensions(coachUserId: string) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const clients = await this.prisma.clientProfile.findMany({
//       where: { coachId: coachProfile.id },
//       select: { userId: true, user: { select: { name: true, email: true, avatar: true } } },
//     });

//     const results = await Promise.all(
//       clients.map(async (c) => {
//         const measurements = await this.prisma.bodyDimension.findMany({
//           where: { userId: c.userId },
//           orderBy: { date: 'desc' },
//           take: 10, // last 10 entries per client
//         });
//         return { client: c.user, measurements };
//       }),
//     );
//     return results;
//   }

//   /** Coach views one client's body dimensions */
//   async getClientBodyDimensions(coachUserId: string, clientProfileId: string, query: BodyDimensionQueryDto) {
//     const coachProfile = await this.getCoachProfileOrThrow(coachUserId);
//     const client = await this.prisma.clientProfile.findFirst({
//       where: { id: clientProfileId, coachId: coachProfile.id },
//       select: { userId: true, user: { select: { name: true, email: true, avatar: true } } },
//     });
//     if (!client) throw new NotFoundException('Client not found');

//     return this.getMyBodyDimensions(client.userId, query);
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // CLIENT — Profile Setup (after invitation accepted)
//   // ══════════════════════════════════════════════════════════════════════════

//   async setupClientProfile(userId: string, dto: SetupClientProfileDto) {
//     return this.prisma.user.update({
//       where: { id: userId },
//       data: {
//         ...(dto.name        && { name:        dto.name }),
//         ...(dto.age         && { age:         dto.age }),
//         ...(dto.phoneNumber && { phoneNumber: dto.phoneNumber }),
//         ...(dto.gender      && { gender:      dto.gender as any }),
//         ...(dto.avatarUrl   && { avatar:      dto.avatarUrl }),
//       },
//       select: {
//         id: true, name: true, email: true, avatar: true,
//         age: true, gender: true, phoneNumber: true,
//       },
//     });
//   }

//   /** Client views their own coach profile + upcoming sessions */
//   async getMyCoachInfo(clientUserId: string) {
//     const clientProfile = await this.getClientProfileOrThrow(clientUserId);
//     const coach = await this.prisma.coachProfile.findUnique({
//       where: { id: clientProfile.coachId },
//       include: {
//         user: { select: { name: true, email: true, avatar: true } },
//       },
//     });
//     if (!coach) throw new NotFoundException('Coach not found');

//     const [upcomingSessions, completedSessions] = await Promise.all([
//       this.prisma.coachSession.findMany({
//         where: {
//           clientProfileId: clientProfile.id,
//           status: { in: ['CONFIRMED', 'REQUESTED'] },
//           scheduledAt: { gt: new Date() },
//         },
//         orderBy: { scheduledAt: 'asc' },
//         take: 5,
//         include: { availability: { select: { gymName: true, location: true } } },
//       }),
//       this.prisma.coachSession.findMany({
//         where: { clientProfileId: clientProfile.id, status: 'COMPLETED' },
//         orderBy: { completedAt: 'desc' },
//         take: 5,
//       }),
//     ]);

//     return {
//       coach: {
//         id:          coach.id,
//         name:        coach.user.name,
//         email:       coach.user.email,
//         avatar:      coach.user.avatar,
//         gymName:     coach.gymName,
//         gymLocation: coach.gymLocation,
//         bio:         coach.bio,
//         rating:      coach.rating,
//       },
//       clientStatus:       clientProfile.status,
//       upcomingSessions,
//       completedSessions,
//     };
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // REMINDER PREFERENCES
//   // ══════════════════════════════════════════════════════════════════════════

//   async updateReminderPreferences(userId: string, dto: UpdateReminderPreferencesDto) {
//     // Store in AppConfig keyed by userId for quick lookup
//     const key = `reminder_prefs:${userId}`;
//     const value = JSON.stringify(dto);
//     await this.prisma.appConfig.upsert({
//       where: { key },
//       create: { key, value, type: 'json', group: 'reminders' },
//       update: { value },
//     });
//     return { message: 'Reminder preferences saved', preferences: dto };
//   }

//   async getReminderPreferences(userId: string) {
//     const cfg = await this.prisma.appConfig.findUnique({ where: { key: `reminder_prefs:${userId}` } });
//     if (!cfg) {
//       return { pushNotifications: true, emailReminders: true, smsReminders: false };
//     }
//     return JSON.parse(cfg.value);
//   }

//   // ══════════════════════════════════════════════════════════════════════════
//   // PRIVATE HELPERS
//   // ══════════════════════════════════════════════════════════════════════════

//   private async getCoachProfileOrThrow(userId: string) {
//     const coach = await this.prisma.coachProfile.findUnique({ where: { userId } });
//     if (!coach) throw new ForbiddenException('Coach profile not found. Only coaches can access this.');
//     // if (!coach.isActive) throw new ForbiddenException('Your coach account is pending admin approval.');
//     return coach;
//   }

//   private async getClientProfileOrThrow(userId: string) {
//     const client = await this.prisma.clientProfile.findUnique({ where: { userId } });
//     if (!client) throw new NotFoundException('Client profile not found. Please accept a coach invitation first.');
//     return client;
//   }

//   private async getUserIdFromCoachProfileId(
//     tx: any,
//     coachProfileId: string,
//   ): Promise<string> {
//     const coach = await tx.coachProfile.findUnique({
//       where: { id: coachProfileId },
//       select: { userId: true },
//     });
//     return coach?.userId ?? '';
//   }

//   private buildDateTime(date: string, time: string): Date {
//     return new Date(`${date}T${time}:00.000Z`);
//   }

//   private minutesBetween(start: Date, end: Date): number {
//     return Math.round((end.getTime() - start.getTime()) / 60000);
//   }

//   private isSameDay(a: Date, b: Date): boolean {
//     return (
//       a.getFullYear() === b.getFullYear() &&
//       a.getMonth()    === b.getMonth() &&
//       a.getDate()     === b.getDate()
//     );
//   }

//   private formatDate(d: Date): string {
//     return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
//   }
// }
