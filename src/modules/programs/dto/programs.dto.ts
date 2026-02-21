// src/programs/dto/program.dto.ts

import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, IsArray,
  Min, Max, MinLength, MaxLength, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ProgramType, ProgramDifficulty, DaySplitType, WorkoutDayType,
  TrainingMethodType, SetType, ExerciseTabType, AbsWorkoutType,
} from '@prisma/client';

// ═══════════════════════════════════════════════════════════════
// STEP 1 — Basic Info
// ═══════════════════════════════════════════════════════════════

export class CreateProgramDto {
  @ApiProperty({ example: '10-Week Monster Confusion (Classic)', description: 'Required. 3–120 chars.' })
  @IsString()
  @MinLength(3, { message: 'Program name must be at least 3 characters' })
  @MaxLength(120, { message: 'Program name must not exceed 120 characters' })
  name!: string;

  @ApiPropertyOptional({
    enum: ProgramType,
    default: ProgramType.BUILTIN,
    description: 'BUILTIN | CUSTOM | AUTO | FREESTYLE | ON_THE_FLY',
  })
  @IsOptional()
  @IsEnum(ProgramType, { message: 'type must be a valid ProgramType enum value' })
  type?: ProgramType;

  @ApiPropertyOptional({
    enum: ProgramDifficulty,
    default: ProgramDifficulty.INTERMEDIATE,
    description: 'BEGINNER | INTERMEDIATE | ADVANCE',
  })
  @IsOptional()
  @IsEnum(ProgramDifficulty, { message: 'difficulty must be a valid ProgramDifficulty' })
  difficulty?: ProgramDifficulty;

  @ApiProperty({ example: 10, description: 'Duration in weeks (1–52)' })
  @IsInt({ message: 'durationWeeks must be an integer' })
  @Min(1, { message: 'durationWeeks must be at least 1' })
  @Max(52, { message: 'durationWeeks must not exceed 52' })
  durationWeeks!: number;

  @ApiPropertyOptional({
    enum: DaySplitType,
    default: DaySplitType.PUSH_PULL_LEGS,
    description: 'PUSH_PULL_LEGS | UPPER_LOWER | FULL_BODY | BRO_SPLIT | CUSTOM',
  })
  @IsOptional()
  @IsEnum(DaySplitType, { message: 'daySplitType must be a valid DaySplitType' })
  daySplitType?: DaySplitType;

