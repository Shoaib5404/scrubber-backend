import { ApiScope, type ApiScopeValue } from '../auth/auth.constants';

/** Known API scopes staff may assign to platform service clients. */
export const SERVICE_CLIENT_SCOPES: ApiScopeValue[] = [
  ApiScope.ReferenceRead,
  ApiScope.BatchesRead,
  ApiScope.BatchesWrite,
  ApiScope.Validate,
];

export type ServiceClientScopeMeta = {
  value: ApiScopeValue;
  label: string;
  description: string;
};

export const SERVICE_CLIENT_SCOPE_CATALOG: ServiceClientScopeMeta[] = [
  {
    value: ApiScope.ReferenceRead,
    label: 'Reference read',
    description: 'ICD/CPT/modifier search and validate (TeleWound-style).',
  },
  {
    value: ApiScope.BatchesRead,
    label: 'Batches read',
    description: 'List and view EDI batches.',
  },
  {
    value: ApiScope.BatchesWrite,
    label: 'Batches write',
    description: 'Upload and ingest EDI batches via API.',
  },
  {
    value: ApiScope.Validate,
    label: 'Validate',
    description: 'Run claim validation on batches.',
  },
];

export function isKnownServiceClientScope(value: string): value is ApiScopeValue {
  return (SERVICE_CLIENT_SCOPES as string[]).includes(value);
}
