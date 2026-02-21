import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PremiumGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user) throw new ForbiddenException('Authentication required');

    // Admins always bypass premium
    if (
      user.role === 'ADMIN' ||
      (Array.isArray(user.permissions) && user.permissions.includes('SUPER_ADMIN'))
    ) {
      return true;
    }

    // Check premium status and expiry
    const isPremiumActive =
      user.isPremium &&
      (!user.premiumUntil || new Date(user.premiumUntil) > new Date());

    if (!isPremiumActive) {
      throw new ForbiddenException('A premium subscription is required to access this feature');
    }

    return true;
  }
}