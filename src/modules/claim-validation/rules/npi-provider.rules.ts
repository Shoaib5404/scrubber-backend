import { ClaimIssue } from '../types';

/** Laravel NpiProviderRules */
export const NPI_001 = 'NPI-001';
export const NPI_002 = 'NPI-002';
export const NPI_003 = 'NPI-003';
export const REF_CMS_001 = 'REF-CMS-001';
export const REF_NPI_002 = 'REF-NPI-002';

export const MEDICARE_REFERRING_CMS_MESSAGE =
  'Referring provider must match with https://data.cms.gov/Medicare-Enrollment/Order-and-Referring/qcn7-gc3g/data';

export const REFERRING_PROVIDER_MISSING_INVALID_MESSAGE = 'Referring provider is missing/invalid.';

export const RENDERING_REJECTION_MESSAGE =
  'Rendering provider last name does not match the provider record associated with NPI %s. Please verify and correct the provider information.';

export const RENDERING_MISSING_LAST_NAME_MESSAGE =
  'Rendering provider last name is required when a rendering provider NPI is provided.';

export const INVALID_NPI_MESSAGE = 'Invalid NPI';

const MEDICARE_FILING_INDICATORS: readonly string[] = ['MA', 'MB'];
const MIN_LAST_NAME_LENGTH = 3;

const APOSTROPHE_VARIANTS = ['\u2019', '\u2018', '`', '\u00B4', '\u2032'];

export type NpiOrderingReferringRegistryRow = {
  last_name?: string | null;
};

export type NpiProviderClaimInput = {
  claimFilingIndicator: string | null;
  renderingProviderNpi: string | null;
  renderingProviderLastName: string | null;
  referringProviderNpi: string | null;
  referringProviderLastName: string | null;
  referringProviderFirstName: string | null;
  billingProviderNpi: string | null;
};

/** Laravel NpiProviderRules::isApplicable */
export function isApplicableNpiProvider(claim: Pick<NpiProviderClaimInput, 'claimFilingIndicator'>): boolean {
  const indicator = String(claim.claimFilingIndicator ?? '')
    .trim()
    .toUpperCase();
  return MEDICARE_FILING_INDICATORS.includes(indicator);
}

/**
 * Laravel NpiProviderRules::validate
 *
 * @param registryByNpi Map/Record keyed by trimmed NPI -> active `npi_ordering_referrings` row.
 */
export function validateNpiProvider(
  claim: NpiProviderClaimInput,
  registryByNpi: Readonly<Record<string, NpiOrderingReferringRegistryRow | undefined>>,
): ClaimIssue[] {
  if (!isApplicableNpiProvider(claim)) {
    return [];
  }

  return [...validateRenderingProvider(claim, registryByNpi), ...validateReferringProvider(claim, registryByNpi)];
}

function validateRenderingProvider(
  claim: NpiProviderClaimInput,
  registryByNpi: Readonly<Record<string, NpiOrderingReferringRegistryRow | undefined>>,
): ClaimIssue[] {
  if (!hasValidNpi(claim.renderingProviderNpi)) {
    return [];
  }

  const npi = String(claim.renderingProviderNpi ?? '').trim();
  const registryRow = registryByNpi[npi];

  if (!hasValidLastName(claim.renderingProviderLastName)) {
    return [
      {
        rule: NPI_003,
        field: 'rendering_provider_last_name',
        message: RENDERING_MISSING_LAST_NAME_MESSAGE,
        severity: 'error',
      },
    ];
  }

  if (!registryRow) {
    return [
      {
        rule: NPI_002,
        field: 'rendering_provider_npi',
        message: INVALID_NPI_MESSAGE,
        severity: 'error',
      },
    ];
  }

  const registryLastName = normalizeLastName(registryRow.last_name);
  if (registryLastName === '') {
    return [];
  }

  const claimLastName = normalizeLastName(claim.renderingProviderLastName);
  if (claimLastName === registryLastName) {
    return [];
  }

  return [
    {
      rule: NPI_001,
      field: 'rendering_provider_last_name',
      message: RENDERING_REJECTION_MESSAGE.replace('%s', npi),
      severity: 'error',
    },
  ];
}

function validateReferringProvider(
  claim: NpiProviderClaimInput,
  registryByNpi: Readonly<Record<string, NpiOrderingReferringRegistryRow | undefined>>,
): ClaimIssue[] {
  if (!hasReferringProviderEntity(claim)) {
    return [];
  }

  const referringNpi = String(claim.referringProviderNpi ?? '').trim();
  const billingNpi = String(claim.billingProviderNpi ?? '').trim();
  const referringDistinctFromBilling = billingNpi === '' || referringNpi !== billingNpi;

  if (referringDistinctFromBilling) {
    if (!validateReferringProviderNpi(referringNpi)) {
      return [
        referringMissingInvalidError(
          'referring_provider_npi',
          referringNpi !== '' ? referringNpi : null,
        ),
      ];
    }
  } else {
    return [referringCmsError('referring_provider_npi')];
  }

  if (!hasValidLastName(claim.referringProviderLastName)) {
    return [referringCmsError('referring_provider_last_name')];
  }

  const registryRow = registryByNpi[referringNpi];
  if (!registryRow) {
    return [referringCmsError('referring_provider_npi')];
  }

  const registryLastName = normalizeLastName(registryRow.last_name);
  if (registryLastName === '') {
    return [referringCmsError('referring_provider_last_name')];
  }

  const claimLastName = normalizeLastName(claim.referringProviderLastName);
  if (claimLastName === registryLastName) {
    return [];
  }

  return [referringCmsError('referring_provider_last_name')];
}

function referringCmsError(field: string): ClaimIssue {
  return {
    rule: REF_CMS_001,
    field,
    message: MEDICARE_REFERRING_CMS_MESSAGE,
    severity: 'error',
  };
}

function referringMissingInvalidError(field: string, _npi: string | null): ClaimIssue {
  return {
    rule: REF_NPI_002,
    field,
    message: REFERRING_PROVIDER_MISSING_INVALID_MESSAGE,
    severity: 'error',
  };
}

function hasReferringProviderEntity(claim: NpiProviderClaimInput): boolean {
  for (const field of [
    claim.referringProviderLastName,
    claim.referringProviderFirstName,
    claim.referringProviderNpi,
  ]) {
    if (String(field ?? '').trim() !== '') {
      return true;
    }
  }
  return false;
}

function validateReferringProviderNpi(npi: string): boolean {
  return hasValidNpi(npi);
}

function hasValidNpi(npi: string | null | undefined): boolean {
  const value = String(npi ?? '').trim();
  return value !== '' && /^\d{10}$/.test(value);
}

function hasValidLastName(lastName: string | null | undefined): boolean {
  return String(lastName ?? '').trim().length >= MIN_LAST_NAME_LENGTH;
}

function normalizeLastName(name: string | null | undefined): string {
  let normalized = String(name ?? '')
    .trim()
    .toUpperCase();
  if (normalized === '') {
    return '';
  }
  for (const variant of APOSTROPHE_VARIANTS) {
    normalized = normalized.split(variant).join("'");
  }
  return normalized;
}
