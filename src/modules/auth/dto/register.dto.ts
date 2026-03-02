import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';

export class RegisterDto {
  @ApiProperty({
    example: 'arman@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongPassword123',
    description: 'User password (minimum 6 characters)',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    example: 'Md Arman',
    description: 'Full name of the user',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.yoursite.com/avatar.png',
    description: 'User profile avatar URL',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    enum: AuthProvider,
    example: AuthProvider.EMAIL,
    description: 'Authentication provider (EMAIL, GOOGLE, FACEBOOK, etc.)',
    default: AuthProvider.EMAIL,
  })
  @IsOptional()
  @IsEnum(AuthProvider)
  provider?: AuthProvider = AuthProvider.EMAIL;
}