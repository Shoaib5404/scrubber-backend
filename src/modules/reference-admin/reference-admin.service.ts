import {
  BadRequestException,
  ConflictException,
  Injectable,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LookupCacheService } from '../cache/lookup-cache.service';
import { toCamelCaseRecord, toSnakeCase } from './snake.util';
import {
  domainSupportsOp,
  getWaveADomain,
  listWaveADomainSummaries,
  ReferenceOperation,
  WaveADomainDefinition,
} from './wave-a.domains';

type PrismaRecord = Record<string, unknown>;

type PaginatedListParams = {
  page: number;
  perPage: number;
  search?: string;
  isActive?: string;
};

type PrismaDelegate = {
  findMany: (args: unknown) => Promise<PrismaRecord[]>;
  findUnique: (args: unknown) => Promise<PrismaRecord | null>;
  create: (args: unknown) => Promise<PrismaRecord>;
  update: (args: unknown) => Promise<PrismaRecord>;
  delete: (args: unknown) => Promise<PrismaRecord>;
  count: (args: unknown) => Promise<number>;
};

const DATE_FIELD_SUFFIXES = ['Date', 'Dt', 'Effdt', 'Deldt'] as const;

@Injectable()
export class ReferenceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupCache: LookupCacheService,
  ) {}

  listDomains() {
    return listWaveADomainSummaries();
  }

  async listDomain(slug: string, params: PaginatedListParams) {
    const def = this.requireDomain(slug);
    this.assertOp(def, 'list');

    const page = Math.max(1, params.page);
    const perPage = Math.min(100, Math.max(1, params.perPage));
    const skip = (page - 1) * perPage;

    const where = this.buildListWhere(def, params.search, params.isActive);
    const delegate = this.delegate(def);

    const [rows, total] = await Promise.all([
      delegate.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { id: 'desc' },
        ...(def.slug === 'icd10-codes'
          ? { include: { descriptions: { orderBy: { id: 'asc' } } } }
          : {}),
      }),
      delegate.count({ where }),
    ]);

    const lastPage = Math.max(1, Math.ceil(total / perPage));

    return {
      items: rows.map((row) => toSnakeCase(row)),
      meta: {
        page,
        per_page: perPage,
        total,
        last_page: lastPage,
      },
    };
  }

  async showDomain(slug: string, id: number) {
    const def = this.requireDomain(slug);
    this.assertOp(def, 'show');

    const row = await this.delegate(def).findUnique({
      where: { id },
      ...(def.slug === 'icd10-codes'
        ? { include: { descriptions: { orderBy: { id: 'asc' } } } }
        : {}),
    });
    if (!row) {
      throw new NotFoundException('Reference record not found.');
    }
    return toSnakeCase(row);
  }

  async createDomain(slug: string, body: Record<string, unknown>) {
    const def = this.requireDomain(slug);
    this.assertWritable(def, 'create');

    const data = this.buildWritePayload(def, body, { mode: 'create' });
    try {
      const created = await this.delegate(def).create({ data });
      await this.invalidateAfterMutation(def);
      return toSnakeCase(created);
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async updateDomain(slug: string, id: number, body: Record<string, unknown>) {
    const def = this.requireDomain(slug);
    this.assertWritable(def, 'update');

    await this.ensureExists(def, id);
    const data = this.buildWritePayload(def, body, { mode: 'update' });
    try {
      const updated = await this.delegate(def).update({ where: { id }, data });
      await this.invalidateAfterMutation(def);
      return toSnakeCase(updated);
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async destroyDomain(slug: string, id: number) {
    const def = this.requireDomain(slug);
    this.assertWritable(def, 'destroy');

    await this.ensureExists(def, id);
    try {
      await this.delegate(def).delete({ where: { id } });
      await this.invalidateAfterMutation(def);
      return { id };
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async toggleActiveDomain(slug: string, id: number) {
    const def = this.requireDomain(slug);
    if (!def.hasToggle || !def.activeFilter) {
      throw new NotFoundException('Toggle is not available for this domain.');
    }
    this.assertOp(def, 'toggle_active');

    const existing = await this.ensureExists(def, id);
    const field = def.activeFilter;
    const current = Boolean(existing[field]);
    const updated = await this.delegate(def).update({
      where: { id },
      data: { [field]: !current },
    });
    await this.invalidateAfterMutation(def);
    return toSnakeCase(updated);
  }

  private requireDomain(slug: string): WaveADomainDefinition {
    const def = getWaveADomain(slug);
    if (!def) {
      throw new NotFoundException('Unknown reference domain.');
    }
    return def;
  }

  private assertOp(def: WaveADomainDefinition, op: ReferenceOperation): void {
    if (!domainSupportsOp(def, op)) {
      throw new MethodNotAllowedException(`Operation not allowed for ${def.slug}.`);
    }
  }

  private assertWritable(def: WaveADomainDefinition, op: ReferenceOperation): void {
    if (def.readOnly) {
      throw new MethodNotAllowedException(`${def.title} is read-only.`);
    }
    this.assertOp(def, op);
  }

  private delegate(def: WaveADomainDefinition): PrismaDelegate {
    const client = this.prisma as unknown as Record<string, PrismaDelegate>;
    const model = client[def.prismaModel];
    if (!model) {
      throw new NotFoundException(`Prisma model ${def.prismaModel} is not configured.`);
    }
    return model;
  }

  private async ensureExists(def: WaveADomainDefinition, id: number): Promise<PrismaRecord> {
    const row = await this.delegate(def).findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Reference record not found.');
    }
    return row;
  }

  private buildListWhere(
    def: WaveADomainDefinition,
    search?: string,
    isActiveRaw?: string,
  ): PrismaRecord {
    const and: PrismaRecord[] = [];

    const needle = search?.trim();
    if (needle) {
      and.push({
        OR: def.searchFields.map((field) => ({
          [field]: { contains: needle, mode: 'insensitive' },
        })),
      });
    }

    if (def.activeFilter && isActiveRaw !== undefined && isActiveRaw !== '') {
      const wantActive = this.parseBooleanQuery(isActiveRaw);
      if (wantActive === null) {
        throw new BadRequestException('is_active must be 0, 1, true, or false.');
      }
      and.push({ [def.activeFilter]: wantActive });
    }

    if (and.length === 0) {
      return {};
    }
    if (and.length === 1) {
      return and[0]!;
    }
    return { AND: and };
  }

  private parseBooleanQuery(raw: string): boolean | null {
    const normalized = raw.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') {
      return true;
    }
    if (normalized === '0' || normalized === 'false') {
      return false;
    }
    return null;
  }

  private buildWritePayload(
    def: WaveADomainDefinition,
    body: Record<string, unknown>,
    opts: { mode: 'create' | 'update' },
  ): PrismaRecord {
    const camel = toCamelCaseRecord(body);
    const data: PrismaRecord = {};

    for (const field of def.writableFields) {
      if (!(field in camel)) {
        continue;
      }
      data[field] = this.coerceField(field, camel[field]);
    }

    if (opts.mode === 'create') {
      for (const required of def.createRequired) {
        const value = data[required];
        if (value === undefined || value === null || value === '') {
          throw new BadRequestException(`${required} is required.`);
        }
      }
    }

    if (Object.keys(data).length === 0 && opts.mode === 'update') {
      throw new BadRequestException('No valid fields to update.');
    }

    return data;
  }

  private coerceField(field: string, value: unknown): unknown {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (field === 'isActive' || field === 'active' || field === 'isDeleted' || field === 'indicator' || field === 'inExistencePriorTo1996' || field === 'isAllowed') {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = this.parseBooleanQuery(value);
        if (parsed !== null) {
          return parsed;
        }
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
    }

    if (
      field === 'lowLimit' ||
      field === 'highLimit' ||
      field === 'upperLimit' ||
      field === 'days' ||
      field === 'modifier' ||
      field === 'claimType' ||
      field === 'aocEditType' ||
      field === 'componentCount' ||
      field === 'sequenceOrder' ||
      field === 'descriptionType'
    ) {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const num = Number(value);
        if (Number.isFinite(num)) {
          return num;
        }
      }
    }

    if (field === 'unit') {
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        return Number(value);
      }
    }

    if (field === 'rate') {
      if (typeof value === 'number' || typeof value === 'string') {
        return new Prisma.Decimal(value);
      }
    }

    if (this.isDateField(field) && (typeof value === 'string' || value instanceof Date)) {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException(`Invalid date for ${field}.`);
      }
      return date;
    }

    return value;
  }

  private isDateField(field: string): boolean {
    if (field.endsWith('Date')) {
      return true;
    }
    return DATE_FIELD_SUFFIXES.some((suffix) => field.endsWith(suffix));
  }

  private async invalidateAfterMutation(def: WaveADomainDefinition): Promise<void> {
    const tables = [def.lookupTable, ...(def.extraLookupTables ?? [])];
    for (const table of tables) {
      await this.lookupCache.invalidateTable(table);
    }
  }

  private mapPrismaError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException('A record with the same unique key already exists.');
      }
      if (error.code === 'P2025') {
        return new NotFoundException('Reference record not found.');
      }
    }
    if (error instanceof Error) {
      return error;
    }
    return new BadRequestException('Unable to persist reference record.');
  }
}
