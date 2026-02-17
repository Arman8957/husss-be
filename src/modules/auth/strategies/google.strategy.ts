import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    const options: StrategyOptions = {
      clientID: configService.get<string>('google.clientId') || '',
      clientSecret: configService.get<string>('google.clientSecret') || '',
      callbackURL: configService.get<string>('google.callbackUrl') || '',
      scope: ['email', 'profile'],
      passReqToCallback: false, // Explicitly set to false since we don't need the request in callback
    };
    super(options);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos, id } = profile;
    
    const user = {
      provider: 'google',
      providerId: id,
      email: emails[0].value,
      emailVerified: emails[0].verified || false,
      firstName: name?.givenName || '',
      lastName: name?.familyName || '',
      displayName: profile.displayName || '',
      picture: photos?.[0]?.value || null,
      accessToken,
      refreshToken,
    };
    
    done(null, user);
  }
}