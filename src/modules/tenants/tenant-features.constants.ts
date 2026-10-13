import { ApiScope, type ApiScopeValue } from '../auth/auth.constants';

export const TenantFeatureCode = {
  WebUpload: 'web.upload',
  ApiAccess: 'api.access',
  ApiBatches: 'api.batches',
  ApiReference: 'api.reference',
} as const;

export type TenantFeatureCodeValue =
  (typeof TenantFeatureCode)[keyof typeof TenantFeatureCode];

export const ALL_TENANT_FEATURES: TenantFeatureCodeValue[] = [
  TenantFeatureCode.WebUpload,
  TenantFeatureCode.ApiAccess,
  TenantFeatureCode.ApiBatches,
  TenantFeatureCode.ApiReference,
];

export type TenantFeatureMeta = {
  value: TenantFeatureCodeValue;
  label: string;
  description: string;
  group: string;
};

export const TENANT_FEATURE_CATALOG: TenantFeatureMeta[] = [
  {
    value: TenantFeatureCode.WebUpload,
    label: 'Web EDI upload',
    description: 'Upload and validate EDI files from the customer portal.',
    group: 'Portal',
  },
  {
    value: TenantFeatureCode.ApiAccess,
    label: 'API access',
    description: 'Create and rotate machine Client ID / secret credentials.',
    group: 'API',
  },
  {
    value: TenantFeatureCode.ApiBatches,
    label: 'Batches API',
    description: 'API scopes for reading, uploading, and validating batches.',
    group: 'API',
  },
  {
    value: TenantFeatureCode.ApiReference,
    label: 'Reference API',
    description: 'API scope for ICD/CPT/modifier search and validate.',
    group: 'API',
  },
];

/** Map enabled features → API scopes for tenant-bound clients. */
export function scopesForFeatures(features: string[]): ApiScopeValue[] {
  const set = new Set(features);
  const scopes: ApiScopeValue[] = [];
  if (set.has(TenantFeatureCode.ApiBatches)) {
    scopes.push(ApiScope.BatchesRead, ApiScope.BatchesWrite, ApiScope.Validate);
  }
  if (set.has(TenantFeatureCode.ApiReference)) {
    scopes.push(ApiScope.ReferenceRead);
  }
  return scopes;
}

export function isKnownTenantFeature(value: string): value is TenantFeatureCodeValue {
  return (ALL_TENANT_FEATURES as string[]).includes(value);
}

export const FEATURE_REQUIRED_MESSAGE =
  'This feature is not included in your subscription. Please contact support.';
