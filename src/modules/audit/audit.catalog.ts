export const AuditCategoryCode = {
  AuthLogin: 'auth.login',
  AuthLogout: 'auth.logout',
  AuthPasswordReset: 'auth.password_reset',
  AuthInviteAccept: 'auth.invite_accept',
  AuthEmailVerify: 'auth.email_verify',
  AuthApiTokenIssue: 'auth.api_token_issue',

  StaffTenantBatchAccess: 'staff.tenant_batch_access',
  StaffTenantClaimAccess: 'staff.tenant_claim_access',

  AdminUserCreate: 'admin.user_create',
  AdminUserUpdate: 'admin.user_update',
  AdminMemberUpdate: 'admin.member_update',
  AdminPermissionsSync: 'admin.permissions_sync',

  AdminTenantCreate: 'admin.tenant_create',
  AdminTenantUpdate: 'admin.tenant_update',
  AdminTenantFeatures: 'admin.tenant_features',

  BatchUploadSucceeded: 'batch.upload_succeeded',
  BatchParse: 'batch.parse',
  BatchProcess: 'batch.process',
  BatchValidate: 'batch.validate',
  BatchStatusChange: 'batch.status_change',
  ClaimUpdate: 'claim.update',
  ClaimValidate: 'claim.validate',

  BatchDelete: 'batch.delete',
  BatchRetry: 'batch.retry',
  BatchCancel: 'batch.cancel',

  ReferenceCreate: 'reference.create',
  ReferenceUpdate: 'reference.update',
  ReferenceDelete: 'reference.delete',
  ReferenceImport: 'reference.import',

  SettingsIntegrations: 'settings.integrations',
  AdminServiceClient: 'admin.service_client',
  AdminApiClient: 'admin.api_client',

  BusinessRuleGlobalUpdate: 'business_rule.global_update',
  BusinessRulePersonalUpdate: 'business_rule.personal_update',
  BusinessRuleGrant: 'business_rule.grant',
  BusinessRuleRevoke: 'business_rule.revoke',
} as const;

/** Removed from product; rows may still exist historically. Never write these. */
export const RETIRED_AUDIT_CATEGORY_CODES: readonly string[] = [
  'auth.login_failed',
  'auth.token_refresh',
  'staff.edi_view',
  'batch.edi_download',
  'reference.export',
  'reference.toggle',
];

export type AuditCategoryCodeValue =
  (typeof AuditCategoryCode)[keyof typeof AuditCategoryCode];

export type AuditCategoryMeta = {
  code: AuditCategoryCodeValue;
  label: string;
  description: string;
  group: string;
  /** Seed default; Super Admin can flip at runtime. */
  enabledByDefault: boolean;
};

