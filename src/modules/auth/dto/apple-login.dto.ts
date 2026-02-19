import { IsEmail, IsOptional, IsString } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  identityToken!: string;

  @IsEmail()
  @IsOptional()
  email?: string; // Required for first-time Apple login

  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @IsOptional()
  @IsString()
  user?: string; // JSON string with user info from Apple

  @IsOptional()
  @IsString()
  fullName?: string; // Optional: user's full name

  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}