// ── Patch Day Split ────────────────────────────────────────────────────────

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MuscleGroup, TrainingMethodType, WorkoutDayType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class PatchDayDtoItem {
  @ApiPropertyOptional({ enum: WorkoutDayType })
  @IsOptional()
  @IsEnum(WorkoutDayType)
  dayType?: WorkoutDayType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: TrainingMethodType })
  @IsOptional()
  @IsEnum(TrainingMethodType)
  trainingMethod?: TrainingMethodType;

  @ApiPropertyOptional({ type: [String], enum: MuscleGroup, isArray: true })
  @IsOptional()
  @IsEnum(MuscleGroup, { each: true })
  muscleGroups?: MuscleGroup[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasBFR?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasAbs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  howToExecute?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exerciseHint?: string;
}

export class PatchWeekDtoItem {
  @ApiProperty({ description: 'Which week to patch (1-based)' })
  @IsInt()
  @Min(1)
  weekNumber!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  trainingDays?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  restDays?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  accessories?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional({
    type: [PatchDayDtoItem],
    description:
      'Partial day updates. Matched by dayNumber (1-based position). ' +
      'Only send the days you want to change.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PatchDayDtoItem)
  days?: (PatchDayDtoItem & { dayNumber: number })[];
}

export class PatchDaySplitDto {
  @ApiProperty({
    type: [PatchWeekDtoItem],
    description: 'Array of weeks to patch. Only send weeks you want to change.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchWeekDtoItem)
  weeks!: PatchWeekDtoItem[];
}

