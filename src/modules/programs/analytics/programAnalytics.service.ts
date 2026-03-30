// src/modules/programs/program-analytics.service.ts
//
// Handles all program dashboard analytics:
//   - Summary cards (total programs, active enrollments, premium count, avg completion)
//   - Top programs by enrollments
//   - Full performance breakdown table with revenue + trend

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentStatus, SubscriptionPlan } from '@prisma/client';

@Injectable()
export class ProgramAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY CARDS
  // Used by: "Program Management" header cards
  // Returns: totalPrograms, activeEnrollments, premiumPrograms, avgCompletion
  // ══════════════════════════════════════════════════════════════════════════

  async getSummary() {
    const [
      totalPrograms,
      premiumPrograms,
      analytics,
      activeEnrollments,
    ] = await Promise.all([
      // Total published programs
      this.prisma.program.count({
        where: { isPublished: true, isActive: true },
      }),

      // Premium-only programs
      this.prisma.program.count({
        where: { isPublished: true, isActive: true, isPremium: true },
      }),

      // All analytics records for avg completion calculation
      this.prisma.programAnalytics.findMany({
        select: { completionRate: true, activeEnrollments: true, totalEnrollments: true },
      }),

      // Total active enrollments (users currently on a program)
      this.prisma.userActiveProgram.count(),
    ]);

    const avgCompletion =
      analytics.length > 0
        ? Math.round(
            analytics.reduce((sum, a) => sum + a.completionRate, 0) /
              analytics.length,
          )
        : 0;

    const totalEnrollments = analytics.reduce(
      (sum, a) => sum + a.totalEnrollments,
      0,
    );

    return {
      totalPrograms,
      activeEnrollments,
      premiumPrograms,
      avgCompletion,      // % across all programs
      totalEnrollments,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOP PROGRAMS BY ENROLLMENT
  // Used by: "Enrollment Programs" section (bar chart / list)
  // Returns top N programs sorted by totalEnrollments
  // ══════════════════════════════════════════════════════════════════════════

  async getTopByEnrollment(limit = 10) {
    const programs = await this.prisma.program.findMany({
      where: { isPublished: true, isActive: true },
      include: {
        analytics: {
          select: {
            totalEnrollments: true,
            activeEnrollments: true,
            completionRate:   true,
            completedCount:   true,
          },
        },
      },
      orderBy: { analytics: { totalEnrollments: 'desc' } },
      take: limit,
    });

    return programs.map((p) => ({
      id:               p.id,
      name:             p.name,
      durationWeeks:    p.durationWeeks,
      isPremium:        p.isPremium,
      thumbnailUrl:     p.thumbnailUrl,
      totalEnrollments: p.analytics?.totalEnrollments ?? 0,
      activeEnrollments: p.analytics?.activeEnrollments ?? 0,
      completionRate:   Math.round(p.analytics?.completionRate ?? 0),
      completedCount:   p.analytics?.completedCount ?? 0,
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE BREAKDOWN TABLE
  // Used by: "Program Performance Breakdown" table
  // Returns full metrics per program including revenue + trend
  // ══════════════════════════════════════════════════════════════════════════

  async getPerformanceBreakdown(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [programs, total] = await Promise.all([
      this.prisma.program.findMany({
        where: { isPublished: true },
        include: {
          analytics: true,
          _count: { select: { reviews: true } },
        },
        orderBy: { analytics: { totalEnrollments: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.program.count({ where: { isPublished: true } }),
    ]);

    // Calculate revenue from premium subscriptions
    // Revenue is estimated: premium users × avg subscription price
    // (since programs don't have individual prices — they're all behind premium subscription)
    const [monthlyRevenue, premiumUserCount] = await Promise.all([
      this.prisma.paymentTransaction.aggregate({
        where:   { status: PaymentStatus.SUCCEEDED },
        _sum:    { amount: true },
      }),
      this.prisma.user.count({ where: { isPremium: true } }),
    ]);

    const totalRevenue = monthlyRevenue._sum.amount ?? 0;

    // Distribute revenue proportionally across premium programs by active users
    const premiumPrograms     = programs.filter((p) => p.isPremium);
    const totalPremiumActive  = premiumPrograms.reduce(
      (sum, p) => sum + (p.analytics?.activeEnrollments ?? 0), 0,
    );

    const rows = programs.map((p) => {
      const analytics       = p.analytics;
      const enrollments     = analytics?.totalEnrollments  ?? 0;
      const activeUsers     = analytics?.activeEnrollments ?? 0;
      const completionRate  = Math.round(analytics?.completionRate ?? 0);
      const completedCount  = analytics?.completedCount    ?? 0;

      // Revenue: proportional share for premium programs
      let estimatedRevenue = 0;
      if (p.isPremium && totalPremiumActive > 0) {
        estimatedRevenue = Math.round(
          (activeUsers / totalPremiumActive) * totalRevenue,
        );
      }

      // Trend: compare active enrollments vs completed
      // Simple heuristic: if completionRate > 50% → growing, else declining
      const trend: 'GROWING' | 'DECLINING' | 'STABLE' =
        completionRate >= 50
          ? 'GROWING'
          : completionRate >= 25
          ? 'STABLE'
          : 'DECLINING';

      return {
        id:              p.id,
        name:            p.name,
        type:            `${p.durationWeeks} Weeks`,
        durationWeeks:   p.durationWeeks,
        difficulty:      p.difficulty,
        isPremium:       p.isPremium,
        isActive:        p.isActive,
        isPublished:     p.isPublished,
        thumbnailUrl:    p.thumbnailUrl,
        enrollments,
        activeUsers,
        completionRate,
        completedCount,
        estimatedRevenue,
        trend,
        trendIcon:       trend === 'GROWING' ? '↑ Growing' : trend === 'DECLINING' ? '↓ Declining' : '→ Stable',
        reviewCount:     p._count.reviews,
      };
    });

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages:      Math.ceil(total / limit),
        totalRevenue:    Math.round(totalRevenue),
        premiumUserCount,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SINGLE PROGRAM ANALYTICS
  // Detailed stats for one program
  // ══════════════════════════════════════════════════════════════════════════

  async getProgramStats(programId: string) {
    const [program, weekProgress] = await Promise.all([
      this.prisma.program.findUnique({
        where:   { id: programId },
        include: { analytics: true },
      }),

      // How far along are active users (week distribution)
      this.prisma.userActiveProgram.groupBy({
        by:    ['currentWeek'],
        where: { programId },
        _count: { currentWeek: true },
        orderBy: { currentWeek: 'asc' },
      }),
    ]);

    if (!program) return null;

    const a = program.analytics;

    // Completion funnel: enrolled → active → completed
    const enrolled   = a?.totalEnrollments  ?? 0;
    const active     = a?.activeEnrollments ?? 0;
    const completed  = a?.completedCount    ?? 0;
    const dropped    = enrolled - active - completed;

    return {
      id:             program.id,
      name:           program.name,
      durationWeeks:  program.durationWeeks,
      isPremium:      program.isPremium,
      summary: {
        totalEnrollments:  enrolled,
        activeEnrollments: active,
        completedCount:    completed,
        droppedCount:      Math.max(0, dropped),
        completionRate:    Math.round(a?.completionRate    ?? 0),
        avgWeeksCompleted: Math.round(a?.avgWeeksCompleted ?? 0),
      },
      // Week-by-week distribution of current active users
      weekDistribution: weekProgress.map((w) => ({
        week:  w.currentWeek,
        users: w._count.currentWeek,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECALCULATE ANALYTICS (admin utility — call after bulk operations)
  // Updates ProgramAnalytics from live data
  // ══════════════════════════════════════════════════════════════════════════

  async recalculate(programId: string) {
    const [totalEnrollments, activeEnrollments, completedPrograms] =
      await Promise.all([
        this.prisma.userProgram.count({ where: { programId } }),
        this.prisma.userActiveProgram.count({ where: { programId } }),
        this.prisma.userProgram.count({ where: { programId, isCompleted: true } }),
      ]);

    const completionRate =
      totalEnrollments > 0
        ? Math.round((completedPrograms / totalEnrollments) * 100)
        : 0;

    // Average weeks completed by all enrolled users
    const avgResult = await this.prisma.userProgram.aggregate({
      where: { programId },
      _avg:  { completedWeeks: true },
    });
    const avgWeeksCompleted = Math.round(avgResult._avg.completedWeeks ?? 0);

    await this.prisma.programAnalytics.upsert({
      where:  { programId },
      create: { programId, totalEnrollments, activeEnrollments, completedCount: completedPrograms, completionRate, avgWeeksCompleted },
      update: { totalEnrollments, activeEnrollments, completedCount: completedPrograms, completionRate, avgWeeksCompleted },
    });

    return { programId, totalEnrollments, activeEnrollments, completedCount: completedPrograms, completionRate, avgWeeksCompleted };
  }
}