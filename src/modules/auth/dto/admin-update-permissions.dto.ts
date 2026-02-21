import { IsArray, IsString } from 'class-validator';

export const VALID_PERMISSIONS = [
  'CREATE_USERS',
  'DELETE_USERS',
  'MANAGE_ROLES',
  'MANAGE_COACHES',
  'VIEW_AUDIT_LOGS',
  'MANAGE_SUBSCRIPTIONS',
  'MANAGE_CONTENT',
  'MANAGE_PROGRAMS',
  'MANAGE_EXERCISES',
  'SEND_NOTIFICATIONS',
  'VIEW_ANALYTICS',
] as const;

export class AdminUpdatePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}