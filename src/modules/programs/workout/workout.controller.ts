import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { WorkoutService } from './workout.service';
import {
  StartWorkoutDto,
  LogSetDto,
  BulkLogSetsDto,
  StartRestTimerDto,
  CompleteWorkoutDto,
  WorkoutHistoryQueryDto,
  UpdateSetLogDto,
  UpdateWorkoutLogDto,
} from './dto/workout.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('User — Workout')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('workout')
export class WorkoutController {
  constructor(private readonly workoutService: WorkoutService) {}

  // ═══════════════════════════════════════════════════════════════
  // TODAY
  // ═══════════════════════════════════════════════════════════════

  @Get('today')
  @ApiOperation({
    summary: "Get Today's Workout",
    description: `Returns current week/day exercises from user's active program.
    
Always returns a real workoutLogId (PENDING on first call, IN_PROGRESS after startWorkout).
Use programDayId to call POST /workout/start, and workoutLogId for all subsequent calls.`,
  })
  getTodaysWorkout(@CurrentUser() user: any) {
    return this.workoutService.getTodaysWorkout(user.id);
  }

  // ─── Single Specific Day ──────────────────────────────────────

  @Get('day/:weekNumber/:dayNumber')
  @ApiOperation({
    summary: 'Get Single Day Workout',
    description: `Fetch any single day from the active program by week + day number.

Useful for:
- Previewing upcoming days before they reach "today"
- Reviewing a past day's plan
- Rendering a full program calendar week by week

Returns the same exercise shape as GET /today.
workoutLogId is included if a log already exists for that day, null otherwise (that day hasn't been started yet).`,
  })
  @ApiParam({
    name: 'weekNumber',
    description: 'Week number (1-based, e.g. 1–10)',
    example: '2',
  })
  @ApiParam({
    name: 'dayNumber',
    description: 'Day number within that week (1-based)',
    example: '1',
  })
  getWorkoutDay(
    @Param('weekNumber') weekNumber: string,
    @Param('dayNumber') dayNumber: string,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.getWorkoutDay(user.id, +weekNumber, +dayNumber);
  }

