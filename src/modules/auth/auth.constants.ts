/** Shown when an inactive user attempts login. */
export const ACCOUNT_DEACTIVATED_MESSAGE =
  'Your account has been deactivated.';

/** Role strings used by auth + tenant membership. */
export const UserRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  User: 'user',
  Customer: 'customer',
  TenantAdmin: 'tenant_admin',
} as const;

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const STAFF_ROLES: UserRoleValue[] = [
  UserRole.SuperAdmin,
  UserRole.Admin,
  UserRole.User,
];

export const TENANT_ROLES: UserRoleValue[] = [
  UserRole.TenantAdmin,
  UserRole.Customer,
];

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as string[]).includes(role);
}

export function isTenantRole(role: string): boolean {
  return (TENANT_ROLES as string[]).includes(role);
}

export const TENANT_SUSPENDED_MESSAGE =
  'This organization has been suspended. Contact support.';

/** ApiClient ability strings. */
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
