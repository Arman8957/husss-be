// src/programs/dto/programs.dto.ts
//
// CHANGES IN THIS FILE:
//  1. CreateProgramDto  — dayFocus changed from string[] → DayFocusItemDto[]
//                         Each item: { label: "Push", muscleGroups: ["CHEST","SHOULDERS","TRICEPS"] }
//  2. DayConfigDto      — muscleGroups?: MuscleGroup[] (checkbox subcategories per day)
//  3. accessories, trainingDays, restDays remain string[]

import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, IsArray,
  Min, Max, MinLength, MaxLength, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ProgramType, ProgramDifficulty, DaySplitType, WorkoutDayType,
  TrainingMethodType, SetType, ExerciseTabType, AbsWorkoutType,
  MuscleGroup,
} from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// DayFocusItemDto — one entry in the dayFocus array
// Represents: "Push (Chest, Shoulders, Triceps)" as shown in the UI dropdown
// ─────────────────────────────────────────────────────────────────────────────

export class DayFocusItemDto {
  @ApiProperty({
    example: 'Push',
    description:
      'Display label for this training day. ' +
      'Real values from programs: "Push", "Pull", "Legs", "Push A", "Push B", ' +
      '"Pull A", "Pull B", "Legs + Triceps", "Workout A", "Workout B".',
  })
  @IsString()
  label!: string;

  @ApiProperty({
    example: ['CHEST', 'SHOULDERS', 'TRICEPS'],
    description:
      'Muscle group subcategories for this day — the checkboxes shown in the UI. ' +
      'Defaults by split type if omitted in DayConfigDto (server auto-infers). ' +
      'Push → [CHEST,SHOULDERS,TRICEPS] | Pull → [BACK,BICEPS,TRAPS] | ' +
      'Legs → [QUADS,HAMSTRINGS,CALVES,GLUTES] | Legs+Tri → adds TRICEPS | ' +
      'Workout A/B → all muscle groups.',
    enum: MuscleGroup,
    isArray: true,
  })
  @IsArray()
  @IsEnum(MuscleGroup, { each: true })
  muscleGroups!: MuscleGroup[];
}

// ═══════════════════════════════════════════════════════════════
// STEP 1 — Basic Info
// ═══════════════════════════════════════════════════════════════

export class CreateProgramDto {
  @ApiProperty({ example: '2-Week Monster (basic)', description: 'Required. 3–120 chars.' })
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
  @IsEnum(ProgramType)
  type?: ProgramType;

  @ApiPropertyOptional({
    enum: ProgramDifficulty,
    default: ProgramDifficulty.INTERMEDIATE,
    description: 'BEGINNER | INTERMEDIATE | ADVANCE',
  })
  @IsOptional()
  @IsEnum(ProgramDifficulty)
  difficulty?: ProgramDifficulty;

  @ApiProperty({ example: 5, description: 'Duration in weeks (1–52)' })
  @IsInt()
  @Min(1)
  @Max(52)
  durationWeeks!: number;

  @ApiPropertyOptional({
    enum: DaySplitType,
    default: DaySplitType.PUSH_PULL_LEGS,
    description: 'PUSH_PULL_LEGS | UPPER_LOWER | FULL_BODY | BRO_SPLIT | CUSTOM',
  })
  @IsOptional()
  @IsEnum(DaySplitType)
  daySplitType?: DaySplitType;

  @ApiPropertyOptional({
    example: 'A comprehensive 5-week Push/Pull/Legs program using rotating training methods.',
    description: 'Max 2000 chars.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: false, description: 'true = premium-only access' })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional({ default: true, description: 'false = archived/hidden' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: ['5-week Push/Pull/Legs', 'Optional BFR integration', 'Abs/Core system'],
    description: 'Feature bullet strings shown in program library card.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: ['strength', 'hypertrophy', 'mass'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/thumbnails/monster-confusion.jpg' })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  // NOTE: trainingDays, restDays, accessories, dayFocus are configured
  // per-week inside SaveDaySplitDto → WeekConfigDto, not here.
  // This keeps the create body minimal and clean.
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — Day Split Configuration
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// DayConfigDto — one day inside a week
//
// NEW body structure (matching UI screenshot):
//   trainingDays, restDays, accessories → moved UP to WeekConfigDto
//   muscleGroups                        → OPTIONAL, auto-inferred from name/dayType
//   name                                → "Push(Chest, Shoulders & Triceps)"
//                                         subcategories shown in parentheses
// ─────────────────────────────────────────────────────────────────────────────

export class DayConfigDto {
  @ApiProperty({
    enum: WorkoutDayType,
    example: WorkoutDayType.PUSH,
    description: 'PUSH | PULL | LEGS | UPPER | LOWER | FULL_BODY | REST | CUSTOM',
  })
  @IsEnum(WorkoutDayType, { message: 'dayType must be a valid WorkoutDayType' })
  dayType!: WorkoutDayType;