  @ApiPropertyOptional({
    example: 'A 10-week Push/Pull/Legs program using multiple training methods.',
    description: 'Max 2000 chars',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'description must not exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({ default: false, description: 'true = premium-only access' })
  @IsOptional()
  @IsBoolean({ message: 'isPremium must be a boolean' })
  isPremium?: boolean;

  @ApiPropertyOptional({ default: true, description: 'false = archived/hidden' })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({
    example: ['10-week Push/Pull/Legs', 'Optional BFR integration', 'Abs/Core system'],
    description: 'Feature bullet strings shown in program library',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: ['strength', 'hypertrophy', 'mass'], description: 'Search tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/thumbnails/monster-confusion.jpg' })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — Day Split Configuration
// ═══════════════════════════════════════════════════════════════

export class DayConfigDto {
  @ApiProperty({
    enum: WorkoutDayType,
    example: WorkoutDayType.PUSH,
    description: 'PUSH | PULL | LEGS | UPPER | LOWER | FULL_BODY | REST | CUSTOM',
  })
  @IsEnum(WorkoutDayType, { message: 'dayType must be a valid WorkoutDayType' })
  dayType!: WorkoutDayType;

  @ApiProperty({ example: 'Push(Chest, Shoulders & Triceps)', description: '2–120 chars' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    enum: TrainingMethodType,
    example: TrainingMethodType.FIVE_BY_FIVE,
    description: 'Must exist in training_methods table. FIVE_BY_FIVE | MAX_OT | BURNS | BULLDOZER …',
  })
  @IsEnum(TrainingMethodType, { message: 'trainingMethod must be a valid TrainingMethodType' })
  trainingMethod!: TrainingMethodType;

  @ApiPropertyOptional({ example: '5 sets of 5 heavy reps.', description: 'Short description shown in UI' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'Classic strength and mass builder using 5 sets of 5 reps at around 80-85% of your 1RM.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  howToExecute?: string;

  @ApiPropertyOptional({ example: 'Converging Chest Press, Overhead Press, Close-Grip Bench' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  exerciseHint?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Enable BFR (Blood Flow Restriction) finisher for this day',
  })
  @IsOptional()
  @IsBoolean()
  hasBFR?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Enable ABS section for this day' })
  @IsOptional()
  @IsBoolean()
  hasAbs?: boolean;
}

export class WeekDaySplitDto {
  @ApiProperty({ example: 1, description: 'Week number (1-based, must not exceed program durationWeeks)' })
  @IsInt({ message: 'weekNumber must be an integer' })
  @Min(1)
  weekNumber!: number;

  @ApiProperty({
    type: [DayConfigDto],
    description: 'Array of workout days for this week. At least 1 required.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Each week must have at least 1 day' })
  @ValidateNested({ each: true })
  @Type(() => DayConfigDto)
  days!: DayConfigDto[];
}

export class SaveDaySplitDto {
  @ApiProperty({
    type: [WeekDaySplitDto],
    description: 'All weeks to configure. You can submit partial weeks; only submitted weeks are updated.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one week must be configured' })
  @ValidateNested({ each: true })
  @Type(() => WeekDaySplitDto)
  weeks!: WeekDaySplitDto[];
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — Add / Update Exercise
// ═══════════════════════════════════════════════════════════════

export class ExerciseSetDto {
  @ApiProperty({ example: 1, description: 'Set number (1-based sequential)' })
  @IsInt()
  @Min(1)
  setNumber!: number;

  @ApiProperty({
    example: '05',
    description: 'Reps: "05", "12", "10-12", "AMRAP", "30/15/15". String to support ranges.',
  })
  @IsString()
  @MaxLength(20)
  reps!: string;

  @ApiProperty({ example: 60, description: 'Rest in seconds (0 = no rest)' })
  @IsInt()
  @Min(0)
  restSeconds!: number;

  @ApiPropertyOptional({ example: 'Increase weight if all reps are easy' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class AddExerciseToDayDto {
  @ApiProperty({
    enum: ExerciseTabType,
    example: ExerciseTabType.MAIN_EXERCISE,
    description: 'MAIN_EXERCISE | BFR_EXERCISE | ABS_EXERCISE — determines which section the exercise appears in',
  })
  @IsEnum(ExerciseTabType, { message: 'tabType must be MAIN_EXERCISE, BFR_EXERCISE, or ABS_EXERCISE' })
  tabType!: ExerciseTabType;

  @ApiPropertyOptional({
    example: 'clx1234abc',
    description: 'Pick an existing exercise from the library by ID. If omitted, a new exercise is created inline.',
  })
  @IsOptional()
  @IsString()
  exerciseId?: string;

  // ── Inline exercise creation fields (ignored if exerciseId is provided) ──

  @ApiPropertyOptional({ example: 'Dumbbell Flat Bench Press', description: 'Required if exerciseId is not provided' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  exerciseName?: string;

  @ApiPropertyOptional({ example: 'Chest', description: 'Target muscle group name (free text)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  exerciseFor?: string;

  @ApiPropertyOptional({
    example: 'Keep your feet flat on the ground and maintain a slight arch in your lower back.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  exerciseDescription?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/exercises/dbfbp-thumbnail.jpg',
    description: 'Thumbnail image URL (uploaded separately via media endpoint)',
  })
  @IsOptional()
  @IsString()
  exerciseImageUrl?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/exercises/dbfbp-animation.mp4',
    description: 'Animation/video URL (Main Exercise tab only)',
  })
  @IsOptional()
  @IsString()
  exerciseAnimationUrl?: string;

  @ApiPropertyOptional({
    enum: SetType,
    default: SetType.NORMAL,
    description: 'NORMAL | WARMUP | DROP_SET | SUPER_SET | FAILURE | BFR',
  })
  @IsOptional()
  @IsEnum(SetType)
  setType?: SetType;

  @ApiPropertyOptional({ default: false, description: 'true = optional exercise (shown with toggle in UI)' })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional({ example: 'Close Grip flat bench press', description: 'Note for accessory exercise' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  accessoryNote?: string;

  @ApiProperty({
    type: [ExerciseSetDto],
    description: 'At least 1 set required. Each set has setNumber, reps, restSeconds.',
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one set is required' })
  @ValidateNested({ each: true })
  @Type(() => ExerciseSetDto)
  sets!: ExerciseSetDto[];

  @ApiPropertyOptional({ default: 0, description: 'Display order within this day (0-based)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExerciseInDayDto extends PartialType(AddExerciseToDayDto) {}

export class ReorderExercisesDto {
  @ApiProperty({
    example: ['pde_id_3', 'pde_id_1', 'pde_id_2'],
    description: 'All ProgramDayExercise IDs in the desired new order. All IDs must belong to this day.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}

// ═══════════════════════════════════════════════════════════════
// STEP 4 — Publish
// ═══════════════════════════════════════════════════════════════

export class PublishProgramDto {
  @ApiProperty({
    example: true,
    description: 'true = publish (make visible to users) | false = unpublish (hide from users)',
  })
  @IsBoolean({ message: 'publish must be a boolean' })
  publish!: boolean;
}

// ═══════════════════════════════════════════════════════════════
// USER — Activate Program
// ═══════════════════════════════════════════════════════════════

export class ActivateProgramDto {
  @ApiProperty({ example: 'clx9876xyz', description: 'ID of the published program to activate' })
  @IsString()
  programId!: string;

  @ApiPropertyOptional({
    enum: AbsWorkoutType,
    default: AbsWorkoutType.TWO_DAY,
    description: 'TWO_DAY (2×/week) | THREE_DAY (3×/week)',
  })
  @IsOptional()
  @IsEnum(AbsWorkoutType)
  absWorkoutType?: AbsWorkoutType;

  @ApiPropertyOptional({ default: false, description: 'Enable BFR finisher sets' })
  @IsOptional()
  @IsBoolean()
  bfrEnabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// COPY
// ═══════════════════════════════════════════════════════════════

export class CopyProgramDto {
  @ApiPropertyOptional({
    example: '10-Week Monster Confusion (Classic) - Copy',
    description: 'Name for the copy. Defaults to "{original name} (Copy)"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  newName?: string;
}

// ═══════════════════════════════════════════════════════════════
// QUERY / FILTER
// ═══════════════════════════════════════════════════════════════

export class ProgramQueryDto {
  @ApiPropertyOptional({ enum: ProgramType, description: 'Filter by program type' })
  @IsOptional()
  @IsEnum(ProgramType)
  type?: ProgramType;

  @ApiPropertyOptional({ enum: ProgramDifficulty })
  @IsOptional()
  @IsEnum(ProgramDifficulty)
  difficulty?: ProgramDifficulty;

  @ApiPropertyOptional({ description: 'Filter premium/free programs' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional({ description: 'Filter published/draft programs' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ example: 'monster', description: 'Search by program name (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Items per page (max 100)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}