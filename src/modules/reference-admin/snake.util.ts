import { Decimal } from '@prisma/client/runtime/library';

function snakeCaseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase();
}

function camelCaseKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function serializeLeaf(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value instanceof Decimal) {
    return value.toString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function toSnakeCase(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSnakeCase(item));
  }
  if (value instanceof Date || value instanceof Decimal || typeof value !== 'object') {
    return serializeLeaf(value);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    out[snakeCaseKey(key)] = toSnakeCase(nested);
  }
  return out;
}

export function toCamelCaseRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[camelCaseKey(key)] = value;
  }
  return out;
}
