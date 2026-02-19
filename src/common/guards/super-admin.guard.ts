import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user) throw new ForbiddenException('Authentication required');

    const isSuperAdmin =
      Array.isArray(user.permissions) && user.permissions.includes('SUPER_ADMIN');

    if (!isSuperAdmin) {
      throw new ForbiddenException('Super admin access required');
    }

    return true;
  }
}
