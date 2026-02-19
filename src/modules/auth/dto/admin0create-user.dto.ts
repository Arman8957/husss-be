import {
  IsEmail, IsString, IsOptional, IsEnum, IsBoolean, IsArray, MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class AdminCreateUserDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}