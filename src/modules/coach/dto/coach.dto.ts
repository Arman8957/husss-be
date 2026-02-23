import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsDateString,
  IsInt,
  IsArray,
  Min,
  Max,
  IsNumber,
  ValidateNested,
  IsPositive,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

// ─── AVAILABILITY ────────────────────────────────────────────────────────────

export class CreateAvailabilitySlotDto {
  @IsDateString()
  date!: string; // "2026-01-08"

  @IsString()
  startTime!: string; // "15:00" (24h)

  @IsString()
  endTime!: string; // "16:00"

  @IsOptional()
  @IsString()
  gymName?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class AvailabilityQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string; // filter: start date

  @IsOptional()
  @IsDateString()
  to?: string; // filter: end date

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeBooked?: boolean; // default false — only show unbooked
}

// ─── SESSION BOOKING ─────────────────────────────────────────────────────────

export class BookSessionDto {
  // Client sends this — picks an available slot from coach's calendar
  @IsString()
  availabilityId!: string;

  @IsOptional()
  @IsString()
  sessionType?: string; // e.g. "Strength Training"

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSessionStatusDto {
  @IsEnum(['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'])
  status!: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SessionQueryDto {
  @IsOptional()
  @IsEnum(['CONFIRMED', 'REQUESTED', 'DECLINED', 'CANCELLED', 'COMPLETED'])
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

// ─── INVITATION ───────────────────────────────────────────────────────────────

// Coach calls this to generate a new invite link/code
// No body needed — invite is always tied to the authenticated coach
export class GenerateInvitationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  expiryDays?: number = 30; // default 30 days
}

// Client (new OR existing user) uses this to accept an invite and join a coach
export class AcceptInvitationDto {
  @IsString()
  @Length(6, 64)
  code!: string; // short invitation code from the link

  // If the user is NOT yet registered, these fields are required
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  gymName?: string;

  @IsOptional()
  @IsString()
  gymLocation?: string;
}

// ─── PAR-Q SUBMISSION (by Client) ────────────────────────────────────────────

export class SubmitParqDto {
  // General Health
  @IsBoolean()
  hasHeartCondition!: boolean;

  @IsBoolean()
  chestPainDuringActivity!: boolean;

  @IsBoolean()
  chestPainAtRest!: boolean;

  @IsBoolean()
  losesBalanceDizziness!: boolean;

  // Blood Pressure & Cardiovascular
  @IsBoolean()
  hasHighBloodPressure!: boolean;

  @IsBoolean()
  doctorLimitedActivity!: boolean;

  // Musculoskeletal & Injuries
  @IsBoolean()
  hasBoneJointProblem!: boolean;

  @IsOptional()
  @IsString()
  boneJointDetails?: string; // "write down" field from screenshot

  @IsOptional()
  @IsBoolean()
  hadSurgeryLast12Months?: boolean;

  @IsOptional()
  @IsString()
  surgeryDetails?: string;

  // Metabolic & Medical Conditions
  @IsBoolean()
  hasDiabetesOrMetabolic!: boolean;

  @IsBoolean()
  takingPrescription!: boolean;

  @IsOptional()
  @IsString()
  prescriptionDetails?: string;

  // Respiratory
  @IsBoolean()
  hasAsthmaOrRespiratory!: boolean;

  // Neurological
  @IsBoolean()
  hasNeurologicalCondition!: boolean;

  // Other Health Considerations
  @IsBoolean()
  isPregnantOrRecentBirth?: boolean;

  @IsBoolean()
  hasOtherReason!: boolean;

  @IsOptional()
  @IsString()
  otherReasonDetails?: string;

  // Declaration & Signature
  @IsString()
  signatureName!: string; // typed name in "Name" field

  @IsOptional()
  @IsString()
  signatureData?: string; // base64 drawn signature

  @IsOptional()
  @IsString()
  doctorClearanceFileUrl?: string; // uploaded file URL (for cases needing doctor clearance)
}

// ─── PAR-Q REVIEW (by Coach) ─────────────────────────────────────────────────

export class ReviewParqDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── CLIENT PROFILE SETUP (coached user) ─────────────────────────────────────

export class SetupClientProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  age?: number;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  gender?: string;
}

// ─── BODY DIMENSION (client submits, coach can view) ─────────────────────────

export class CreateBodyDimensionDto {

  @IsDateString()
  date!: string; // "2026-02-15"

  @IsOptional()
  @IsNumber()
  @IsPositive()
  weight?: number;

  @IsOptional()
  @IsEnum(['KG', 'LB'])
  weightUnit?: 'KG' | 'LB';

  @IsOptional()
  @IsEnum(['CM', 'INCH'])
  measureUnit?: 'CM' | 'INCH';

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  waist?: number;

  @IsOptional()
  @IsNumber()
  leg?: number; // thigh circumference, 5.5in from mid knee

  @IsOptional()
  @IsNumber()
  arm?: number; // circumference at center of bicep

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bodyFatPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBodyDimensionDto extends PartialType(
  CreateBodyDimensionDto,
) {}

export class BodyDimensionQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

// ─── REMINDER PREFERENCES ────────────────────────────────────────────────────

export class UpdateReminderPreferencesDto {
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean; // 24h and 2h before session

  @IsOptional()
  @IsBoolean()
  emailReminders?: boolean; // 24h before session

  @IsOptional()
  @IsBoolean()
  smsReminders?: boolean; // 2h before session
}