  // ═══════════════════════════════════════════════════════════════
  // START
  // ═══════════════════════════════════════════════════════════════

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start Workout',
    description: `Transitions the PENDING log → IN_PROGRESS and creates a WorkoutSession.
Returns the workoutLogId and sessionId needed for logging sets.
Resumes automatically if already IN_PROGRESS.
The workoutLogId stays the same — no need to update cached IDs.`,
  })
  startWorkout(@Body() dto: StartWorkoutDto, @CurrentUser() user: any) {
    return this.workoutService.startWorkout(user.id, dto);
  }

  // ═══════════════════════════════════════════════════════════════
  // LOG SETS
  // ═══════════════════════════════════════════════════════════════

  @Post(':logId/sets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Log a Set',
    description:
      'Idempotent — re-logging same setNumber/exerciseId updates the existing set.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  logSet(
    @Param('logId') logId: string,
    @Body() dto: LogSetDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.logSet(user.id, logId, dto);
  }

  @Post(':logId/sets/bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bulk Log Sets',
    description:
      'Log multiple sets in one request. Useful for logging all sets of an exercise at once.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  bulkLogSets(
    @Param('logId') logId: string,
    @Body() dto: BulkLogSetsDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.bulkLogSets(user.id, logId, dto);
  }

  // ═══════════════════════════════════════════════════════════════
  // EDIT SET LOG  ← NEW
  // ═══════════════════════════════════════════════════════════════

  @Patch(':logId/sets/:setLogId')
  @ApiOperation({
    summary: 'Edit a Logged Set',
    description: `Correct weight, reps, or notes on a previously logged set.
Only allowed while workout is IN_PROGRESS.
All fields optional — only send what changed.`,
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  @ApiParam({
    name: 'setLogId',
    description: 'WorkoutSetLog ID from logSet response',
  })
  updateSetLog(
    @Param('logId') logId: string,
    @Param('setLogId') setLogId: string,
    @Body() dto: UpdateSetLogDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.updateSetLog(user.id, logId, setLogId, dto);
  }

  // ═══════════════════════════════════════════════════════════════
  // DELETE SET LOG  ← NEW
  // ═══════════════════════════════════════════════════════════════

  @Delete(':logId/sets/:setLogId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a Logged Set',
    description: `Remove a wrongly logged set entirely.
Only allowed while workout is IN_PROGRESS.
To re-log correctly, call POST /:logId/sets again.`,
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  @ApiParam({ name: 'setLogId', description: 'WorkoutSetLog ID to delete' })
  deleteSetLog(
    @Param('logId') logId: string,
    @Param('setLogId') setLogId: string,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.deleteSetLog(user.id, logId, setLogId);
  }

  // ═══════════════════════════════════════════════════════════════
  // REST TIMER
  // ═══════════════════════════════════════════════════════════════

  @Post(':logId/rest/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start Rest Timer',
    description:
      'Stamps restStartedAt on a set log. Call PATCH /:logId/rest/:setLogId/end when rest is over.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  startRestTimer(
    @Param('logId') logId: string,
    @Body() dto: StartRestTimerDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.startRestTimer(user.id, logId, dto);
  }

  @Patch(':logId/rest/:setLogId/end')
  @ApiOperation({
    summary: 'End Rest Timer',
    description: 'Stamps restEndedAt. Duration = restEndedAt - restStartedAt.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  @ApiParam({ name: 'setLogId', description: 'WorkoutSetLog ID' })
  endRestTimer(
    @Param('logId') logId: string,
    @Param('setLogId') setLogId: string,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.endRestTimer(user.id, logId, setLogId);
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPLETE / SKIP
  // ═══════════════════════════════════════════════════════════════

  @Patch(':logId/complete')
  @ApiOperation({
    summary: 'Complete Workout',
    description: `Marks workout COMPLETED. Auto-calculates:
- totalVolume (weight × actualReps across all set logs)
- durationSeconds (completedAt − startedAt)
- Advances currentDay/currentWeek in UserActiveProgram
- Marks program complete when final week/day reached
- Updates streakDays, totalWorkouts, lastActiveDate on User
- Creates COMPLETED_WORKOUT activity log`,
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  completeWorkout(
    @Param('logId') logId: string,
    @Body() dto: CompleteWorkoutDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.completeWorkout(user.id, logId, dto);
  }

  @Patch(':logId/skip')
  @ApiOperation({
    summary: 'Skip Workout',
    description:
      'Marks workout SKIPPED and advances program to next day (same as completing without sets).',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  skipWorkout(@Param('logId') logId: string, @CurrentUser() user: any) {
    return this.workoutService.skipWorkout(user.id, logId);
  }

  // ═══════════════════════════════════════════════════════════════
  // EDIT WORKOUT NOTES  ← NEW
  // ═══════════════════════════════════════════════════════════════

  @Patch(':logId/notes')
  @ApiOperation({
    summary: 'Edit Workout Notes',
    description:
      'Update notes on any workout log (PENDING, IN_PROGRESS, COMPLETED, or SKIPPED).',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  updateWorkoutLog(
    @Param('logId') logId: string,
    @Body() dto: UpdateWorkoutLogDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.updateWorkoutLog(user.id, logId, dto);
  }

  // ═══════════════════════════════════════════════════════════════
  // CANCEL WORKOUT  ← NEW
  // ═══════════════════════════════════════════════════════════════

  @Delete(':logId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel Workout',
    description: `Cancel and delete a PENDING or IN_PROGRESS workout log.
Deletes the log + all sessions + all set logs permanently.
Does NOT advance the program — use PATCH /:logId/skip for that.
Use this to discard an accidentally started workout.`,
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID to cancel' })
  cancelWorkout(@Param('logId') logId: string, @CurrentUser() user: any) {
    return this.workoutService.cancelWorkout(user.id, logId);
  }

  // ═══════════════════════════════════════════════════════════════
  // HISTORY / GET LOG
  // ═══════════════════════════════════════════════════════════════

  @Get('history')
  @ApiOperation({
    summary: 'Workout History',
    description: 'Returns COMPLETED and SKIPPED workout logs, newest first.',
  })
  getHistory(@Query() query: WorkoutHistoryQueryDto, @CurrentUser() user: any) {
    return this.workoutService.getWorkoutHistory(user.id, query);
  }

  @Get(':logId')
  @ApiOperation({
    summary: 'Get Workout Log',
    description: 'Get a specific workout log with all sessions and set data.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  getLog(@Param('logId') logId: string, @CurrentUser() user: any) {
    return this.workoutService.getWorkoutLog(user.id, logId);
  }
}

// // src/workout/workout.controller.ts

// import {
//   Controller, Get, Post, Patch, Body, Param,
//   Query, UseGuards, HttpCode, HttpStatus,
// } from '@nestjs/common';
// import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
// import { WorkoutService } from './workout.service';
// import {
//   StartWorkoutDto, LogSetDto, BulkLogSetsDto,
//   StartRestTimerDto, CompleteWorkoutDto, WorkoutHistoryQueryDto,
// } from './dto/workout.dto';
// import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
// import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// @ApiTags(' User — Workout')
// @ApiBearerAuth('JWT-auth')
// @UseGuards(JwtAuthGuard)
// @Controller('workout')
// export class WorkoutController {
//   constructor(private readonly workoutService: WorkoutService) {}

//   @Get('today')
//   @ApiOperation({
//     summary: "Get Today's Workout",
//     description: "Returns current week/day exercises from user's active program. Use programDayId to start the workout.",
//   })
//   getTodaysWorkout(@CurrentUser() user: any) {
//     return this.workoutService.getTodaysWorkout(user.id);
//   }

//   @Post('start')
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({
//     summary: 'Start Workout',
//     description: 'Creates a WorkoutLog + WorkoutSession. Returns workoutLogId needed for logging sets. Resumes if already in progress.',
//   })
//   startWorkout(@Body() dto: StartWorkoutDto, @CurrentUser() user: any) {
//     return this.workoutService.startWorkout(user.id, dto);
//   }

//   @Post(':logId/sets')
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({
//     summary: 'Log a Set',
//     description: 'Idempotent — re-logging same setNumber/exerciseId updates the set.',
//   })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   logSet(
//     @Param('logId') logId: string,
//     @Body() dto: LogSetDto,
//     @CurrentUser() user: any,
//   ) {
//     return this.workoutService.logSet(user.id, logId, dto);
//   }

//   @Post(':logId/sets/bulk')
//   @HttpCode(HttpStatus.CREATED)
//   @ApiOperation({
//     summary: 'Bulk Log Sets',
//     description: 'Log multiple sets in one request. Useful for logging all sets of an exercise at once.',
//   })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   bulkLogSets(
//     @Param('logId') logId: string,
//     @Body() dto: BulkLogSetsDto,
//     @CurrentUser() user: any,
//   ) {
//     return this.workoutService.bulkLogSets(user.id, logId, dto);
//   }

//   @Post(':logId/rest/start')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Start Rest Timer',
//     description: 'Stamps restStartedAt on a set log. Call endRestTimer when rest period is over.',
//   })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   startRestTimer(
//     @Param('logId') logId: string,
//     @Body() dto: StartRestTimerDto,
//     @CurrentUser() user: any,
//   ) {
//     return this.workoutService.startRestTimer(user.id, logId, dto);
//   }

//   @Patch(':logId/rest/:setLogId/end')
//   @ApiOperation({
//     summary: 'End Rest Timer',
//     description: 'Stamps restEndedAt. Duration = restEndedAt - restStartedAt.',
//   })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   @ApiParam({ name: 'setLogId', description: 'WorkoutSetLog ID' })
//   endRestTimer(
//     @Param('logId') logId: string,
//     @Param('setLogId') setLogId: string,
//     @CurrentUser() user: any,
//   ) {
//     return this.workoutService.endRestTimer(user.id, logId, setLogId);
//   }

//   @Patch(':logId/complete')
//   @ApiOperation({
//     summary: 'Complete Workout',
//     description: `Marks workout as COMPLETED. Automatically:
//     - Calculates totalVolume (weight × actualReps)
//     - Calculates durationSeconds
//     - Advances UserActiveProgram.currentDay/currentWeek
//     - Auto-completes UserProgram when program finished
//     - Updates User.streakDays, totalWorkouts, lastActiveDate
//     - Logs COMPLETED_WORKOUT activity`,
//   })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   completeWorkout(
//     @Param('logId') logId: string,
//     @Body() dto: CompleteWorkoutDto,
//     @CurrentUser() user: any,
//   ) {
//     return this.workoutService.completeWorkout(user.id, logId, dto);
//   }

//   @Patch(':logId/skip')
//   @ApiOperation({
//     summary: 'Skip Workout',
//     description: 'Marks workout as SKIPPED. Still advances program to next day.',
//   })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   skipWorkout(@Param('logId') logId: string, @CurrentUser() user: any) {
//     return this.workoutService.skipWorkout(user.id, logId);
//   }

//   @Get('history')
//   @ApiOperation({ summary: 'Get Workout History (COMPLETED + SKIPPED)' })
//   getHistory(@Query() query: WorkoutHistoryQueryDto, @CurrentUser() user: any) {
//     return this.workoutService.getWorkoutHistory(user.id, query);
//   }

//   @Get(':logId')
//   @ApiOperation({ summary: 'Get specific workout log with all set data' })
//   @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
//   getLog(@Param('logId') logId: string, @CurrentUser() user: any) {
//     return this.workoutService.getWorkoutLog(user.id, logId);
//   }
// }
