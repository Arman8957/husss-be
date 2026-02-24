import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ProgramType,
  ProgramDifficulty,
  DaySplitType,
  WorkoutDayType,
  TrainingMethodType,
  SetType,
  ExerciseTabType,
  AbsWorkoutType,
  MuscleGroup,
} from '@prisma/client';



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
  @ApiProperty({
    example: '10-Week Monster Confusion (Classic)',
    description: 'Required. 3–120 chars.',
  })
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
  @IsEnum(ProgramType, {
    message: 'type must be a valid ProgramType enum value',
  })
  type?: ProgramType;

  @ApiPropertyOptional({
    enum: ProgramDifficulty,
    default: ProgramDifficulty.INTERMEDIATE,
    description: 'BEGINNER | INTERMEDIATE | ADVANCE',
  })
  @IsOptional()
  @IsEnum(ProgramDifficulty, {
    message: 'difficulty must be a valid ProgramDifficulty',
  })
  difficulty?: ProgramDifficulty;

  @ApiProperty({ example: 10, description: 'Duration in weeks (1–52)' })
  @IsInt({ message: 'durationWeeks must be an integer' })
  @Min(1, { message: 'durationWeeks must be at least 1' })
  @Max(52, { message: 'durationWeeks must not exceed 52' })
  durationWeeks!: number;

  @ApiPropertyOptional({
    enum: DaySplitType,
    default: DaySplitType.PUSH_PULL_LEGS,
    description:
      'PUSH_PULL_LEGS | UPPER_LOWER | FULL_BODY | BRO_SPLIT | CUSTOM',
  })
  @IsOptional()
  @IsEnum(DaySplitType, {
    message: 'daySplitType must be a valid DaySplitType',
  })
  daySplitType?: DaySplitType;

  @ApiPropertyOptional({
    example:
      'A 10-week Push/Pull/Legs program using multiple training methods.',
    description: 'Max 2000 chars',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'description must not exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'true = premium-only access',
  })
  @IsOptional()
  @IsBoolean({ message: 'isPremium must be a boolean' })
  isPremium?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'false = archived/hidden',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({
    example: [
      '10-week Push/Pull/Legs',
      'Optional BFR integration',
      'Abs/Core system',
    ],
    description: 'Feature bullet strings shown in program library card',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    example: ['strength', 'hypertrophy', 'mass'],
    description: 'Search tags',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/thumbnails/monster-confusion.jpg',
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  // ── Schedule metadata (program-level) ────────────────────────────────────

  @ApiPropertyOptional({
    example: ['1', '3', '5'],
    description:
      'Which day-of-week numbers are training days. ' +
      'Parallel array with dayFocus: index 0 = first training day. ' +
      'e.g. ["1","3","5"] means Mon/Wed/Fri train.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trainingDays?: string[];

  @ApiPropertyOptional({
    example: ['2', '4', '6', '7'],
    description:
      'Which day-of-week numbers are rest days. Complement of trainingDays.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restDays?: string[];

  @ApiPropertyOptional({
    type: [DayFocusItemDto],
    example: [
      { label: 'Push', muscleGroups: ['CHEST', 'SHOULDERS', 'TRICEPS'] },
      { label: 'Pull', muscleGroups: ['BACK', 'BICEPS', 'TRAPS'] },
      {
        label: 'Legs',
        muscleGroups: ['QUADS', 'HAMSTRINGS', 'CALVES', 'GLUTES'],
      },
    ],
    description:
      'Structured day focus — one entry per training day. ' +
      'Each entry has a display label and the muscle group checkboxes for that day. ' +
      'Parallel with trainingDays[]: index 0 = first training day.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayFocusItemDto)
  dayFocus?: DayFocusItemDto[];

  @ApiPropertyOptional({
    example: ['Low to high rope pull', 'Cable fly', 'Face pull'],
    description:
      'Program-level accessory notes or exercise names. ' +
      'Shown as a note under the program info card. ' +
      'Day-level accessories (the actual accessory exercise slots) are ' +
      'configured via addExerciseToDay with tabType=MAIN_EXERCISE.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessories?: string[];
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — Day Split Configuration
// ═══════════════════════════════════════════════════════════════

export class DayConfigDto {
  @ApiProperty({
    enum: WorkoutDayType,
    example: WorkoutDayType.PUSH,
    description:
      'PUSH | PULL | LEGS | UPPER | LOWER | FULL_BODY | REST | CUSTOM',
  })
  @IsEnum(WorkoutDayType, { message: 'dayType must be a valid WorkoutDayType' })
  dayType!: WorkoutDayType;

  @ApiProperty({
    example: 'Push A (Chest, Shoulders & Triceps)',
    description:
      'Day display name. Real examples from programs: ' +
      '"Push", "Pull", "Legs", "Push A", "Push B", "Pull A", "Pull B", ' +
      '"Legs + Triceps", "Workout A", "Workout B".',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    enum: TrainingMethodType,
    example: TrainingMethodType.FIVE_BY_FIVE,
    description:
      'Training method for this day. Must exist in training_methods table. ' +
      'Real usage from programs — Week 1 Push=5x5, Legs=8x8, Pull=BURNS, etc.',
  })
  @IsEnum(TrainingMethodType, {
    message: 'trainingMethod must be a valid TrainingMethodType',
  })
  trainingMethod!: TrainingMethodType;

  // ── NEW: Muscle group subcategories (the checkbox UI in the image) ────────
  @ApiPropertyOptional({
    example: ['CHEST', 'SHOULDERS', 'TRICEPS'],
    description:
      'Muscle groups targeted on this day — the subcategory checkboxes shown in the UI. ' +
      'Defaults auto-inferred from dayType if omitted: \n' +
      '  PUSH        → [CHEST, SHOULDERS, TRICEPS]\n' +
      '  PULL        → [BACK, BICEPS, TRAPS]\n' +
      '  LEGS        → [QUADS, HAMSTRINGS, CALVES, GLUTES]\n' +
      '  UPPER       → [CHEST, BACK, SHOULDERS, BICEPS, TRICEPS]\n' +
      '  LOWER       → [QUADS, HAMSTRINGS, CALVES, GLUTES]\n' +
      '  FULL_BODY   → all muscle groups\n' +
      '  CUSTOM      → [] (must supply manually)\n' +
      'Override for special splits like "Legs + Triceps" → [QUADS, HAMSTRINGS, CALVES, GLUTES, TRICEPS].',
    enum: MuscleGroup,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MuscleGroup, {
    each: true,
    message: 'Each muscleGroup must be a valid MuscleGroup enum value',
  })
  muscleGroups?: MuscleGroup[];
  // ─────────────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: '5 sets of 5 heavy reps.',
    description: 'Short description shown in UI',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'Primary Prescription: 5×5 heavy; 2–3 min rest',
    description:
      'How to execute this day — maps to "Primary Prescription" column in program sheets.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  howToExecute?: string;

  @ApiPropertyOptional({
    example: 'Start with heaviest compound, then accessories',
    description: 'Exercise order hint shown to user',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  exerciseHint?: string;

  @ApiPropertyOptional({ default: false, description: 'Mark as BFR day' })
  @IsOptional()
  @IsBoolean()
  hasBFR?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Include abs workout for this day',
  })
  @IsOptional()
  @IsBoolean()
  hasAbs?: boolean;
}

export class WeekConfigDto {
  @ApiProperty({ example: 1, description: 'Week number (1 to durationWeeks)' })
  @IsInt()
  @Min(1)
  weekNumber!: number;

  @ApiProperty({
    type: [DayConfigDto],
    description: 'Array of day configs. Length = daysPerWeek for this program.',
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
      'Weeks to configure. You can send all weeks at once or week-by-week. ' +
      'Each call replaces days for the supplied week numbers only.',
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
  @ApiPropertyOptional({
    description:
      'Pick from exercise library. If omitted, provide exerciseName to create inline.',
  })
  @IsOptional()
  @IsString()
  exerciseId?: string;

  @ApiPropertyOptional({
    example: 'Dumbbell Flat Bench Press',
    description: 'Create new exercise inline (if exerciseId not provided)',
  })
  @IsOptional()
  @IsString()
  exerciseName?: string;

  @ApiPropertyOptional({
    example: 'Chest press movement',
    description: 'Description for inline-created exercise',
  })
  @IsOptional()
  @IsString()
  exerciseDescription?: string;

  @ApiPropertyOptional({
    example: 'Chest',
    description: 'Primary muscle for inline-created exercise',
  })
  @IsOptional()
  @IsString()
  exerciseFor?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/exercises/bench-press.jpg',
  })
  @IsOptional()
  @IsString()
  exerciseImageUrl?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/exercises/bench-press.gif',
  })
  @IsOptional()
  @IsString()
  exerciseAnimationUrl?: string;

  @ApiProperty({
    enum: ExerciseTabType,
    description:
      'MAIN_EXERCISE | BFR_EXERCISE | ABS_EXERCISE — determines which tab this appears in',
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

  @ApiPropertyOptional({
    example: 'Close Grip flat bench press',
    description: 'Note shown under accessory exercise',
  })
  @IsOptional()
  @IsString()
  accessoryNote?: string;

  @ApiPropertyOptional({
    description: 'Manual sort order override. Auto-appends if omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExerciseInDayDto {
  @ApiPropertyOptional({
    description: 'Swap to a different exercise from library',
  })
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
    description:
      'All ProgramDayExercise IDs for this day in the desired order. Must include ALL IDs.',
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
