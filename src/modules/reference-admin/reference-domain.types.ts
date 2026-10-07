export type ReferenceOperation =
  | 'list'
  | 'show'
  | 'create'
  | 'update'
  | 'destroy'
  | 'toggle_active';

export type ActiveFilterField = 'isActive' | 'active';

export type ReferenceStorage = 'prisma' | 'json' | 'config';

export type ReferenceDomainDefinition = {
  slug: string;
  title: string;
  /** Prisma client delegate key (camelCase); empty for JSON-backed domains. */
  prismaModel: string;
  lookupTable: string;
  /** Primary key field on the Prisma model (default `id`). */
  idField?: string;
  /** Extra lookup meta keys to invalidate after mutations (Laravel rebuild paths). */
  extraLookupTables?: string[];
  storage?: ReferenceStorage;
  readOnly?: boolean;
  hasToggle?: boolean;
  activeFilter?: ActiveFilterField;
  searchFields: string[];
  writableFields: string[];
  createRequired: string[];
  /** When set, replaces default domainOps output (e.g. omit create while allowing update). */
  ops?: ReferenceOperation[];
};

export function domainOps(def: ReferenceDomainDefinition): ReferenceOperation[] {
  if (def.ops) {
    return def.ops;
  }
  const ops: ReferenceOperation[] = ['list', 'show'];
  if (!def.readOnly) {
    ops.push('create', 'update', 'destroy');
  }
  if (def.hasToggle) {
    ops.push('toggle_active');
  }
  return ops;
}

export function domainSupportsOp(
  def: ReferenceDomainDefinition,
  op: ReferenceOperation,
): boolean {
  return domainOps(def).includes(op);
}
