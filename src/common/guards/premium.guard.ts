import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PremiumGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const isPremiumActive =
      user.isPremium && (!user.premiumUntil || new Date(user.premiumUntil) > new Date());

    if (!isPremiumActive) {
      throw new ForbiddenException('Premium subscription required');
    }

    return true;
  }
}