import {
  domainOps,
  domainSupportsOp,
  ReferenceDomainDefinition,
  ReferenceOperation,
} from './reference-domain.types';
import { WAVE_A_DOMAIN_DEFINITIONS } from './wave-a.domains';
import { WAVE_B_DOMAIN_DEFINITIONS } from './wave-b.domains';
import { WAVE_C_DOMAIN_DEFINITIONS } from './wave-c.domains';

export type { ReferenceOperation, ActiveFilterField, ReferenceDomainDefinition } from './reference-domain.types';
export { domainOps, domainSupportsOp } from './reference-domain.types';

/** @deprecated Use ReferenceDomainDefinition */
export type WaveADomainDefinition = ReferenceDomainDefinition;

const ALL_DEFINITIONS: ReferenceDomainDefinition[] = [
  ...WAVE_A_DOMAIN_DEFINITIONS,
  ...WAVE_B_DOMAIN_DEFINITIONS,
  ...WAVE_C_DOMAIN_DEFINITIONS,
];

const DOMAIN_BY_SLUG = new Map(ALL_DEFINITIONS.map((d) => [d.slug, d]));

export function getReferenceDomain(slug: string): ReferenceDomainDefinition | undefined {
  return DOMAIN_BY_SLUG.get(slug);
}

export function listReferenceDomainSummaries(): Array<{
  slug: string;
  title: string;
  ops: ReferenceOperation[];
}> {
  return ALL_DEFINITIONS.map((d) => ({
    slug: d.slug,
    title: d.title,
    ops: domainOps(d),
  }));
}

export function isJsonStorageDomain(def: ReferenceDomainDefinition): boolean {
  return def.storage === 'json';
}

export function isConfigStorageDomain(def: ReferenceDomainDefinition): boolean {
  return def.storage === 'config';
}
