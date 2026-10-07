import type { ReferenceDomainDefinition } from './reference-domain.types';

function def(partial: ReferenceDomainDefinition): ReferenceDomainDefinition {
  return partial;
}

/**
 * Wave C geographic / taxonomy / misc reference domains (SP-7 Task 17).
 *
 * Not registered (no Laravel web CRUD; import-only):
 * - dmerc_region_lookup — ImportArticleData
 * - state_x_region — ImportArticleData
 */
export const WAVE_C_DOMAIN_DEFINITIONS: ReferenceDomainDefinition[] = [
  def({
    slug: 'taxonomy-codes',
    title: 'Taxonomy Codes',
    prismaModel: 'taxonomyCode',
    lookupTable: 'taxonomy_codes',
    hasToggle: true,
    activeFilter: 'isActive',
    searchFields: ['taxonomyCode', 'specialtyName'],
    writableFields: ['taxonomyCode', 'specialtyName', 'isActive'],
    createRequired: ['taxonomyCode', 'specialtyName'],
  }),
  def({
    slug: 'zip-codes',
    title: 'Zip Codes',
    prismaModel: 'zipCode',
    lookupTable: 'zip_codes',
    hasToggle: true,
    activeFilter: 'isActive',
    searchFields: ['zipCode', 'city', 'state', 'stateName'],
    writableFields: ['zipCode', 'zipCodeType', 'city', 'stateName', 'state', 'isActive'],
    createRequired: ['zipCode', 'city', 'state'],
  }),
  def({
    slug: 'region-lookup',
    title: 'Region Lookup',
    prismaModel: 'regionLookup',
    lookupTable: 'region_lookup',
    idField: 'regionId',
    searchFields: ['regionId', 'description'],
    writableFields: ['regionId', 'description'],
    createRequired: ['regionId'],
  }),
  def({
    slug: 'state-lookup',
    title: 'State Lookup',
    prismaModel: 'stateLookup',
    lookupTable: 'state_lookup',
    idField: 'stateId',
    searchFields: ['stateId', 'stateAbbrev', 'description'],
    writableFields: ['stateId', 'stateAbbrev', 'description'],
    createRequired: ['stateId', 'stateAbbrev'],
  }),
  def({
    slug: 'claim-filing-indicators',
    title: 'Claim Filing Indicators',
    prismaModel: '',
    lookupTable: '',
    storage: 'config',
    readOnly: true,
    searchFields: ['code', 'description'],
    writableFields: [],
    createRequired: [],
  }),
];
