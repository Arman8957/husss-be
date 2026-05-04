import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkoutDayType, TrainingMethodType } from '@prisma/client';
 
/** POST /freestyle/setup — configure and start freestyle mode */
export class FreestyleSetupDto {
  @ApiProperty({
    description: 'Program length in weeks (1–5)',
    minimum: 1,
    maximum: 5,
    example: 3,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  programLengthWeeks!: number;
 
  @ApiPropertyOptional({
    description: 'Enable BFR finisher sets',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  bfrEnabled?: boolean;
 
  @ApiPropertyOptional({
    description: 'Abs workout preference',
    enum: ['TWO_DAY', 'THREE_DAY'],
    default: 'TWO_DAY',
  })
  @IsOptional()
  @IsEnum(['TWO_DAY', 'THREE_DAY'])
  absWorkoutType?: 'TWO_DAY' | 'THREE_DAY';
}
 
/** POST /freestyle/session/start — begin a freestyle workout session */
export class StartFreestyleSessionDto {
  @ApiProperty({
    description: 'Day type the user chose',
    enum: ['PUSH', 'PULL', 'LEGS'],
    example: 'PUSH',
  })
  @IsEnum(['PUSH', 'PULL', 'LEGS'])
  dayType!: 'PUSH' | 'PULL' | 'LEGS';
 
  @ApiProperty({
    description: 'Training method the user selected from the list',
    enum: TrainingMethodType,
    example: 'FIVE_BY_FIVE',
  })
  @IsEnum(TrainingMethodType)
  trainingMethod!: TrainingMethodType;
}
 
/** POST /freestyle/session/:sessionId/log-set — log a set during session */
export class LogFreestyleSetDto {
  @ApiProperty({ description: 'Exercise ID from the library' })
  @IsString()
  exerciseId!: string;
 
  @ApiProperty({ description: 'Set number (1-based)', example: 1 })
  @IsInt()
  @Min(1)
  setNumber!: number;
 
  @ApiPropertyOptional({ description: 'Planned reps', example: 5 })
  @IsOptional()
  @IsInt()
  plannedReps?: number;
 
  @ApiPropertyOptional({ description: 'Actual reps completed', example: 5 })
  @IsOptional()
  @IsInt()
  actualReps?: number;
 
  @ApiPropertyOptional({ description: 'Weight used', example: 100 })
  @IsOptional()
  @IsNumber()
  weight?: number;
 
  @ApiPropertyOptional({ description: 'Set type', enum: ['NORMAL', 'WARMUP', 'DROP_SET', 'FAILURE', 'BFR'] })
  @IsOptional()
  @IsEnum(['NORMAL', 'WARMUP', 'DROP_SET', 'FAILURE', 'BFR'])
  setType?: string;
 
  @ApiPropertyOptional({ description: 'Notes for this set' })
  @IsOptional()
  @IsString()
  notes?: string;
}
 
/** PATCH /freestyle/session/:sessionId/complete — finish the session */
export class CompleteFreestyleSessionDto {
  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsInt()
  durationSeconds?: number;
 
  @ApiPropertyOptional({ description: 'Session notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}