// src/modules/programs/program-lock.service.ts
//
// Handles ALL program & week lock/unlock operations.
// Separated from ProgramsService to keep concerns clean.
//
// LOCK HIERARCHY:
//   Level 1 — Program lock:  Program.isPremium = true
//             → Entire program requires premium subscription
//             → Users without premium see isLocked=true in library
//
//   Level 2 — Week lock:     ProgramWeek.isPremium = true
//             → Individual weeks locked, rest free
//             → Also upserts PremiumWeekLockConfig for fine-grained control
//
// RULES:
//   - Locking a program auto-locks ALL its weeks (cascade)
//   - Unlocking a program does NOT auto-unlock weeks (keeps per-week state)
//   - Locking specific weeks does NOT lock the whole program
//   - Bulk week operations are batched in a single transaction

import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

// ── Response shape ──────────────────────────────────────────────────────────
export interface LockStatusResult {
  programId:    string;
  programName:  string;
  isPremium:    boolean;   // whole-program lock
  weeks: Array<{
    weekId:      string;
    weekNumber:  number;
    isPremium:   boolean;  // per-week lock (ProgramWeek.isPremium)
    lockConfig:  boolean;  // PremiumWeekLockConfig.isPremiumLock
  }>;
}

@Injectable()
export class ProgramLockService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // GET — Current lock status (program + all weeks)
  // GET /admin/programs/:id/lock-status
  // ══════════════════════════════════════════════════════════════════════════

  async getLockStatus(programId: string): Promise<LockStatusResult> {
    const program = await this.prisma.program.findUnique({
      where:   { id: programId },
      select: {
        id:        true,
        name:      true,
        isPremium: true,
        weeks: {
          orderBy: { weekNumber: 'asc' },
          select: {
            id:         true,
            weekNumber: true,
            isPremium:  true,
          },
        },
        weekLockConfigs: {
          select: {
            weekNumber:    true,
            isPremiumLock: true,
          },
        },
      },
    });
    if (!program) throw new NotFoundException(`Program "${programId}" not found`);

    const lockConfigMap = new Map(
      program.weekLockConfigs.map((c) => [c.weekNumber, c.isPremiumLock]),
    );

    return {
      programId:   program.id,
      programName: program.name,
      isPremium:   program.isPremium,
      weeks:       program.weeks.map((w) => ({
        weekId:     w.id,
        weekNumber: w.weekNumber,
        isPremium:  w.isPremium,
        lockConfig: lockConfigMap.get(w.weekNumber) ?? false,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCK / UNLOCK — Entire Program
  // PATCH /admin/programs/:id/lock
  // Body: { lock: true } | { lock: false }
  //
  // lock=true:  Sets Program.isPremium=true
  //             Cascades to ALL weeks (ProgramWeek.isPremium=true)
  //             Upserts PremiumWeekLockConfig for every week
  //
  // lock=false: Sets Program.isPremium=false only
  //             Leaves per-week state UNCHANGED (admin may want some weeks locked)
  //             To also unlock all weeks, use bulk week unlock
  // ══════════════════════════════════════════════════════════════════════════

  async setProgramLock(
    programId:   string,
    lock:        boolean,
    adminUserId: string,
  ) {
    const program = await this.prisma.program.findUnique({
      where:  { id: programId },
      select: { id: true, name: true, isPremium: true, weeks: { select: { id: true, weekNumber: true } } },
    });
    if (!program) throw new NotFoundException(`Program "${programId}" not found`);

    if (program.isPremium === lock) {
      return {
        message:   `Program is already ${lock ? 'locked' : 'unlocked'}.`,
        programId,
        isPremium: lock,
        changed:   false,
      };
    }

    if (lock) {
      // ── LOCK: cascade to all weeks in ONE transaction ──────────────────
      await this.prisma.$transaction(async (tx) => {
        // 1. Lock the program
        await tx.program.update({
          where: { id: programId },
          data:  { isPremium: true },
        });

        // 2. Lock ALL weeks
        await tx.programWeek.updateMany({
          where: { programId },
          data:  { isPremium: true },
        });

        // 3. Upsert PremiumWeekLockConfig for each week
        for (const week of program.weeks) {
          await tx.premiumWeekLockConfig.upsert({
            where:  { programId_weekNumber: { programId, weekNumber: week.weekNumber } },
            create: { programId, weekNumber: week.weekNumber, isPremiumLock: true, updatedByAdminId: adminUserId },
            update: { isPremiumLock: true, updatedByAdminId: adminUserId },
          });
        }

        // 4. Log action
        await tx.adminActivityLog.create({
          data: { adminUserId, action: 'PROGRAM_LOCKED', targetType: 'Program', targetId: programId,
                  details: { name: program.name, weeksLocked: program.weeks.length } },
        }).catch(() => {});
      });

      return {
        message:      `Program "${program.name}" locked. All ${program.weeks.length} week(s) are now premium-only.`,
        programId,
        isPremium:    true,
        weeksAffected: program.weeks.length,
        changed:      true,
      };
    } else {
      // ── UNLOCK program only ────────────────────────────────────────────
      await this.prisma.$transaction(async (tx) => {
        await tx.program.update({
          where: { id: programId },
          data:  { isPremium: false },
        });

        await tx.adminActivityLog.create({
          data: { adminUserId, action: 'PROGRAM_UNLOCKED', targetType: 'Program', targetId: programId,
                  details: { name: program.name } },
        }).catch(() => {});
      });

      return {
        message:   `Program "${program.name}" unlocked. Per-week locks are unchanged — use bulk week unlock if needed.`,
        programId,
        isPremium: false,
        changed:   true,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCK / UNLOCK — Single Week
  // PATCH /admin/programs/:id/weeks/:weekNumber/lock
  // Body: { lock: true } | { lock: false }
  // ══════════════════════════════════════════════════════════════════════════

  async setWeekLock(
    programId:   string,
    weekNumber:  number,
    lock:        boolean,
    adminUserId: string,
  ) {
    const week = await this.prisma.programWeek.findUnique({
      where:  { programId_weekNumber: { programId, weekNumber } },
      select: { id: true, isPremium: true },
    });
    if (!week) {
      throw new NotFoundException(
        `Week ${weekNumber} not found in program "${programId}". ` +
        `Make sure the day split has been configured for this week.`,
      );
    }

    if (week.isPremium === lock) {
      return {
        message:    `Week ${weekNumber} is already ${lock ? 'locked' : 'unlocked'}.`,
        programId,
        weekNumber,
        isPremium:  lock,
        changed:    false,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      // Update ProgramWeek
      await tx.programWeek.update({
        where: { id: week.id },
        data:  { isPremium: lock },
      });

      // Upsert PremiumWeekLockConfig (fine-grained config record)
      await tx.premiumWeekLockConfig.upsert({
        where:  { programId_weekNumber: { programId, weekNumber } },
        create: { programId, weekNumber, isPremiumLock: lock, updatedByAdminId: adminUserId },
        update: { isPremiumLock: lock, updatedByAdminId: adminUserId },
      });

      await tx.adminActivityLog.create({
        data: { adminUserId,
                action: lock ? 'WEEK_LOCKED' : 'WEEK_UNLOCKED',
                targetType: 'ProgramWeek',
                targetId:    week.id,
                details:    { programId, weekNumber, isPremium: lock } },
      }).catch(() => {});
    });

    return {
      message:    `Week ${weekNumber} ${lock ? 'locked (premium only)' : 'unlocked (free access)'}.`,
      programId,
      weekNumber,
      weekId:     week.id,
      isPremium:  lock,
      changed:    true,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BULK — Lock / Unlock specific weeks
  // PATCH /admin/programs/:id/weeks/bulk-lock
  // Body: { weekNumbers: [1,2,3], lock: true }
  // ══════════════════════════════════════════════════════════════════════════

  async bulkSetWeekLock(
    programId:   string,
    weekNumbers: number[],
    lock:        boolean,
    adminUserId: string,
  ) {
    if (!weekNumbers.length) {
      throw new BadRequestException('weekNumbers array cannot be empty.');
    }

    // Validate all weeks exist
    const existingWeeks = await this.prisma.programWeek.findMany({
      where:  { programId, weekNumber: { in: weekNumbers } },
      select: { id: true, weekNumber: true, isPremium: true },
    });

    const foundNums  = new Set(existingWeeks.map((w) => w.weekNumber));
    const missing    = weekNumbers.filter((n) => !foundNums.has(n));
    if (missing.length) {
      throw new NotFoundException(
        `Week(s) [${missing.join(', ')}] not found. Configure day split for these weeks first.`,
      );
    }

    const toChange = existingWeeks.filter((w) => w.isPremium !== lock);
    if (!toChange.length) {
      return {
        message:       `All specified weeks are already ${lock ? 'locked' : 'unlocked'}. No changes made.`,
        programId,
        weekNumbers,
        lock,
        changed:       0,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      // Batch update ProgramWeek
      await tx.programWeek.updateMany({
        where: { programId, weekNumber: { in: toChange.map((w) => w.weekNumber) } },
        data:  { isPremium: lock },
      });

      // Upsert each PremiumWeekLockConfig individually (no createMany with upsert in Prisma)
      for (const week of toChange) {
        await tx.premiumWeekLockConfig.upsert({
          where:  { programId_weekNumber: { programId, weekNumber: week.weekNumber } },
          create: { programId, weekNumber: week.weekNumber, isPremiumLock: lock, updatedByAdminId: adminUserId },
          update: { isPremiumLock: lock, updatedByAdminId: adminUserId },
        });
      }

      await tx.adminActivityLog.create({
        data: { adminUserId,
                action: lock ? 'BULK_WEEKS_LOCKED' : 'BULK_WEEKS_UNLOCKED',
                targetType: 'Program', targetId: programId,
                details:    { weekNumbers: toChange.map((w) => w.weekNumber), lock } },
      }).catch(() => {});
    });

    return {
      message:       `${toChange.length} week(s) ${lock ? 'locked' : 'unlocked'} successfully.`,
      programId,
      changed:       toChange.length,
      skipped:       weekNumbers.length - toChange.length,
      affectedWeeks: toChange.map((w) => w.weekNumber).sort((a, b) => a - b),
      lock,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BULK — Lock / Unlock ALL weeks in a program
  // PATCH /admin/programs/:id/weeks/lock-all
  // Body: { lock: true } | { lock: false }
  // ══════════════════════════════════════════════════════════════════════════

  async setAllWeeksLock(
    programId:   string,
    lock:        boolean,
    adminUserId: string,
  ) {
    const weeks = await this.prisma.programWeek.findMany({
      where:  { programId },
      select: { id: true, weekNumber: true },
      orderBy: { weekNumber: 'asc' },
    });

    if (!weeks.length) {
      throw new BadRequestException(
        'No weeks found for this program. Configure day split first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Batch update all weeks
      await tx.programWeek.updateMany({
        where: { programId },
        data:  { isPremium: lock },
      });

      // Upsert configs for each week
      for (const week of weeks) {
        await tx.premiumWeekLockConfig.upsert({
          where:  { programId_weekNumber: { programId, weekNumber: week.weekNumber } },
          create: { programId, weekNumber: week.weekNumber, isPremiumLock: lock, updatedByAdminId: adminUserId },
          update: { isPremiumLock: lock, updatedByAdminId: adminUserId },
        });
      }

      await tx.adminActivityLog.create({
        data: { adminUserId,
                action: lock ? 'ALL_WEEKS_LOCKED' : 'ALL_WEEKS_UNLOCKED',
                targetType: 'Program', targetId: programId,
                details:    { totalWeeks: weeks.length, lock } },
      }).catch(() => {});
    });

    return {
      message:       `All ${weeks.length} weeks ${lock ? 'locked (premium only)' : 'unlocked (free access)'}.`,
      programId,
      totalWeeks:    weeks.length,
      lock,
    };
  }
}