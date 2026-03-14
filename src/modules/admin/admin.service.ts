// src/modules/admin/admin.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Prisma,
  UserRole,
  PaymentStatus,
  SubscriptionPlan,
  UserActivityType,
  NotificationAudience,
} from '@prisma/client';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════
  // SECTION 1 — DASHBOARD
  // ══════════════════════════════════════════════════════════════

  async getDashboard() {
    const now = new Date();
    const startOf30DaysAgo = new Date(now);
    startOf30DaysAgo.setDate(now.getDate() - 30);

    const startOf7DaysAgo = new Date(now);
    startOf7DaysAgo.setDate(now.getDate() - 7);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // ── Core counts (parallel) ────────────────────────────────────
    const [
      totalUsers,
      premiumUsers,
      trialUsers,
      totalCoaches,
      coachedClients,
      activeEnrollments,
      newUsersToday,
      newUsersThisWeek,
      totalWorkoutLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isPremium: true, isActive: true } }),
      this.prisma.user.count({
        where: { trialEndsAt: { gt: now }, isPremium: false, isActive: true },
      }),
      this.prisma.user.count({ where: { role: UserRole.COACH, isActive: true } }),
      this.prisma.clientProfile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.userActiveProgram.count(),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOf7DaysAgo } } }),
      this.prisma.workoutLog.count({ where: { status: 'COMPLETED' } }),
    ]);

    const freeUsers = totalUsers - premiumUsers - trialUsers;

    // ── Revenue metrics ────────────────────────────────────────────
    const [revenueTotal, revenueLast30Days, revenueLastMonth] = await Promise.all([
      this.prisma.paymentTransaction.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: startOf30DaysAgo } },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            lt: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
        _sum: { amount: true },
      }),
    ]);

    // ── Monthly revenue chart (last 6 months) ─────────────────────
    const monthlyRevenue = await this.getMonthlyRevenueChart(6);

    // ── User growth chart (last 6 months) ─────────────────────────
    const userGrowthChart = await this.getUserGrowthChart(6);

    // ── Top programs ──────────────────────────────────────────────
    const topPrograms = await this.prisma.program.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        name: true,
        difficulty: true,
        isPremium: true,
        analytics: {
          select: {
            totalEnrollments: true,
            activeEnrollments: true,
            completionRate: true,
          },
        },
      },
      orderBy: { analytics: { totalEnrollments: 'desc' } },
      take: 5,
    });

    // ── Recent activity ────────────────────────────────────────────
    const recentActivity = await this.prisma.userActivityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    // Enrich with user names
    const userIds = [...new Set(recentActivity.map((a) => a.userId))];
    const userMap = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatar: true },
    });
    const userLookup = Object.fromEntries(userMap.map((u) => [u.id, u]));

    // ── Subscription breakdown ─────────────────────────────────────
    const subscriptionBreakdown = await this.prisma.subscription.groupBy({
      by: ['plan', 'status'],
      _count: { id: true },
    });

    return {
      stats: {
        totalUsers,
        premiumUsers,
        freeUsers,
        trialUsers,
        totalCoaches,
        coachedClients,
        activeEnrollments,
        newUsersToday,
        newUsersThisWeek,
        totalWorkoutsCompleted: totalWorkoutLogs,
        revenue: {
          allTime: revenueTotal._sum.amount ?? 0,
          last30Days: revenueLast30Days._sum.amount ?? 0,
          lastMonth: revenueLastMonth._sum.amount ?? 0,
        },
      },
      charts: {
        monthlyRevenue,
        userGrowth: userGrowthChart,
      },
      topPrograms: topPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        difficulty: p.difficulty,
        isPremium: p.isPremium,
        enrollments: p.analytics?.totalEnrollments ?? 0,
        activeEnrollments: p.analytics?.activeEnrollments ?? 0,
        completionRate: p.analytics?.completionRate ?? 0,
      })),
      subscriptionBreakdown,
      recentActivity: recentActivity.map((a) => ({
        ...a,
        user: userLookup[a.userId] ?? null,
      })),
    };
  }

  // Monthly revenue for N months (accurate aggregation using raw date bucketing)
  private async getMonthlyRevenueChart(months: number) {
    const results: { month: string; revenue: number; transactions: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const agg = await this.prisma.paymentTransaction.aggregate({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
        _count: { id: true },
      });

      results.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue: Math.round((agg._sum.amount ?? 0) * 100) / 100,
        transactions: agg._count.id,
      });
    }
    return results;
  }

  // User growth for N months
  private async getUserGrowthChart(months: number) {
    const results: { month: string; newUsers: number; cumulativeUsers: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const [newUsers, cumulativeUsers] = await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
        this.prisma.user.count({ where: { createdAt: { lt: end } } }),
      ]);

      results.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        newUsers,
        cumulativeUsers,
      });
    }
    return results;
  }

  // ── Analytics snapshot (upsert daily) ─────────────────────────
  async snapshotAnalytics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      premiumUsers,
      freeUsers,
      trialUsers,
      activeEnrollments,
      totalCoaches,
      coachedClients,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isPremium: true } }),
      this.prisma.user.count({ where: { isPremium: false } }),
      this.prisma.user.count({
        where: { trialEndsAt: { gt: new Date() }, isPremium: false },
      }),
      this.prisma.userActiveProgram.count(),
      this.prisma.user.count({ where: { role: UserRole.COACH } }),
      this.prisma.clientProfile.count({ where: { status: 'ACTIVE' } }),
    ]);

    const monthlyRevAgg = await this.prisma.paymentTransaction.aggregate({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: {
          gte: new Date(today.getFullYear(), today.getMonth(), 1),
          lt: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        },
      },
      _sum: { amount: true },
    });

    const newUsersToday = await this.prisma.user.count({
      where: { createdAt: { gte: today } },
    });

    return this.prisma.platformAnalyticsSnapshot.upsert({
      where: { date: today },
      create: {
        date: today,
        totalUsers,
        premiumUsers,
        freeUsers,
        trialUsers,
        activeEnrollments,
        totalCoaches,
        coachedClients,
        monthlyRevenue: monthlyRevAgg._sum.amount ?? 0,
        newUsersToday,
      },
      update: {
        totalUsers,
        premiumUsers,
        freeUsers,
        trialUsers,
        activeEnrollments,
        totalCoaches,
        coachedClients,
        monthlyRevenue: monthlyRevAgg._sum.amount ?? 0,
        newUsersToday,
      },
    });
  }

  async getAnalyticsSnapshots(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    return this.prisma.platformAnalyticsSnapshot.findMany({
      where: { date: { gte: from } },
      orderBy: { date: 'asc' },
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 2 — USER MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: UserRole;
    isPremium?: boolean;
    isActive?: boolean;
    sortBy?: 'createdAt' | 'lastLoginAt' | 'name' | 'email';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.role) where.role = query.role;
    if (query.isPremium !== undefined) where.isPremium = query.isPremium;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
          isPremium: true,
          isActive: true,
          emailVerified: true,
          gender: true,
          age: true,
          createdAt: true,
          lastLoginAt: true,
          trialEndsAt: true,
          provider: true,
          subscription: {
            select: { plan: true, status: true, currentPeriodEnd: true },
          },
          _count: { select: { workoutLogs: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        coachProfile: {
          select: {
            id: true, isVerified: true, isActive: true, rating: true,
            totalClients: true, totalSessionsHeld: true, gymName: true,
          },
        },
        clientProfile: {
          select: { id: true, status: true, coachId: true },
        },
        activeProgram: {
          select: { programId: true, currentWeek: true, startedAt: true },
        },
        _count: {
          select: { workoutLogs: true, userPrograms: true, notifications: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const recentActivity = await this.prisma.userActivityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return { ...user, recentActivity };
  }

  async updateUser(
    adminUserId: string,
    userId: string,
    dto: {
      role?: UserRole;
      isActive?: boolean;
      isPremium?: boolean;
      premiumUntil?: Date;
      emailVerified?: boolean;
      name?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    // Prevent downgrading another superadmin unless requester is superadmin
    if (user.role === UserRole.SUPERADMIN && dto.role && dto.role !== UserRole.SUPERADMIN) {
      const admin = await this.prisma.user.findUnique({ where: { id: adminUserId } });
      if (admin?.role !== UserRole.SUPERADMIN) {
        throw new ForbiddenException('Only superadmins can modify another superadmin\'s role');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isPremium !== undefined && { isPremium: dto.isPremium }),
        ...(dto.premiumUntil !== undefined && { premiumUntil: dto.premiumUntil }),
        ...(dto.emailVerified !== undefined && { emailVerified: dto.emailVerified }),
        ...(dto.name !== undefined && { name: dto.name }),
      },
      select: {
        id: true, name: true, email: true, role: true,
        isPremium: true, isActive: true, emailVerified: true, updatedAt: true,
      },
    });

    await this.logAdminAction(adminUserId, 'UPDATE_USER', 'User', userId, dto);
    return updated;
  }

  async deleteUser(adminUserId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (user.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('Cannot delete a superadmin account');
    }

    // Soft delete: deactivate rather than hard delete to preserve data integrity
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, email: `deleted_${Date.now()}_${user.email}` },
    });

    await this.logAdminAction(adminUserId, 'DELETE_USER', 'User', userId, { email: user.email });
    return { success: true, message: `User ${user.email} deactivated` };
  }

  async getUserStats() {
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    const last7 = new Date(now);
    last7.setDate(now.getDate() - 7);

    const [byRole, byProvider, newLast30, newLast7, verifiedCount] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      this.prisma.user.groupBy({ by: ['provider'], _count: { id: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.user.count({ where: { createdAt: { gte: last7 } } }),
      this.prisma.user.count({ where: { emailVerified: true } }),
    ]);

    return { byRole, byProvider, newLast30Days: newLast30, newLast7Days: newLast7, verifiedCount };
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 3 — COACH MANAGEMENT (Admin oversight)
  // ══════════════════════════════════════════════════════════════

  async getCoaches(query: {
    page?: number;
    limit?: number;
    search?: string;
    isVerified?: boolean;
    isActive?: boolean;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.CoachProfileWhereInput = {};
    if (query.isVerified !== undefined) where.isVerified = query.isVerified;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.user = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [coaches, total] = await Promise.all([
      this.prisma.coachProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, createdAt: true, isActive: true } },
          _count: { select: { clients: true, calendarSessions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coachProfile.count({ where }),
    ]);

    return { data: coaches, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async verifyCoach(adminUserId: string, coachProfileId: string, isVerified: boolean) {
    const coach = await this.prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
    if (!coach) throw new NotFoundException('Coach profile not found');

    await this.prisma.coachProfile.update({
      where: { id: coachProfileId },
      data: { isVerified },
    });

    await this.logAdminAction(adminUserId, isVerified ? 'VERIFY_COACH' : 'UNVERIFY_COACH', 'CoachProfile', coachProfileId, {});
    return { success: true, message: isVerified ? 'Coach verified' : 'Coach verification removed' };
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 4 — PROGRAM MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  async getPrograms(query: {
    page?: number;
    limit?: number;
    search?: string;
    isPublished?: boolean;
    isPremium?: boolean;
    difficulty?: string;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.ProgramWhereInput = {};
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;
    if (query.isPremium !== undefined) where.isPremium = query.isPremium;
    if (query.difficulty) where.difficulty = query.difficulty as any;

    const [programs, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          analytics: {
            select: { totalEnrollments: true, activeEnrollments: true, completionRate: true },
          },
          _count: { select: { weeks: true, reviews: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.program.count({ where }),
    ]);

    return { data: programs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getProgramAnalytics(programId: string) {
    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      include: {
        analytics: true,
        reviews: {
          select: { rating: true, comment: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { userPrograms: true, activePrograms: true } },
      },
    });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);

    // Completion breakdown by week
    const completedByWeek = await this.prisma.userProgram.groupBy({
      by: ['completedWeeks'],
      where: { programId },
      _count: { id: true },
      orderBy: { completedWeeks: 'asc' },
    });

    // Average rating
    const avgRating = await this.prisma.programReview.aggregate({
      where: { programId },
      _avg: { rating: true },
      _count: { id: true },
    });

    return {
      program,
      completionByWeek: completedByWeek,
      averageRating: Math.round((avgRating._avg.rating ?? 0) * 10) / 10,
      totalReviews: avgRating._count.id,
    };
  }

  async updateProgram(adminUserId: string, programId: string, dto: Partial<{
    name: string;
    description: string;
    isPremium: boolean;
    isPublished: boolean;
    isActive: boolean;
    sortOrder: number;
    thumbnailUrl: string;
    difficulty: any;
    features: string[];
    tags: string[];
  }>) {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);

    const updated = await this.prisma.program.update({
      where: { id: programId },
      data: dto,
    });

    await this.logAdminAction(adminUserId, 'UPDATE_PROGRAM', 'Program', programId, dto);
    return updated;
  }

  async deleteProgram(adminUserId: string, programId: string) {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);

    const activeCount = await this.prisma.userActiveProgram.count({ where: { programId } });
    if (activeCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${activeCount} user(s) have this program active. Archive it (isActive=false) instead.`,
      );
    }

    await this.prisma.program.delete({ where: { id: programId } });
    await this.logAdminAction(adminUserId, 'DELETE_PROGRAM', 'Program', programId, { name: program.name });
    return { success: true, message: `Program "${program.name}" deleted` };
  }

  // ── Premium Week Locks ────────────────────────────────────────
  async getWeekLockConfig(programId: string) {
    return this.prisma.premiumWeekLockConfig.findMany({
      where: { programId },
      orderBy: { weekNumber: 'asc' },
    });
  }

  async saveWeekLockConfig(
    adminUserId: string,
    programId: string,
    weeks: Array<{ weekNumber: number; isPremiumLock: boolean }>,
  ) {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);

    const upserts = weeks.map((w) =>
      this.prisma.premiumWeekLockConfig.upsert({
        where: { programId_weekNumber: { programId, weekNumber: w.weekNumber } },
        create: { programId, weekNumber: w.weekNumber, isPremiumLock: w.isPremiumLock, updatedByAdminId: adminUserId },
        update: { isPremiumLock: w.isPremiumLock, updatedByAdminId: adminUserId },
      }),
    );
    await this.prisma.$transaction(upserts);
    await this.logAdminAction(adminUserId, 'UPDATE_WEEK_LOCKS', 'Program', programId, { weeks });
    return { success: true, message: `${weeks.length} week lock(s) saved` };
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 5 — EXERCISE LIBRARY
  // ══════════════════════════════════════════════════════════════

  async getExercises(query: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    primaryMuscle?: string;
    isPublished?: boolean;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.ExerciseWhereInput = {};
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    if (query.category) where.category = query.category as any;
    if (query.primaryMuscle) where.primaryMuscle = query.primaryMuscle as any;
    if (query.isPublished !== undefined) where.isPublished = query.isPublished;

    const [exercises, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          media: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { programDayExercises: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return { data: exercises, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createExercise(
    adminUserId: string,
    dto: {
      name: string;
      description?: string;
      instructions?: string;
      category: any;
      primaryMuscle: any;
      secondaryMuscles?: any[];
      equipment?: any;
      sortOrder?: number;
      media?: Array<{ type: any; url: string; label?: string; sortOrder?: number }>;
    },
  ) {
    const existing = await this.prisma.exercise.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`Exercise "${dto.name}" already exists`);
    }

    const { media, ...rest } = dto;
    const exercise = await this.prisma.exercise.create({
      data: {
        ...rest,
        createdByAdminId: adminUserId,
        media: media?.length
          ? { create: media.map((m, i) => ({ ...m, sortOrder: m.sortOrder ?? i })) }
          : undefined,
      },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.logAdminAction(adminUserId, 'CREATE_EXERCISE', 'Exercise', exercise.id, { name: dto.name });
    return exercise;
  }

  async updateExercise(adminUserId: string, exerciseId: string, dto: any) {
    const exercise = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) throw new NotFoundException(`Exercise ${exerciseId} not found`);

    const updated = await this.prisma.exercise.update({ where: { id: exerciseId }, data: dto });
    await this.logAdminAction(adminUserId, 'UPDATE_EXERCISE', 'Exercise', exerciseId, dto);
    return updated;
  }

  async deleteExercise(adminUserId: string, exerciseId: string) {
    const exercise = await this.prisma.exercise.findUnique({ where: { id: exerciseId } });
    if (!exercise) throw new NotFoundException(`Exercise ${exerciseId} not found`);

    const inUse = await this.prisma.programDayExercise.count({ where: { exerciseId } });
    if (inUse > 0) {
      throw new ConflictException(`Cannot delete: exercise is used in ${inUse} program day(s). Deactivate it instead.`);
    }

    await this.prisma.exercise.delete({ where: { id: exerciseId } });
    await this.logAdminAction(adminUserId, 'DELETE_EXERCISE', 'Exercise', exerciseId, { name: exercise.name });
    return { success: true, message: `Exercise "${exercise.name}" deleted` };
  }

  // ── Training Methods ──────────────────────────────────────────
  async getTrainingMethods() {
    return this.prisma.trainingMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createTrainingMethod(
    adminUserId: string,
    dto: {
      name: string;
      type: any;
      description: string;
      setsInfo?: string;
      repRange?: string;
      restPeriod?: string;
      intensity?: string;
      notes?: string;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.trainingMethod.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Training method "${dto.name}" already exists`);

    const method = await this.prisma.trainingMethod.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_TRAINING_METHOD', 'TrainingMethod', method.id, { name: dto.name });
    return method;
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 6 — CONTENT MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  // ── Home Page Content ─────────────────────────────────────────
  async getHomePageContent() {
    return this.prisma.homePageContent.findMany({
      where: { isActive: true },
      include: {
        program: {
          select: { id: true, name: true, difficulty: true, thumbnailUrl: true, isPremium: true },
        },
      },
      orderBy: { position: 'asc' },
    });
  }

  async createHomePageContent(
    adminUserId: string,
    dto: {
      type: any;
      programId?: string;
      title?: string;
      description?: string;
      imageUrl?: string;
      position: number;
    },
  ) {
    if (dto.type === 'PROGRAM' && !dto.programId) {
      throw new BadRequestException('programId is required when type is PROGRAM');
    }

    // Shift existing items if position is taken
    await this.prisma.homePageContent.updateMany({
      where: { position: { gte: dto.position } },
      data: { position: { increment: 1 } },
    });

    const content = await this.prisma.homePageContent.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_HOME_CONTENT', 'HomePageContent', content.id, dto);
    return content;
  }

  async updateHomePageContent(adminUserId: string, id: string, dto: any) {
    const item = await this.prisma.homePageContent.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Home page content not found');

    const updated = await this.prisma.homePageContent.update({ where: { id }, data: dto });
    await this.logAdminAction(adminUserId, 'UPDATE_HOME_CONTENT', 'HomePageContent', id, dto);
    return updated;
  }

  async deleteHomePageContent(adminUserId: string, id: string) {
    const item = await this.prisma.homePageContent.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Home page content not found');

    await this.prisma.homePageContent.delete({ where: { id } });
    await this.logAdminAction(adminUserId, 'DELETE_HOME_CONTENT', 'HomePageContent', id, {});
    return { success: true };
  }

  async reorderHomePageContent(
    adminUserId: string,
    items: Array<{ id: string; position: number }>,
  ) {
    const updates = items.map((item) =>
      this.prisma.homePageContent.update({
        where: { id: item.id },
        data: { position: item.position },
      }),
    );
    await this.prisma.$transaction(updates);
    await this.logAdminAction(adminUserId, 'REORDER_HOME_CONTENT', 'HomePageContent', 'batch', { count: items.length });
    return { success: true, message: `${items.length} items reordered` };
  }

  // ── Execution Notes ───────────────────────────────────────────
  async getExecutionNotes() {
    return this.prisma.executionNote.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async createExecutionNote(
    adminUserId: string,
    dto: { title: string; notes: string[]; finalMessage?: string; position?: number },
  ) {
    const note = await this.prisma.executionNote.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_EXECUTION_NOTE', 'ExecutionNote', note.id, { title: dto.title });
    return note;
  }

  async updateExecutionNote(adminUserId: string, id: string, dto: any) {
    const note = await this.prisma.executionNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Execution note not found');

    const updated = await this.prisma.executionNote.update({ where: { id }, data: dto });
    await this.logAdminAction(adminUserId, 'UPDATE_EXECUTION_NOTE', 'ExecutionNote', id, dto);
    return updated;
  }

  async deleteExecutionNote(adminUserId: string, id: string) {
    const note = await this.prisma.executionNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Execution note not found');
    await this.prisma.executionNote.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ── BFR Content ───────────────────────────────────────────────
  async getBFRContent(category?: string) {
    return this.prisma.bFRContent.findMany({
      where: {
        ...(category ? { category: category as any } : {}),
        isActive: true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createBFRContent(adminUserId: string, dto: any) {
    const content = await this.prisma.bFRContent.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_BFR_CONTENT', 'BFRContent', content.id, { title: dto.title });
    return content;
  }

  async updateBFRContent(adminUserId: string, id: string, dto: any) {
    const item = await this.prisma.bFRContent.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('BFR content not found');
    const updated = await this.prisma.bFRContent.update({ where: { id }, data: dto });
    await this.logAdminAction(adminUserId, 'UPDATE_BFR_CONTENT', 'BFRContent', id, dto);
    return updated;
  }

  async deleteBFRContent(adminUserId: string, id: string) {
    await this.prisma.bFRContent.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ── Essential Content ─────────────────────────────────────────
  async getEssentialContent(category?: string) {
    return this.prisma.essentialContent.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createEssentialContent(adminUserId: string, dto: {
    title: string;
    description?: string;
    content: string;
    imageUrl?: string;
    finalMessage?: string;
    category?: string;
    sortOrder?: number;
  }) {
    const item = await this.prisma.essentialContent.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_ESSENTIAL_CONTENT', 'EssentialContent', item.id, { title: dto.title });
    return item;
  }

  async updateEssentialContent(adminUserId: string, id: string, dto: any) {
    const item = await this.prisma.essentialContent.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Essential content not found');
    const updated = await this.prisma.essentialContent.update({ where: { id }, data: dto });
    await this.logAdminAction(adminUserId, 'UPDATE_ESSENTIAL_CONTENT', 'EssentialContent', id, dto);
    return updated;
  }

  async deleteEssentialContent(adminUserId: string, id: string) {
    await this.prisma.essentialContent.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 7 — ESSENTIAL MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  // ── Health Marker Groups ──────────────────────────────────────
  async getHealthMarkerGroups() {
    return this.prisma.healthMarkerGroup.findMany({
      where: { isActive: true },
      include: { markers: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createHealthMarkerGroup(
    adminUserId: string,
    dto: { category: any; name: string; description?: string; markers: string[] },
  ) {
    const group = await this.prisma.healthMarkerGroup.create({
      data: {
        category: dto.category,
        name: dto.name,
        description: dto.description,
        markers: {
          create: dto.markers.map((name, i) => ({ name, sortOrder: i })),
        },
      },
      include: { markers: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.logAdminAction(adminUserId, 'CREATE_HEALTH_MARKER_GROUP', 'HealthMarkerGroup', group.id, { name: dto.name });
    return group;
  }

  async updateHealthMarkerGroup(adminUserId: string, id: string, dto: any) {
    const group = await this.prisma.healthMarkerGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Health marker group not found');
    return this.prisma.healthMarkerGroup.update({ where: { id }, data: dto });
  }

  async deleteHealthMarkerGroup(adminUserId: string, id: string) {
    await this.prisma.healthMarkerGroup.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ── Partner Clinics ───────────────────────────────────────────
  async getPartnerClinics(query: { city?: string; country?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.PartnerClinicWhereInput = { isActive: true };
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.country) where.country = { contains: query.country, mode: 'insensitive' };

    const [clinics, total] = await Promise.all([
      this.prisma.partnerClinic.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.partnerClinic.count({ where }),
    ]);

    return { data: clinics, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createPartnerClinic(adminUserId: string, dto: any) {
    const clinic = await this.prisma.partnerClinic.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_CLINIC', 'PartnerClinic', clinic.id, { name: dto.name });
    return clinic;
  }

  async updatePartnerClinic(adminUserId: string, id: string, dto: any) {
    const clinic = await this.prisma.partnerClinic.findUnique({ where: { id } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.prisma.partnerClinic.update({ where: { id }, data: dto });
  }

  async deletePartnerClinic(adminUserId: string, id: string) {
    await this.prisma.partnerClinic.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ── Supplement Products ───────────────────────────────────────
  async getSupplementProducts(query: { category?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const where: any = { isActive: true };
    if (query.category) where.category = query.category;

    const [products, total] = await Promise.all([
      this.prisma.supplementProduct.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.supplementProduct.count({ where }),
    ]);

    return { data: products, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createSupplementProduct(adminUserId: string, dto: {
    name: string;
    category: any;
    price: number;
    currency?: string;
    vendorName?: string;
    purchasePageUrl: string;
    benefits?: string[];
    imageUrl?: string;
    sortOrder?: number;
  }) {
    const product = await this.prisma.supplementProduct.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_SUPPLEMENT', 'SupplementProduct', product.id, { name: dto.name });
    return product;
  }

  async updateSupplementProduct(adminUserId: string, id: string, dto: any) {
    const product = await this.prisma.supplementProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Supplement product not found');
    return this.prisma.supplementProduct.update({ where: { id }, data: dto });
  }

  async deleteSupplementProduct(adminUserId: string, id: string) {
    await this.prisma.supplementProduct.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ── Gyms ──────────────────────────────────────────────────────
  async getGyms(query: { city?: string; country?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const where: any = { isActive: true };
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.country) where.country = { contains: query.country, mode: 'insensitive' };

    const [gyms, total] = await Promise.all([
      this.prisma.gym.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { name: 'asc' } }),
      this.prisma.gym.count({ where }),
    ]);

    return { data: gyms, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createGym(adminUserId: string, dto: any) {
    const gym = await this.prisma.gym.create({ data: dto });
    await this.logAdminAction(adminUserId, 'CREATE_GYM', 'Gym', gym.id, { name: dto.name });
    return gym;
  }

  async updateGym(adminUserId: string, id: string, dto: any) {
    const gym = await this.prisma.gym.findUnique({ where: { id } });
    if (!gym) throw new NotFoundException('Gym not found');
    return this.prisma.gym.update({ where: { id }, data: dto });
  }

  async deleteGym(adminUserId: string, id: string) {
    await this.prisma.gym.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 8 — PREMIUM & PAYMENTS
  // ══════════════════════════════════════════════════════════════

  async getSubscriptionPlans() {
    return this.prisma.subscriptionPlanConfig.findMany({
      orderBy: { priceUSD: 'asc' },
    });
  }

  async upsertSubscriptionPlan(
    adminUserId: string,
    dto: {
      name: string;
      plan: SubscriptionPlan;
      billingPeriod?: any;
      priceUSD: number;
      isPopular?: boolean;
      savingsPercent?: number;
      features: string[];
      stripePriceId?: string;
      isActive?: boolean;
    },
  ) {
    const result = await this.prisma.subscriptionPlanConfig.upsert({
      where: { plan: dto.plan },
      create: { ...dto, updatedBy: adminUserId },
      update: { ...dto, updatedBy: adminUserId },
    });
    await this.logAdminAction(adminUserId, 'UPSERT_PLAN', 'SubscriptionPlanConfig', result.id, dto);
    return result;
  }

  async getPayments(query: {
    page?: number;
    limit?: number;
    status?: PaymentStatus;
    userId?: string;
    plan?: SubscriptionPlan;
    from?: Date;
    to?: Date;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.PaymentTransactionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;
    if (query.plan) where.plan = query.plan;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [payments, total, aggregate] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.aggregate({
        where: { ...where, status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalRevenue: Math.round((aggregate._sum.amount ?? 0) * 100) / 100,
        successfulTransactions: aggregate._count.id,
      },
    };
  }

  async getPaymentStats() {
    const now = new Date();
    const [byStatus, byPlan, last30, last7] = await Promise.all([
      this.prisma.paymentTransaction.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.groupBy({
        by: ['plan'],
        where: { status: PaymentStatus.SUCCEEDED },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          status: PaymentStatus.SUCCEEDED,
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      byStatus,
      byPlan,
      last30Days: { revenue: last30._sum.amount ?? 0, count: last30._count.id },
      last7Days: { revenue: last7._sum.amount ?? 0, count: last7._count.id },
    };
  }

  async refundPayment(adminUserId: string, paymentId: string, refundAmount?: number) {
    const payment = await this.prisma.paymentTransaction.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Only succeeded payments can be refunded');
    }

    const amount = refundAmount ?? payment.amount;
    const updated = await this.prisma.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
        refundAmount: amount,
      },
    });

    await this.logAdminAction(adminUserId, 'REFUND_PAYMENT', 'PaymentTransaction', paymentId, { amount });
    return updated;
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 9 — NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════

  async getNotificationTemplates() {
    return this.prisma.pushNotificationTemplate.findMany({
      include: {
        _count: { select: { blasts: true } },
      },
      orderBy: { category: 'asc' },
    });
  }

  async createNotificationTemplate(
    adminUserId: string,
    dto: {
      name: string;
      category: any;
      titleTemplate: string;
      bodyTemplate: string;
      isEnabled?: boolean;
      scheduledCron?: string;
    },
  ) {
    const template = await this.prisma.pushNotificationTemplate.create({
      data: { ...dto, updatedBy: adminUserId },
    });
    await this.logAdminAction(adminUserId, 'CREATE_NOTIF_TEMPLATE', 'PushNotificationTemplate', template.id, { name: dto.name });
    return template;
  }

  async updateNotificationTemplate(adminUserId: string, templateId: string, dto: any) {
    const template = await this.prisma.pushNotificationTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template not found');

    const updated = await this.prisma.pushNotificationTemplate.update({
      where: { id: templateId },
      data: { ...dto, updatedBy: adminUserId },
    });
    await this.logAdminAction(adminUserId, 'UPDATE_NOTIF_TEMPLATE', 'PushNotificationTemplate', templateId, dto);
    return updated;
  }

  async deleteNotificationTemplate(adminUserId: string, templateId: string) {
    await this.prisma.pushNotificationTemplate.delete({ where: { id: templateId } });
    return { success: true };
  }

  async sendNotificationBlast(
    adminUserId: string,
    dto: {
      templateId?: string;
      audience: NotificationAudience;
      title: string;
      message: string;
      scheduledAt?: Date;
    },
  ) {
    // Determine target user count
    const userCount = await this.getAudienceCount(dto.audience);

    const blast = await this.prisma.notificationBlast.create({
      data: {
        ...dto,
        sentByAdminId: adminUserId,
        sentAt: dto.scheduledAt ? undefined : new Date(),
        totalSent: dto.scheduledAt ? 0 : userCount,
      },
    });

    // If not scheduled — create in-app notifications for all target users
    if (!dto.scheduledAt) {
      const userIds = await this.getAudienceUserIds(dto.audience);
      const BATCH = 500;
      for (let i = 0; i < userIds.length; i += BATCH) {
        const batch = userIds.slice(i, i + BATCH);
        await this.prisma.notification.createMany({
          data: batch.map((uid) => ({
            userId: uid,
            type: 'SYSTEM' as any,
            title: dto.title,
            body: dto.message,
          })),
          skipDuplicates: true,
        });
      }
    }

    await this.logAdminAction(adminUserId, 'SEND_BLAST', 'NotificationBlast', blast.id, { audience: dto.audience, userCount });
    return { ...blast, estimatedRecipients: userCount };
  }

  async getNotificationBlasts(query: { page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const [blasts, total] = await Promise.all([
      this.prisma.notificationBlast.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: { template: { select: { name: true, category: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationBlast.count(),
    ]);

    return { data: blasts, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  private async getAudienceCount(audience: NotificationAudience): Promise<number> {
    const where = this.buildAudienceWhere(audience);
    return this.prisma.user.count({ where });
  }

  private async getAudienceUserIds(audience: NotificationAudience): Promise<string[]> {
    const where = this.buildAudienceWhere(audience);
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    return users.map((u) => u.id);
  }

  private buildAudienceWhere(audience: NotificationAudience): Prisma.UserWhereInput {
    const now = new Date();
    switch (audience) {
      case NotificationAudience.PREMIUM_USERS:
        return { isPremium: true, isActive: true };
      case NotificationAudience.FREE_USERS:
        return { isPremium: false, trialEndsAt: { lt: now }, isActive: true };
      case NotificationAudience.TRIAL_USERS:
        return { trialEndsAt: { gt: now }, isPremium: false, isActive: true };
      case NotificationAudience.COACHES:
        return { role: UserRole.COACH, isActive: true };
      case NotificationAudience.COACHED_CLIENTS:
        return { clientProfile: { isNot: null }, isActive: true };
      default: // ALL_USERS
        return { isActive: true };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 10 — AUDIT LOG
  // ══════════════════════════════════════════════════════════════

  async getAuditLog(query: {
    page?: number;
    limit?: number;
    adminUserId?: string;
    action?: string;
    targetType?: string;
    from?: Date;
    to?: Date;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, query.limit ?? 20);

    const where: Prisma.AdminActivityLogWhereInput = {};
    if (query.adminUserId) where.adminUserId = query.adminUserId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.targetType) where.targetType = query.targetType;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.adminActivityLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.adminActivityLog.count({ where }),
    ]);

    // Enrich with admin names
    const adminIds = [...new Set(logs.map((l) => l.adminUserId))];
    const admins = await this.prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const adminLookup = Object.fromEntries(admins.map((a) => [a.id, a]));

    return {
      data: logs.map((l) => ({ ...l, admin: adminLookup[l.adminUserId] ?? null })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 11 — APP CONFIG
  // ══════════════════════════════════════════════════════════════

  async getAppConfigs(group?: string) {
    return this.prisma.appConfig.findMany({
      where: group ? { group } : {},
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async upsertAppConfig(
    adminUserId: string,
    key: string,
    dto: { value: string; type?: string; group?: string },
  ) {
    const config = await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, ...dto, updatedBy: adminUserId },
      update: { ...dto, updatedBy: adminUserId },
    });
    await this.logAdminAction(adminUserId, 'UPSERT_APP_CONFIG', 'AppConfig', config.id, { key });
    return config;
  }

  async deleteAppConfig(adminUserId: string, key: string) {
    const config = await this.prisma.appConfig.findUnique({ where: { key } });
    if (!config) throw new NotFoundException(`Config key "${key}" not found`);
    await this.prisma.appConfig.delete({ where: { key } });
    await this.logAdminAction(adminUserId, 'DELETE_APP_CONFIG', 'AppConfig', config.id, { key });
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════

  private async logAdminAction(
    adminUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: object,
  ) {
    await this.prisma.adminActivityLog
      .create({ data: { adminUserId, action, targetType, targetId, details } })
      .catch((err) => this.logger.error(`Failed to log admin action: ${err.message}`));
  }
}