import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}