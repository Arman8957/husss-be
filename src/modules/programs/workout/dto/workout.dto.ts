// src/workout/dto/workout.dto.ts

import {
  IsString, IsOptional, IsInt, IsBoolean, IsArray, IsDateString,
  Min, Max, ValidateNested, ArrayMinSize, IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SetType, WeightUnit } from '@prisma/client';

export class StartWorkoutDto {
  @ApiProperty({
    example: 'cmd_day_abc123',
    description: 'ProgramDay ID from the user\'s active program. Get from GET /programs/active',
  })
  @IsString()
  programDayId!: string;

  @ApiPropertyOptional({ example: '2026-02-20', description: 'ISO date. Defaults to today.' })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
}

export class LogSetDto {
  @ApiProperty({ example: 'cmd_session_xyz', description: 'WorkoutSession ID from startWorkout response' })
  @IsString()
  workoutSessionId!: string;

  @ApiProperty({ example: 'cmd_exercise_abc', description: 'Exercise ID' })
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

export class StartRestTimerDto {
  @ApiProperty({ example: 'cmd_setlog_xyz', description: 'WorkoutSetLog ID to attach rest timer to' })
  @IsString()
  setLogId!: string;
}

export class CompleteWorkoutDto {
  @ApiPropertyOptional({ example: 'Great session today!' })
  @IsOptional()
  @IsString()
  notes?: string;
}

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