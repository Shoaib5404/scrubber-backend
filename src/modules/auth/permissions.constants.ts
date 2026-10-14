import { UserRole, type UserRoleValue } from './auth.constants';

/** Permission string values used by guards and seed data. */
export const Permission = {
  DashboardView: 'dashboard.view',
  BatchesView: 'batches.view',
  BatchesUpload: 'batches.upload',
  DatasetsManage: 'datasets.manage',
  ArticlesManage: 'articles.manage',
  UsersManage: 'users.manage',
  TenantsManage: 'tenants.manage',
  AuditView: 'audit.view',
  InquiriesView: 'inquiries.view',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: PermissionValue[] = [
  Permission.DashboardView,
  Permission.BatchesView,
  Permission.BatchesUpload,
  Permission.DatasetsManage,
  Permission.ArticlesManage,
  Permission.UsersManage,
  Permission.TenantsManage,
  Permission.AuditView,
  Permission.InquiriesView,
];

export type PermissionMeta = {
  value: PermissionValue;
  label: string;
  description: string;
  group: string;
};

export const PERMISSION_CATALOG: PermissionMeta[] = [
  {
    value: Permission.DashboardView,
    label: 'View Dashboard',
    description: 'Access the main dashboard and CPT search.',
    group: 'General',
  },
  {
    value: Permission.BatchesView,
    label: 'View Batch Claims',
    description: 'View uploaded batches and claims.',
    group: 'Claims',
  },
  {
    value: Permission.BatchesUpload,
    label: 'Upload EDI',
    description: 'Upload and process EDI files.',
    group: 'Claims',
  },
  {
    value: Permission.DatasetsManage,
    label: 'Manage Datasets',
    description: 'Access dataset tables (CPT, ICD, NCCI, ZIP, etc.).',
    group: 'Reference Data',
  },
  {
    value: Permission.ArticlesManage,
    label: 'Manage Articles',
    description: 'Access articles and related contractor data.',
    group: 'Reference Data',
  },
  {
    value: Permission.UsersManage,
    label: 'Manage Users',
    description: 'Create and edit Admin, User, and Customer accounts.',
    group: 'Administration',
  },
  {
    value: Permission.TenantsManage,
    label: 'Manage Tenants',
    description: 'Create organizations, invite members, and manage subscriptions.',
    group: 'Administration',
  },
  {
    value: Permission.AuditView,
    label: 'View Audit Logs',
    description: 'View platform audit events across tenants.',
    group: 'Administration',
  },
  {
    value: Permission.InquiriesView,
    label: 'View Inquiries',
    description: 'View and manage customer and public support inquiries.',
    group: 'Administration',
  },
];

/** Roles whose matrix rows Super Admin can edit. */
export const MANAGEABLE_ROLES: UserRoleValue[] = [UserRole.Admin, UserRole.User];

export function defaultPermissionsFor(role: string): PermissionValue[] {
  if (role === UserRole.Admin) {
    return [...ALL_PERMISSIONS];
  }
  if (role === UserRole.User) {
    return [
      Permission.DashboardView,
      Permission.BatchesView,
      Permission.BatchesUpload,
    ];
  }
  return [];
}

export const SUBSCRIPTION_INACTIVE_MESSAGE =
  'Your subscription is not active. Upload and validation are unavailable. Please contact support to renew.';

export const SUBSCRIPTION_LOGIN_WARNING =
  'Your subscription is not active. You can view existing batches, but upload and validation are unavailable until it is renewed.';
