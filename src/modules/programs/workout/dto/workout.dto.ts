// src/workout/dto/workout.dto.ts

import {
  IsString, IsOptional, IsInt, IsBoolean, IsArray, IsDateString,
  Min, Max, ValidateNested, ArrayMinSize, IsEnum, IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SetType, WeightUnit } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

export class StartWorkoutDto {
  @ApiProperty({
    example: 'clx_day_abc123',
    description: "ProgramDay ID — get from GET /workout/today → programDayId",
  })
  @IsString()
  programDayId!: string;

  @ApiPropertyOptional({ example: '2026-03-03', description: 'ISO date string. Defaults to today.' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
}

// ═══════════════════════════════════════════════════════════════
// LOG SET
// ═══════════════════════════════════════════════════════════════

export class LogSetDto {
  @ApiProperty({ example: 'clx_session_xyz', description: 'WorkoutSession ID from startWorkout response' })
  @IsString()
  workoutSessionId!: string;

  @ApiProperty({ example: 'clx_exercise_abc', description: 'Exercise ID' })
  @IsString()
  exerciseId!: string;

  @ApiProperty({ example: 1, description: 'Set number (1-based)' })
  @IsInt()
  @Min(1)
  setNumber!: number;

  @ApiPropertyOptional({ example: 5, description: 'Planned reps from program' })
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedReps?: number;

  @ApiPropertyOptional({ example: 5, description: 'Actual reps completed' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional({ example: 80, description: 'Weight lifted' })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ enum: WeightUnit, default: 'KG' })
  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ example: 100, description: 'Completion percentage (0–100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent?: number;

  @ApiPropertyOptional({ enum: SetType, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(SetType)
  setType?: SetType;

  @ApiPropertyOptional({ example: 'Felt strong today' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkLogSetsDto {
  @ApiProperty({ type: [LogSetDto], description: 'Multiple sets to log at once' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LogSetDto)
  sets!: LogSetDto[];
}

// ═══════════════════════════════════════════════════════════════
// EDIT SET LOG  ← NEW
// PATCH /workout/:logId/sets/:setLogId
// Correct weight / reps / notes on a logged set.
// All fields optional — only send what changed.
// Only allowed while workout is IN_PROGRESS.
// ═══════════════════════════════════════════════════════════════

export class UpdateSetLogDto {
  @ApiPropertyOptional({ example: 6, description: 'Corrected actual reps' })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedReps?: number;

  @ApiPropertyOptional({ example: 82.5, description: 'Corrected weight' })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ enum: WeightUnit })
  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent?: number;

  @ApiPropertyOptional({ enum: SetType })
  @IsOptional()
  @IsEnum(SetType)
  setType?: SetType;

  @ApiPropertyOptional({ example: 'Pushed through the last rep' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// EDIT WORKOUT LOG  ← NEW
// PATCH /workout/:logId/notes
// Edit notes on any workout log (any status).
// ═══════════════════════════════════════════════════════════════

export class UpdateWorkoutLogDto {
  @ApiPropertyOptional({ example: 'Great session, felt strong on bench today.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// REST TIMER
// ═══════════════════════════════════════════════════════════════

export class StartRestTimerDto {
  @ApiProperty({ example: 'clx_setlog_xyz', description: 'WorkoutSetLog ID' })
  @IsString()
  setLogId!: string;
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE / SKIP
// ═══════════════════════════════════════════════════════════════

export class CompleteWorkoutDto {
  @ApiPropertyOptional({ example: 'Great session today!' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════
// HISTORY QUERY
// ═══════════════════════════════════════════════════════════════

export class WorkoutHistoryQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}