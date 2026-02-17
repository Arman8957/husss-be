// src/common/enums/user-role.enum.ts
export const UserRole = {
  USER: 'USER',
  PREMIUM: 'PREMIUM',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  SUPPORT: 'SUPPORT',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];