export const AUDIT_CATEGORY_CATALOG: AuditCategoryMeta[] = [
  {
    code: AuditCategoryCode.AuthLogin,
    label: 'Login succeeded',
    description: 'Successful user login.',
    group: 'Auth',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AuthLogout,
    label: 'Logout',
    description: 'User logout / refresh token revoke.',
    group: 'Auth',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AuthPasswordReset,
    label: 'Password reset',
    description: 'Password reset request and completion.',
    group: 'Auth',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AuthInviteAccept,
    label: 'Invite accepted',
    description: 'Tenant invite acceptance.',
    group: 'Auth',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AuthEmailVerify,
    label: 'Email verification',
    description: 'Email verification link used.',
    group: 'Auth',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AuthApiTokenIssue,
    label: 'API token issued',
    description: 'Machine client access token issued.',
    group: 'Auth',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.StaffTenantBatchAccess,
    label: 'Staff batch access',
    description: 'Staff viewed or accessed a tenant batch.',
    group: 'Staff access',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.StaffTenantClaimAccess,
    label: 'Staff claim access',
    description: 'Staff viewed or accessed a tenant claim.',
    group: 'Staff access',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminUserCreate,
    label: 'User created',
    description: 'Staff created a user account.',
    group: 'Users / RBAC',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminUserUpdate,
    label: 'User updated',
    description: 'Staff updated a user account.',
    group: 'Users / RBAC',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminMemberUpdate,
    label: 'Tenant member updated',
    description: 'Staff updated a tenant member role or status.',
    group: 'Users / RBAC',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminPermissionsSync,
    label: 'Permissions synced',
    description: 'Role permission matrix updated.',
    group: 'Users / RBAC',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminTenantCreate,
    label: 'Tenant created',
    description: 'Organization / tenant created.',
    group: 'Tenants',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminTenantUpdate,
    label: 'Tenant updated',
    description: 'Tenant status, subscription, or profile updated.',
    group: 'Tenants',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminTenantFeatures,
    label: 'Tenant features changed',
    description: 'Tenant feature flags replaced.',
    group: 'Tenants',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchUploadSucceeded,
    label: 'Upload succeeded',
    description: 'EDI file upload completed successfully.',
    group: 'Uploads',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchParse,
    label: 'Batch parse',
    description: 'Batch parse / claim persist step.',
    group: 'Pipeline',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchProcess,
    label: 'Batch process',
    description: 'Batch process step started or completed.',
    group: 'Pipeline',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchValidate,
    label: 'Batch validate',
    description: 'Batch rule validation started or completed.',
    group: 'Pipeline',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchStatusChange,
    label: 'Batch status change',
    description: 'Batch status transition.',
    group: 'Pipeline',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.ClaimUpdate,
    label: 'Claim updated',
    description: 'Claim or service line fields updated.',
    group: 'Pipeline',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.ClaimValidate,
    label: 'Claim validated',
    description: 'Single-claim validation run.',
    group: 'Pipeline',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchDelete,
    label: 'Batch deleted',
    description: 'Batch file deleted.',
    group: 'Files / ops',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchRetry,
    label: 'Batch retry',
    description: 'Force re-process or re-validate.',
    group: 'Files / ops',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BatchCancel,
    label: 'Batch cancel',
    description: 'Reserved for future cancel API (disabled by default).',
    group: 'Files / ops',
    enabledByDefault: false,
  },
  {
    code: AuditCategoryCode.ReferenceCreate,
    label: 'Reference create',
    description: 'Reference-admin record created.',
    group: 'Reference',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.ReferenceUpdate,
    label: 'Reference update',
    description: 'Reference-admin record updated.',
    group: 'Reference',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.ReferenceDelete,
    label: 'Reference delete',
    description: 'Reference-admin record deleted.',
    group: 'Reference',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.ReferenceImport,
    label: 'Reference import',
    description: 'Reference domain import.',
    group: 'Reference',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.SettingsIntegrations,
    label: 'Integrations settings',
    description: 'Customer integration credentials created or rotated.',
    group: 'Credentials',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminServiceClient,
    label: 'Service client change',
    description: 'Platform service client create/rotate/revoke.',
    group: 'Credentials',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.AdminApiClient,
    label: 'API client change',
    description: 'Per-user API client create/rotate/revoke.',
    group: 'Credentials',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BusinessRuleGlobalUpdate,
    label: 'Business rule platform default',
    description: 'A super admin turned a business rule on or off for everyone without a personal switch.',
    group: 'Business rules',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BusinessRulePersonalUpdate,
    label: 'Business rule personal switch',
    description: 'A user turned a business rule on or off for their own uploads.',
    group: 'Business rules',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BusinessRuleGrant,
    label: 'Business rule access granted',
    description: 'A super admin allowed a user to change their own business rule switches.',
    group: 'Business rules',
    enabledByDefault: true,
  },
  {
    code: AuditCategoryCode.BusinessRuleRevoke,
    label: 'Business rule access revoked',
    description: 'A super admin removed a user\'s ability to change business rule switches.',
    group: 'Business rules',
    enabledByDefault: true,
  },
];

export const ALL_AUDIT_CATEGORY_CODES: AuditCategoryCodeValue[] =
  AUDIT_CATEGORY_CATALOG.map((c) => c.code);

/** Categories that are platform-only (never shown to customer tenant viewers). */
export const PLATFORM_ONLY_AUDIT_CATEGORIES: ReadonlySet<string> = new Set([
  AuditCategoryCode.AdminPermissionsSync,
  AuditCategoryCode.AdminUserCreate,
  AuditCategoryCode.AdminUserUpdate,
  AuditCategoryCode.AdminServiceClient,
  AuditCategoryCode.ReferenceCreate,
  AuditCategoryCode.ReferenceUpdate,
  AuditCategoryCode.ReferenceDelete,
  AuditCategoryCode.ReferenceImport,
  AuditCategoryCode.StaffTenantBatchAccess,
  AuditCategoryCode.StaffTenantClaimAccess,
  AuditCategoryCode.BusinessRuleGlobalUpdate,
  AuditCategoryCode.BusinessRuleGrant,
  AuditCategoryCode.BusinessRuleRevoke,
]);
