import { IsString, IsOptional } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  idToken!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}