  @ApiProperty({
    example: 'Push(Chest, Shoulders & Triceps)',
    description:
      'Display name. Subcategories shown in parentheses are cosmetic — ' +
      'actual muscleGroups are auto-inferred from dayType unless overridden. ' +
      'Examples: "Push(Chest, Shoulders & Triceps)", "Pull(Back, Biceps & Traps)", ' +
      '"Legs(Quads, Hamstrings & Calves)", "Legs + Triceps", "Workout A".',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    enum: TrainingMethodType,
    example: TrainingMethodType.FIVE_BY_FIVE,
    description: 'Training method. Must exist in training_methods table.',
  })
  @IsEnum(TrainingMethodType, { message: 'trainingMethod must be a valid TrainingMethodType' })
  trainingMethod!: TrainingMethodType;

  @ApiPropertyOptional({
    example: ['CHEST', 'SHOULDERS', 'TRICEPS'],
    description:
      'Optional override for muscle group checkboxes. ' +
      'Server auto-infers from dayType if omitted:\n' +
      '  PUSH      → [CHEST, SHOULDERS, TRICEPS]\n' +
      '  PULL      → [BACK, BICEPS, TRAPS]\n' +
      '  LEGS      → [QUADS, HAMSTRINGS, CALVES, GLUTES]\n' +
      '  UPPER     → [CHEST, BACK, SHOULDERS, BICEPS, TRICEPS]\n' +
      '  LOWER     → [QUADS, HAMSTRINGS, CALVES, GLUTES]\n' +
      '  FULL_BODY → all groups\n' +
      'Special name override: "Legs + Triceps" → also adds TRICEPS.\n' +
      'Use this only when you want non-default selections (e.g. Pull day with ALL muscles checked).',
    enum: MuscleGroup,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MuscleGroup, { each: true })
  muscleGroups?: MuscleGroup[];

  @ApiPropertyOptional({
    example: '5 sets of 5 heavy reps.',
    description: 'Short description shown in UI card.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'Classic strength builder: 5×5 at 80-85% of 1RM. 2-3 min rest between sets.',
    description: 'Execution instructions — maps to "Primary Prescription" from program sheets.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  howToExecute?: string;

  @ApiPropertyOptional({
    example: 'Converging Chest Press, Overhead Press, Close-Grip Bench',
    description: 'Exercise suggestions shown as a hint to the user.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  exerciseHint?: string;

  @ApiPropertyOptional({ default: false, description: 'Enable BFR finisher tab for this day.' })
  @IsOptional()
  @IsBoolean()
  hasBFR?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Enable abs workout tab for this day.' })
  @IsOptional()
  @IsBoolean()
  hasAbs?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// WeekConfigDto — one week's full configuration
//
// trainingDays, restDays, accessories now live HERE (week level) not on Program.
// This lets each week define its own schedule if needed (deload weeks etc.).
// ─────────────────────────────────────────────────────────────────────────────

export class WeekConfigDto {
  @ApiProperty({ example: 1, description: 'Week number (1 to durationWeeks).' })
  @IsInt()
  @Min(1)
  weekNumber!: number;

  @ApiPropertyOptional({
    example: ['1', '3', '5'],
    description:
      'Which day-of-week numbers are training days for this week. ' +
      '1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun. ' +
      'Parallel with days[]: days[0] trains on trainingDays[0], etc.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trainingDays?: string[];

  @ApiPropertyOptional({
    example: ['2', '4', '6', '7'],
    description: 'Rest day numbers for this week. Complement of trainingDays.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restDays?: string[];

  @ApiPropertyOptional({
    example: ['Low to high rope pull', 'Cable fly'],
    description:
      'Week-level accessory exercise notes shown under the week card. ' +
      'Actual accessory exercises are added via addExerciseToDay.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessories?: string[];

  @ApiProperty({
    type: [DayConfigDto],
    description:
      'Training day configs for this week. ' +
      'Length must match trainingDays.length if trainingDays is provided.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DayConfigDto)
  days!: DayConfigDto[];
}

export class SaveDaySplitDto {
  @ApiProperty({
    type: [WeekConfigDto],
    description:
      'Weeks to configure. Send all at once or week-by-week. ' +
      'Each call REPLACES days for the supplied week numbers only.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeekConfigDto)
  weeks!: WeekConfigDto[];
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — Exercises
// ═══════════════════════════════════════════════════════════════

export class ExerciseSetDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  setNumber!: number;

  @ApiProperty({ example: '5', description: '"5", "10-12", "AMRAP", "20"' })
  @IsString()
  reps!: string;

  @ApiProperty({ example: 120, description: 'Rest in seconds between sets' })
  @IsInt()
  @Min(0)
  restSeconds!: number;

  @ApiPropertyOptional({ example: 'Heavy — near max effort' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddExerciseToDayDto {
  @ApiPropertyOptional({ description: 'Pick from exercise library. If omitted, provide exerciseName to create inline.' })
  @IsOptional()
  @IsString()
  exerciseId?: string;

  @ApiPropertyOptional({ example: 'Dumbbell Flat Bench Press', description: 'Create new exercise inline (if exerciseId not provided)' })
  @IsOptional()
  @IsString()
  exerciseName?: string;

  @ApiPropertyOptional({ example: 'Chest press movement', description: 'Description for inline-created exercise' })
  @IsOptional()
  @IsString()
  exerciseDescription?: string;

  @ApiPropertyOptional({ example: 'Chest', description: 'Primary muscle for inline-created exercise' })
  @IsOptional()
  @IsString()
  exerciseFor?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/exercises/bench-press.jpg' })
  @IsOptional()
  @IsString()
  exerciseImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/exercises/bench-press.gif' })
  @IsOptional()
  @IsString()
  exerciseAnimationUrl?: string;

  @ApiProperty({
    enum: ExerciseTabType,
    description: 'MAIN_EXERCISE | BFR_EXERCISE | ABS_EXERCISE — determines which tab this appears in',
  })
  @IsEnum(ExerciseTabType)
  tabType!: ExerciseTabType;

  @ApiProperty({
    type: [ExerciseSetDto],
    description: 'Set-by-set prescription. Min 1 set required.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExerciseSetDto)
  sets!: ExerciseSetDto[];

  @ApiPropertyOptional({ enum: SetType, default: SetType.NORMAL })
  @IsOptional()
  @IsEnum(SetType)
  setType?: SetType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional({ example: 'Close Grip flat bench press', description: 'Note shown under accessory exercise' })
  @IsOptional()
  @IsString()
  accessoryNote?: string;

  @ApiPropertyOptional({ description: 'Manual sort order override. Auto-appends if omitted.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExerciseInDayDto {
  @ApiPropertyOptional({ description: 'Swap to a different exercise from library' })
  @IsOptional()
  @IsString()
  exerciseId?: string;

  @ApiPropertyOptional({ enum: ExerciseTabType })
  @IsOptional()
  @IsEnum(ExerciseTabType)
  tabType?: ExerciseTabType;

  @ApiPropertyOptional({ type: [ExerciseSetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseSetDto)
  sets?: ExerciseSetDto[];

  @ApiPropertyOptional({ enum: SetType })
  @IsOptional()
  @IsEnum(SetType)
  setType?: SetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessoryNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReorderExercisesDto {
  @ApiProperty({
    example: ['pde_id_1', 'pde_id_2', 'pde_id_3'],
    description: 'All ProgramDayExercise IDs for this day in the desired order. Must include ALL IDs.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}

// ═══════════════════════════════════════════════════════════════
// STEP 4 — Review & Publish
// ═══════════════════════════════════════════════════════════════

export class PublishProgramDto {
  @ApiProperty({ description: 'true = publish, false = unpublish' })
  @IsBoolean()
  publish!: boolean;
}

// ═══════════════════════════════════════════════════════════════
// USER — Activate & Query
// ═══════════════════════════════════════════════════════════════

export class ActivateProgramDto {
  @ApiProperty({ example: 'clxxx...', description: 'Program ID to activate' })
  @IsString()
  programId!: string;

  @ApiPropertyOptional({ enum: AbsWorkoutType, default: 'TWO_DAY' })
  @IsOptional()
  @IsEnum(AbsWorkoutType)
  absWorkoutType?: AbsWorkoutType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  bfrEnabled?: boolean;
}

export class ProgramQueryDto {
  @IsOptional()
  @IsEnum(ProgramType)
  type?: ProgramType;

  @IsOptional()
  @IsEnum(ProgramDifficulty)
  difficulty?: ProgramDifficulty;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CopyProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  newName?: string;
}