import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { AuthProvider } from 'src/common/enums/auth-provider.enum';


export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsEnum(AuthProvider)
  provider?: AuthProvider = AuthProvider.EMAIL;
}