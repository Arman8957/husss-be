import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class AdminChangeRoleDto {
  @IsEnum(UserRole, { message: `role must be one of: ${Object.values(UserRole).join(', ')}` })
    role!: UserRole;
}

import { IsBoolean } from 'class-validator';

export class AdminToggleStatusDto {
  @IsBoolean()
    isActive!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// auth/dto/admin-approve-coach.dto.ts
// ─────────────────────────────────────────────────────────────────────────────


export class AdminApproveCoachDto {
  @IsBoolean()
  approved!: boolean ;
}