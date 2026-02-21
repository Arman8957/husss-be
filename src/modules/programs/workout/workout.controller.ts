// src/workout/workout.controller.ts

import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { WorkoutService } from './workout.service';
import {
  StartWorkoutDto, LogSetDto, BulkLogSetsDto,
  StartRestTimerDto, CompleteWorkoutDto, WorkoutHistoryQueryDto,
} from './dto/workout.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';


@ApiTags(' User — Workout')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('workout')
export class WorkoutController {
  constructor(private readonly workoutService: WorkoutService) {}

  @Get('today')
  @ApiOperation({
    summary: "Get Today's Workout",
    description: "Returns current week/day exercises from user's active program. Use programDayId to start the workout.",
  })
  getTodaysWorkout(@CurrentUser() user: any) {
    return this.workoutService.getTodaysWorkout(user.id);
  }

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start Workout',
    description: 'Creates a WorkoutLog + WorkoutSession. Returns workoutLogId needed for logging sets. Resumes if already in progress.',
  })
  startWorkout(@Body() dto: StartWorkoutDto, @CurrentUser() user: any) {
    return this.workoutService.startWorkout(user.id, dto);
  }

  @Post(':logId/sets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Log a Set',
    description: 'Idempotent — re-logging same setNumber/exerciseId updates the set.',
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
    description: 'Log multiple sets in one request. Useful for logging all sets of an exercise at once.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  bulkLogSets(
    @Param('logId') logId: string,
    @Body() dto: BulkLogSetsDto,
    @CurrentUser() user: any,
  ) {
    return this.workoutService.bulkLogSets(user.id, logId, dto);
  }

  @Post(':logId/rest/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start Rest Timer',
    description: 'Stamps restStartedAt on a set log. Call endRestTimer when rest period is over.',
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

  @Patch(':logId/complete')
  @ApiOperation({
    summary: 'Complete Workout',
    description: `Marks workout as COMPLETED. Automatically:
    - Calculates totalVolume (weight × actualReps)
    - Calculates durationSeconds
    - Advances UserActiveProgram.currentDay/currentWeek
    - Auto-completes UserProgram when program finished
    - Updates User.streakDays, totalWorkouts, lastActiveDate
    - Logs COMPLETED_WORKOUT activity`,
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
    description: 'Marks workout as SKIPPED. Still advances program to next day.',
  })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  skipWorkout(@Param('logId') logId: string, @CurrentUser() user: any) {
    return this.workoutService.skipWorkout(user.id, logId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get Workout History (COMPLETED + SKIPPED)' })
  getHistory(@Query() query: WorkoutHistoryQueryDto, @CurrentUser() user: any) {
    return this.workoutService.getWorkoutHistory(user.id, query);
  }

  @Get(':logId')
  @ApiOperation({ summary: 'Get specific workout log with all set data' })
  @ApiParam({ name: 'logId', description: 'WorkoutLog ID' })
  getLog(@Param('logId') logId: string, @CurrentUser() user: any) {
    return this.workoutService.getWorkoutLog(user.id, logId);
  }
}