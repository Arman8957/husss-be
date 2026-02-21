// src/exercises/dto/exercise.dto.ts

import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, IsArray,
  Min, Max, MinLength, MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ExerciseCategory, MuscleGroup, EquipmentType, MediaType } from '@prisma/client';

export class ExerciseMediaItemDto {
  @ApiProperty({ enum: MediaType, example: MediaType.IMAGE, description: 'IMAGE | VIDEO | GIF' })
  @IsEnum(MediaType)
  type!: MediaType;

  @ApiProperty({ example: 'https://cdn.example.com/exercises/dbfbp.jpg' })
  @IsString()
  url!: string;

  @ApiPropertyOptional({ example: 'Exercise Image', description: '"Exercise Image" | "Exercise Animation"' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateExerciseDto {
  @ApiProperty({ example: 'Dumbbell Flat Bench Press', description: '2–120 chars' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'Keep your feet flat on the ground and maintain a slight arch in your lower back.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'Lie on bench. Hold dumbbells at chest. Press up until arms are extended.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ApiProperty({
    enum: ExerciseCategory,
    example: ExerciseCategory.COMPOUND,
    description: 'COMPOUND | ISOLATION | CARDIO | STRETCHING | ACTIVATION | BFR | ABS | ACCESSORY',
  })
  @IsEnum(ExerciseCategory)
  category!: ExerciseCategory;

  @ApiProperty({
    enum: MuscleGroup,
    example: MuscleGroup.CHEST,
    description: 'CHEST | BACK | SHOULDERS | BICEPS | TRICEPS | LEGS | QUADS | HAMSTRINGS | CALVES | GLUTES | ABS | TRAPS | FOREARMS | FULL_BODY',
  })
  @IsEnum(MuscleGroup)
  primaryMuscle!: MuscleGroup;

  @ApiPropertyOptional({ enum: MuscleGroup, isArray: true, example: [MuscleGroup.SHOULDERS, MuscleGroup.TRICEPS] })
  @IsOptional()
  @IsArray()
  @IsEnum(MuscleGroup, { each: true })
  secondaryMuscles?: MuscleGroup[];

  @ApiPropertyOptional({
    enum: EquipmentType,
    default: EquipmentType.NONE,
    description: 'BARBELL | DUMBBELL | CABLE | MACHINE | BODYWEIGHT | BANDS | KETTLEBELL | SMITH_MACHINE | NONE',
  })
  @IsOptional()
  @IsEnum(EquipmentType)
  equipment?: EquipmentType;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/exercises/dbfbp-thumb.jpg' })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/exercises/dbfbp.mp4' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/exercises/dbfbp.gif' })
  @IsOptional()
  @IsString()
  gifUrl?: string;

  @ApiPropertyOptional({
    type: [ExerciseMediaItemDto],
    description: 'Media items: images, videos, GIFs. Replaces thumbnailUrl/videoUrl/gifUrl when provided.',
  })
  @IsOptional()
  @IsArray()
  media?: ExerciseMediaItemDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExerciseDto extends PartialType(CreateExerciseDto) {}

export class ExerciseQueryDto {
  @ApiPropertyOptional({ enum: ExerciseCategory })
  @IsOptional()
  @IsEnum(ExerciseCategory)
  category?: ExerciseCategory;

  @ApiPropertyOptional({ enum: MuscleGroup })
  @IsOptional()
  @IsEnum(MuscleGroup)
  primaryMuscle?: MuscleGroup;

  @ApiPropertyOptional({ enum: EquipmentType })
  @IsOptional()
  @IsEnum(EquipmentType)
  equipment?: EquipmentType;

  @ApiPropertyOptional({ example: 'bench press' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 50;
}