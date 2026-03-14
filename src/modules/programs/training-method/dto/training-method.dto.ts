// src/modules/training-methods/dto/training-method.dto.ts
import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, Min,
  MaxLength, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TrainingMethodType } from '@prisma/client';

export class CreateTrainingMethodDto {
  @ApiProperty({ example: '5×5', description: 'Unique name, 2–80 chars' })
  @IsString() @MinLength(2) @MaxLength(80)
  name!: string;

  @ApiProperty({
    enum: TrainingMethodType,
    example: TrainingMethodType.FIVE_BY_FIVE,
    description:
      'FIVE_BY_FIVE | MAX_OT | BULLDOZER | BURNS | GIRONDA_8X8 | TEN_BY_THREE | ' +
      'HIGH_REP_20_REP_SQUAT | YATES_HIGH_INTENSITY | WESTSIDE_CONJUGATE | ' +
      'MODERATE_VOLUME | SINGLES_DOUBLES_TRIPLES | ACTIVATION | CUSTOM',
  })
  @IsEnum(TrainingMethodType)
  type!: TrainingMethodType;

  @ApiProperty({ example: 'Classic strength builder. 5 sets × 5 reps at 80-85% 1RM.' })
  @IsString() @MinLength(10) @MaxLength(1000)
  description!: string;

  @ApiPropertyOptional({ example: '5 sets × 5 reps' })
  @IsOptional() @IsString() @MaxLength(200)
  setsInfo?: string;

  @ApiPropertyOptional({ example: '4-6' })
  @IsOptional() @IsString() @MaxLength(20)
  repRange?: string;

  @ApiPropertyOptional({ example: '2-3 min' })
  @IsOptional() @IsString() @MaxLength(30)
  restPeriod?: string;

  @ApiPropertyOptional({ example: 'High' })
  @IsOptional() @IsString() @MaxLength(30)
  intensity?: string;

  @ApiPropertyOptional({ example: 'Increase weight when you can complete all sets.' })
  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Display order (lower = first)' })
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateTrainingMethodDto extends PartialType(CreateTrainingMethodDto) {}

export class TrainingMethodQueryDto {
  @ApiPropertyOptional({ enum: TrainingMethodType })
  @IsOptional() @IsEnum(TrainingMethodType)
  type?: TrainingMethodType;

  @ApiPropertyOptional({ description: 'true = active only | false = inactive only | omit = all' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true')  return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}

// // src/training-methods/dto/training-method.dto.ts

// import {
//   IsString, IsOptional, IsEnum, IsBoolean, IsInt, Min, MaxLength, MinLength,
// } from 'class-validator';
// import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
// import { Type, Transform } from 'class-transformer';
// import { TrainingMethodType } from '@prisma/client';

// export class CreateTrainingMethodDto {
//   @ApiProperty({ example: '5×5', description: 'Unique display name, 2–50 chars' })
//   @IsString()
//   @MinLength(2)
//   @MaxLength(50)
//   name!: string;

//   @ApiProperty({
//     enum: TrainingMethodType,
//     example: TrainingMethodType.FIVE_BY_FIVE,
//     description: 'FIVE_BY_FIVE | MAX_OT | BULLDOZER | BURNS | GIRONDA_8X8 | TEN_BY_THREE | HIGH_REP_20_REP_SQUAT | YATES_HIGH_INTENSITY | WESTSIDE_CONJUGATE | MODERATE_VOLUME | SINGLES_DOUBLES_TRIPLES | ACTIVATION | CUSTOM',
//   })
//   @IsEnum(TrainingMethodType)
//   type!: TrainingMethodType;

//   @ApiProperty({
//     example: 'Classic strength and mass builder using 5 sets of 5 reps at around 80–85% of your 1RM.',
//   })
//   @IsString()
//   @MinLength(10)
//   @MaxLength(1000)
//   description!: string;

//   @ApiPropertyOptional({ example: '5 sets of 5 heavy reps' })
//   @IsOptional()
//   @IsString()
//   @MaxLength(100)
//   setsInfo?: string;

//   @ApiPropertyOptional({ example: '4-6' })
//   @IsOptional()
//   @IsString()
//   @MaxLength(20)
//   repRange?: string;

//   @ApiPropertyOptional({ example: '2-3 min' })
//   @IsOptional()
//   @IsString()
//   @MaxLength(30)
//   restPeriod?: string;

//   @ApiPropertyOptional({ example: 'High' })
//   @IsOptional()
//   @IsString()
//   @MaxLength(30)
//   intensity?: string;

//   @ApiPropertyOptional({ example: 'Warm up sets not included.' })
//   @IsOptional()
//   @IsString()
//   @MaxLength(500)
//   notes?: string;

//   @ApiPropertyOptional({ default: true })
//   @IsOptional()
//   @IsBoolean()
//   isActive?: boolean;

//   @ApiPropertyOptional({ default: 0, description: 'Display order (lower = first)' })
//   @IsOptional()
//   @IsInt()
//   @Min(0)
//   sortOrder?: number;
// }

// export class UpdateTrainingMethodDto extends PartialType(CreateTrainingMethodDto) {}

// export class TrainingMethodQueryDto {
//   @ApiPropertyOptional({ enum: TrainingMethodType })
//   @IsOptional()
//   @IsEnum(TrainingMethodType)
//   type?: TrainingMethodType;

//   @ApiPropertyOptional()
//   @IsOptional()
//   @Transform(({ value }) => value === 'true')
//   @IsBoolean()
//   isActive?: boolean;
// }