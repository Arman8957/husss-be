import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentStatus, Prisma } from '@prisma/client';
 
@Injectable()
export class ProgramAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
 
  async getSummary() {
    const [totalPrograms, premiumPrograms, analytics, activeEnrollments] = await Promise.all([
      this.prisma.program.count({ where: { isPublished: true, isActive: true } }),
      this.prisma.program.count({ where: { isPublished: true, isActive: true, isPremium: true } }),
      this.prisma.programAnalytics.findMany({
        select: { completionRate: true, activeEnrollments: true, totalEnrollments: true },
      }),
      this.prisma.userActiveProgram.count(),
    ]);
    const avgCompletion = analytics.length
      ? Math.round(analytics.reduce((s, a) => s + a.completionRate, 0) / analytics.length) : 0;
    const totalEnrollments = analytics.reduce((s, a) => s + a.totalEnrollments, 0);
    return { totalPrograms, activeEnrollments, premiumPrograms, avgCompletion, totalEnrollments };
  }
 
  async getTopByEnrollment(limit = 10) {
    const programs = await this.prisma.program.findMany({
      where:   { isPublished: true, isActive: true },
      include: { analytics: { select: { totalEnrollments: true, activeEnrollments: true, completionRate: true, completedCount: true } } },
      orderBy: { analytics: { totalEnrollments: 'desc' } },
      take:    limit,
    });
    return programs.map((p) => ({
      id: p.id, name: p.name, durationWeeks: p.durationWeeks, isPremium: p.isPremium,
      thumbnailUrl: p.thumbnailUrl,
      totalEnrollments:  p.analytics?.totalEnrollments  ?? 0,
      activeEnrollments: p.analytics?.activeEnrollments ?? 0,
      completionRate:    Math.round(p.analytics?.completionRate ?? 0),
      completedCount:    p.analytics?.completedCount    ?? 0,
    }));
  }
 
  // ── PERFORMANCE BREAKDOWN — with search (regex on name / title) ──────────
  //
  // search param: plain string → converted to case-insensitive regex
  // Matches partial names: "monster", "8w", "classic", "2-2", etc.
 
  async getPerformanceBreakdown(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
 
    // Build where clause — regex search on program name
    const where: Prisma.ProgramWhereInput = { isPublished: true };
    if (search?.trim()) {
      where.name = {
        contains: search.trim(),
        mode:     'insensitive',   // case-insensitive — effectively /search/i
      };
    }
 
    const [programs, total, revenueResult] = await Promise.all([
      this.prisma.program.findMany({
        where,
        include: {
          analytics:  true,
          _count:     { select: { reviews: true } },
        },
        orderBy: { analytics: { totalEnrollments: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.program.count({ where }),
      this.prisma.paymentTransaction.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum:  { amount: true },
      }),
    ]);
 
    const totalRevenue       = revenueResult._sum.amount ?? 0;
    const premiumPrograms    = programs.filter((p) => p.isPremium);
    const totalPremiumActive = premiumPrograms.reduce(
      (s, p) => s + (p.analytics?.activeEnrollments ?? 0), 0,
    );
 
    const rows = programs.map((p) => {
      const a            = p.analytics;
      const enrollments  = a?.totalEnrollments  ?? 0;
      const activeUsers  = a?.activeEnrollments ?? 0;
      const completionRate = Math.round(a?.completionRate ?? 0);
 
      let estimatedRevenue = 0;
      if (p.isPremium && totalPremiumActive > 0) {
        estimatedRevenue = Math.round((activeUsers / totalPremiumActive) * totalRevenue);
      }
 
      const trend: 'GROWING' | 'DECLINING' | 'STABLE' =
        completionRate >= 50 ? 'GROWING' : completionRate >= 25 ? 'STABLE' : 'DECLINING';
 
      return {
        id: p.id, name: p.name,
        type: `${p.durationWeeks} Weeks`, durationWeeks: p.durationWeeks,
        difficulty: p.difficulty, isPremium: p.isPremium,
        isActive: p.isActive, isPublished: p.isPublished, thumbnailUrl: p.thumbnailUrl,
        enrollments, activeUsers, completionRate,
        completedCount:   a?.completedCount ?? 0,
        estimatedRevenue,
        trend,
        trendIcon:   trend === 'GROWING' ? '↑ Growing' : trend === 'DECLINING' ? '↓ Declining' : '→ Stable',
        reviewCount: p._count.reviews,
      };
    });
 
    return {
      data: rows,
      meta: {
        total, page, limit, totalPages: Math.ceil(total / limit),
        totalRevenue: Math.round(totalRevenue),
        searchTerm:   search ?? null,
      },
    };
  }
 
  async getProgramStats(programId: string) {
    const [program, weekProgress] = await Promise.all([
      this.prisma.program.findUnique({ where: { id: programId }, include: { analytics: true } }),
      this.prisma.userActiveProgram.groupBy({
        by: ['currentWeek'], where: { programId },
        _count: { currentWeek: true }, orderBy: { currentWeek: 'asc' },
      }),
    ]);
    if (!program) return null;
    const a = program.analytics;
    const enrolled  = a?.totalEnrollments  ?? 0;
    const active    = a?.activeEnrollments ?? 0;
    const completed = a?.completedCount    ?? 0;
    return {
      id: program.id, name: program.name,
      durationWeeks: program.durationWeeks, isPremium: program.isPremium,
      summary: {
        totalEnrollments: enrolled, activeEnrollments: active,
        completedCount: completed, droppedCount: Math.max(0, enrolled - active - completed),
        completionRate: Math.round(a?.completionRate ?? 0),
        avgWeeksCompleted: Math.round(a?.avgWeeksCompleted ?? 0),
      },
      weekDistribution: weekProgress.map((w) => ({ week: w.currentWeek, users: w._count.currentWeek })),
    };
  }
 
  async recalculate(programId: string) {
    const [totalEnrollments, activeEnrollments, completedPrograms] = await Promise.all([
      this.prisma.userProgram.count({ where: { programId } }),
      this.prisma.userActiveProgram.count({ where: { programId } }),
      this.prisma.userProgram.count({ where: { programId, isCompleted: true } }),
    ]);
    const completionRate = totalEnrollments > 0
      ? Math.round((completedPrograms / totalEnrollments) * 100) : 0;
    const avgResult = await this.prisma.userProgram.aggregate({
      where: { programId }, _avg: { completedWeeks: true },
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


// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { PaymentStatus, Prisma } from '@prisma/client';
 
// @Injectable()
// export class ProgramAnalyticsService {
//   constructor(private readonly prisma: PrismaService) {}
 
//   async getSummary() {
//     const [totalPrograms, premiumPrograms, analytics, activeEnrollments] = await Promise.all([
//       this.prisma.program.count({ where: { isPublished: true, isActive: true } }),
//       this.prisma.program.count({ where: { isPublished: true, isActive: true, isPremium: true } }),
//       this.prisma.programAnalytics.findMany({
//         select: { completionRate: true, activeEnrollments: true, totalEnrollments: true },
//       }),
//       this.prisma.userActiveProgram.count(),
//     ]);
//     const avgCompletion = analytics.length
//       ? Math.round(analytics.reduce((s, a) => s + a.completionRate, 0) / analytics.length) : 0;
//     const totalEnrollments = analytics.reduce((s, a) => s + a.totalEnrollments, 0);
//     return { totalPrograms, activeEnrollments, premiumPrograms, avgCompletion, totalEnrollments };
//   }
 
//   async getTopByEnrollment(limit = 10) {
//     const programs = await this.prisma.program.findMany({
//       where:   { isPublished: true, isActive: true },
//       include: { analytics: { select: { totalEnrollments: true, activeEnrollments: true, completionRate: true, completedCount: true } } },
//       orderBy: { analytics: { totalEnrollments: 'desc' } },
//       take:    limit,
//     });
//     return programs.map((p) => ({
//       id: p.id, name: p.name, durationWeeks: p.durationWeeks, isPremium: p.isPremium,
//       thumbnailUrl: p.thumbnailUrl,
//       totalEnrollments:  p.analytics?.totalEnrollments  ?? 0,
//       activeEnrollments: p.analytics?.activeEnrollments ?? 0,
//       completionRate:    Math.round(p.analytics?.completionRate ?? 0),
//       completedCount:    p.analytics?.completedCount    ?? 0,
//     }));
//   }
 
//   // ── PERFORMANCE BREAKDOWN — with search (regex on name / title) ──────────
//   //
//   // search param: plain string → converted to case-insensitive regex
//   // Matches partial names: "monster", "8w", "classic", "2-2", etc.
 
//   async getPerformanceBreakdown(page = 1, limit = 20, search?: string) {
//     const skip = (page - 1) * limit;
 
//     // Build where clause — regex search on program name
//     const where: Prisma.ProgramWhereInput = { isPublished: true };
//     if (search?.trim()) {
//       where.name = {
//         contains: search.trim(),
//         mode:     'insensitive',   // case-insensitive — effectively /search/i
//       };
//     }
 
//     const [programs, total, revenueResult] = await Promise.all([
//       this.prisma.program.findMany({
//         where,
//         include: {
//           analytics:  true,
//           _count:     { select: { reviews: true } },
//         },
//         orderBy: { analytics: { totalEnrollments: 'desc' } },
//         skip,
//         take: limit,
//       }),
//       this.prisma.program.count({ where }),
//       this.prisma.paymentTransaction.aggregate({
//         where: { status: PaymentStatus.SUCCEEDED },
//         _sum:  { amount: true },
//       }),
//     ]);
 
//     const totalRevenue       = revenueResult._sum.amount ?? 0;
//     const premiumPrograms    = programs.filter((p) => p.isPremium);
//     const totalPremiumActive = premiumPrograms.reduce(
//       (s, p) => s + (p.analytics?.activeEnrollments ?? 0), 0,
//     );
 
//     const rows = programs.map((p) => {
//       const a            = p.analytics;
//       const enrollments  = a?.totalEnrollments  ?? 0;
//       const activeUsers  = a?.activeEnrollments ?? 0;
//       const completionRate = Math.round(a?.completionRate ?? 0);
 
//       let estimatedRevenue = 0;
//       if (p.isPremium && totalPremiumActive > 0) {
//         estimatedRevenue = Math.round((activeUsers / totalPremiumActive) * totalRevenue);
//       }
 
//       const trend: 'GROWING' | 'DECLINING' | 'STABLE' =
//         completionRate >= 50 ? 'GROWING' : completionRate >= 25 ? 'STABLE' : 'DECLINING';
 
//       return {
//         id: p.id, name: p.name,
//         type: `${p.durationWeeks} Weeks`, durationWeeks: p.durationWeeks,
//         difficulty: p.difficulty, isPremium: p.isPremium,
//         isActive: p.isActive, isPublished: p.isPublished, thumbnailUrl: p.thumbnailUrl,
//         enrollments, activeUsers, completionRate,
//         completedCount:   a?.completedCount ?? 0,
//         estimatedRevenue,
//         trend,
//         trendIcon:   trend === 'GROWING' ? '↑ Growing' : trend === 'DECLINING' ? '↓ Declining' : '→ Stable',
//         reviewCount: p._count.reviews,
//       };
//     });
 
//     return {
//       data: rows,
//       meta: {
//         total, page, limit, totalPages: Math.ceil(total / limit),
//         totalRevenue: Math.round(totalRevenue),
//         searchTerm:   search ?? null,
//       },
//     };
//   }
 
//   async getProgramStats(programId: string) {
//     const [program, weekProgress] = await Promise.all([
//       this.prisma.program.findUnique({ where: { id: programId }, include: { analytics: true } }),
//       this.prisma.userActiveProgram.groupBy({
//         by: ['currentWeek'], where: { programId },
//         _count: { currentWeek: true }, orderBy: { currentWeek: 'asc' },
//       }),
//     ]);
//     if (!program) return null;
//     const a = program.analytics;
//     const enrolled  = a?.totalEnrollments  ?? 0;
//     const active    = a?.activeEnrollments ?? 0;
//     const completed = a?.completedCount    ?? 0;
//     return {
//       id: program.id, name: program.name,
//       durationWeeks: program.durationWeeks, isPremium: program.isPremium,
//       summary: {
//         totalEnrollments: enrolled, activeEnrollments: active,
//         completedCount: completed, droppedCount: Math.max(0, enrolled - active - completed),
//         completionRate: Math.round(a?.completionRate ?? 0),
//         avgWeeksCompleted: Math.round(a?.avgWeeksCompleted ?? 0),
//       },
//       weekDistribution: weekProgress.map((w) => ({ week: w.currentWeek, users: w._count.currentWeek })),
//     };
//   }
 
//   async recalculate(programId: string) {
//     const [totalEnrollments, activeEnrollments, completedPrograms] = await Promise.all([
//       this.prisma.userProgram.count({ where: { programId } }),
//       this.prisma.userActiveProgram.count({ where: { programId } }),
//       this.prisma.userProgram.count({ where: { programId, isCompleted: true } }),
//     ]);
//     const completionRate = totalEnrollments > 0
//       ? Math.round((completedPrograms / totalEnrollments) * 100) : 0;
//     const avgResult = await this.prisma.userProgram.aggregate({
//       where: { programId }, _avg: { completedWeeks: true },
//     });
//     const avgWeeksCompleted = Math.round(avgResult._avg.completedWeeks ?? 0);
//     await this.prisma.programAnalytics.upsert({
//       where:  { programId },
//       create: { programId, totalEnrollments, activeEnrollments, completedCount: completedPrograms, completionRate, avgWeeksCompleted },
//       update: { totalEnrollments, activeEnrollments, completedCount: completedPrograms, completionRate, avgWeeksCompleted },
//     });
//     return { programId, totalEnrollments, activeEnrollments, completedCount: completedPrograms, completionRate, avgWeeksCompleted };
//   }
// }