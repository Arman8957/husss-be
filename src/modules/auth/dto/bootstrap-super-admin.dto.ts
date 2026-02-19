import { IsEmail, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class BootstrapSuperAdminDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @IsString()
  @MinLength(12, { message: 'Super admin password must be at least 12 characters' })
  password!: string;

  @IsString()
  @MinLength(1, { message: 'Bootstrap secret key is required' })
  secretKey!: string;
}
