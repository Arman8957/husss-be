import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
// import { GoogleStrategy } from './strategies/google.strategy';
import { PrismaModule } from '../../prisma/prisma.module';
import { FirebaseModule } from '../../common/firebase/firebase.module';
import { EmailModule } from '../../common/email/email.module';

@Module({
  imports: [
    PrismaModule,
    FirebaseModule,
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
        signOptions: {
          expiresIn: configService.get('jwt.expiration'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],  
  providers: [
    AuthService,     
    TokenService,   
    JwtStrategy,
    // GoogleStrategy,
  ],
  exports: [AuthService, JwtModule], // Export AuthService if other modules need it
})
export class AuthModule {}