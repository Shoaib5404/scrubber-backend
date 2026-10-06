/** Laravel-aligned role strings (`App\Enums\UserRole`). */
export const UserRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  User: 'user',
  Customer: 'customer',
} as const;

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const STAFF_ROLES: UserRoleValue[] = [
  UserRole.SuperAdmin,
  UserRole.Admin,
  UserRole.User,
];

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as string[]).includes(role);
}

/** Laravel ApiClient ability strings. */
export const ApiScope = {
  BatchesRead: 'batches:read',
  BatchesWrite: 'batches:write',
  Validate: 'validate',
  ReferenceRead: 'reference:read',
} as const;

export type ApiScopeValue = (typeof ApiScope)[keyof typeof ApiScope];

export const DEFAULT_CUSTOMER_SCOPES: ApiScopeValue[] = [
  ApiScope.BatchesRead,
  ApiScope.BatchesWrite,
  ApiScope.Validate,
];
