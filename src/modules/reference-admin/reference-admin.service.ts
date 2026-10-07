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
import { CLAIM_FILING_INDICATORS } from '../claim-validation/config/claim-filing-indicators';
import {
  domainSupportsOp,
  getReferenceDomain,
  isConfigStorageDomain,
  isJsonStorageDomain,
  listReferenceDomainSummaries,
  ReferenceDomainDefinition,
  ReferenceOperation,
} from './domains.registry';
import { MedicaidMemberIdFormatRepository } from './medicaid/medicaid-member-id-format.repository';
import { normalizeNdcFromImport } from './ndc.util';
import { toCamelCaseRecord, toSnakeCase } from './snake.util';

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
    private readonly medicaidFormats: MedicaidMemberIdFormatRepository,
  ) {}

  listDomains() {
    return listReferenceDomainSummaries();
  }

  async listDomain(slug: string, params: PaginatedListParams) {
    const def = this.requireDomain(slug);
    this.assertOp(def, 'list');

    if (isJsonStorageDomain(def)) {
      return this.listMedicaidDomain(params);
    }

    if (isConfigStorageDomain(def)) {
      return this.listConfigDomain(def, params);
    }

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
        orderBy: { [def.idField ?? 'id']: 'desc' },
        ...(def.slug === 'icd10-codes'
          ? { include: { descriptions: { orderBy: { id: 'asc' } } } }
          : {}),
      }),
      delegate.count({ where }),
    ]);

    const lastPage = Math.max(1, Math.ceil(total / perPage));

    return {
      items: rows.map((row) => this.serializeReferenceRow(def, row)),
      meta: {
        page,
        per_page: perPage,
        total,
        last_page: lastPage,
      },
    };
  }

  async showDomain(slug: string, id: string) {
    const def = this.requireDomain(slug);
    this.assertOp(def, 'show');

    if (isJsonStorageDomain(def)) {
      const record = await this.medicaidFormats.findOrFail(id);
      return this.medicaidFormats.flatRecordToApi(record);
    }

    if (isConfigStorageDomain(def)) {
      return this.showConfigDomain(def, id);
    }

    const routeId = this.parseRouteId(def, id);
    const row = await this.delegate(def).findUnique({
      where: this.whereForRouteId(def, routeId),
      ...(def.slug === 'icd10-codes'
        ? { include: { descriptions: { orderBy: { id: 'asc' } } } }
        : {}),
    });
    if (!row) {
      throw new NotFoundException('Reference record not found.');
    }
    return this.serializeReferenceRow(def, row);
  }

  async createDomain(slug: string, body: Record<string, unknown>) {
    const def = this.requireDomain(slug);
    this.assertWritable(def, 'create');

    if (isJsonStorageDomain(def)) {
      const data = this.buildMedicaidWritePayload(def, body, 'create');
      const created = await this.medicaidFormats.create(data);
      return this.medicaidFormats.flatRecordToApi(created);
    }

    const data = this.buildWritePayload(def, body, { mode: 'create' });
    try {
      const created = await this.delegate(def).create({ data });
      await this.invalidateAfterMutation(def);
      return this.serializeReferenceRow(def, created);
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async updateDomain(slug: string, id: string, body: Record<string, unknown>) {
    const def = this.requireDomain(slug);
    this.assertWritable(def, 'update');

    if (isJsonStorageDomain(def)) {
      await this.medicaidFormats.findOrFail(id);
      const data = this.buildMedicaidWritePayload(def, body, 'update');
      const updated = await this.medicaidFormats.update(id, data);
      return this.medicaidFormats.flatRecordToApi(updated);
    }

    const routeId = this.parseRouteId(def, id);
    await this.ensureExists(def, routeId);
    const data = this.buildWritePayload(def, body, { mode: 'update' });
    try {
      const updated = await this.delegate(def).update({
        where: this.whereForRouteId(def, routeId),
        data,
      });
      await this.invalidateAfterMutation(def);
      return this.serializeReferenceRow(def, updated);
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async destroyDomain(slug: string, id: string) {
    const def = this.requireDomain(slug);
    this.assertWritable(def, 'destroy');

    if (isJsonStorageDomain(def)) {
      await this.medicaidFormats.findOrFail(id);
      await this.medicaidFormats.delete(id);
      return { id };
    }

    const routeId = this.parseRouteId(def, id);
    await this.ensureExists(def, routeId);
    try {
      await this.delegate(def).delete({ where: this.whereForRouteId(def, routeId) });
      await this.invalidateAfterMutation(def);
      return { id: routeId };
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async toggleActiveDomain(slug: string, id: string) {
    const def = this.requireDomain(slug);
    if (!def.hasToggle || !def.activeFilter) {
      throw new NotFoundException('Toggle is not available for this domain.');
    }
    this.assertOp(def, 'toggle_active');

    if (isJsonStorageDomain(def)) {
      const updated = await this.medicaidFormats.toggleActive(id);
      return this.medicaidFormats.flatRecordToApi(updated);
    }

    const routeId = this.parseRouteId(def, id);
    const existing = await this.ensureExists(def, routeId);
    const field = def.activeFilter;
    const current = Boolean(existing[field]);
    const updated = await this.delegate(def).update({
      where: this.whereForRouteId(def, routeId),
      data: { [field]: !current },
    });
    await this.invalidateAfterMutation(def);
    return this.serializeReferenceRow(def, updated);
  }

  private async listMedicaidDomain(params: PaginatedListParams) {
    const page = Math.max(1, params.page);
    const perPage = Math.min(100, Math.max(1, params.perPage));
    if (params.isActive !== undefined && params.isActive !== '') {
      const parsed = this.parseBooleanQuery(params.isActive);
      if (parsed === null) {
        throw new BadRequestException('is_active must be 0, 1, true, or false.');
      }
    }
    const { items, total } = await this.medicaidFormats.listPage({
      page,
      perPage,
      search: params.search,
      isActive: params.isActive,
    });
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    return {
      items: items.map((row) => this.medicaidFormats.flatRecordToApi(row)),
      meta: {
        page,
        per_page: perPage,
        total,
        last_page: lastPage,
      },
    };
  }

  private buildMedicaidWritePayload(
    def: ReferenceDomainDefinition,
    body: Record<string, unknown>,
    mode: 'create' | 'update',
  ): Record<string, unknown> {
    const camel = toCamelCaseRecord(body);
    const data: Record<string, unknown> = {};

    for (const field of def.writableFields) {
      if (!(field in camel)) {
        continue;
      }
      data[field] = this.coerceField(field, camel[field]);
    }

    const flatInput = this.medicaidFormats.camelInputToFlat(data);

    if (mode === 'create') {
      for (const required of def.createRequired) {
        const value = data[required];
        if (value === undefined || value === null || value === '') {
          throw new BadRequestException(`${required} is required.`);
        }
      }
    }

    if (mode === 'update' && Object.keys(flatInput).length === 0) {
      throw new BadRequestException('No valid fields to update.');
    }

    return flatInput;
  }

  private parsePrismaId(id: string): number {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new BadRequestException('Invalid numeric id.');
    }
    return numericId;
  }

  private parseRouteId(def: ReferenceDomainDefinition, id: string): number | string {
    if (isConfigStorageDomain(def) || isJsonStorageDomain(def)) {
      return id;
    }
    return this.parsePrismaId(id);
  }

  private whereForRouteId(
    def: ReferenceDomainDefinition,
    routeId: number | string,
  ): PrismaRecord {
    const idField = def.idField ?? 'id';
    return { [idField]: routeId };
  }

  private serializeReferenceRow(
    def: ReferenceDomainDefinition,
    row: PrismaRecord,
  ): Record<string, unknown> {
    const snake = toSnakeCase(row) as Record<string, unknown>;
    const idField = def.idField ?? 'id';
    if (idField !== 'id') {
      const pk = row[idField];
      if (pk !== undefined && pk !== null) {
        snake.id = pk;
      }
    }
    return snake;
  }

  private listConfigDomain(def: ReferenceDomainDefinition, params: PaginatedListParams) {
    if (def.slug === 'claim-filing-indicators') {
      return this.listClaimFilingIndicators(params);
    }
    throw new NotFoundException('Config reference domain is not configured.');
  }

  private showConfigDomain(def: ReferenceDomainDefinition, id: string) {
    if (def.slug === 'claim-filing-indicators') {
      const description = CLAIM_FILING_INDICATORS[id];
      if (description === undefined) {
        throw new NotFoundException('Reference record not found.');
      }
      return { id, code: id, description };
    }
    throw new NotFoundException('Config reference domain is not configured.');
  }

  private listClaimFilingIndicators(params: PaginatedListParams) {
    const page = Math.max(1, params.page);
    const perPage = Math.min(100, Math.max(1, params.perPage));
    const needle = params.search?.trim().toLowerCase();

    let items = Object.entries(CLAIM_FILING_INDICATORS).map(([code, description]) => ({
      id: code,
      code,
      description,
    }));

    if (needle) {
      items = items.filter(
        (row) =>
          row.code.toLowerCase().includes(needle) ||
          row.description.toLowerCase().includes(needle),
      );
    }

    const total = items.length;
    const skip = (page - 1) * perPage;
    const pageItems = items.slice(skip, skip + perPage);
    const lastPage = Math.max(1, Math.ceil(total / perPage));

    return {
      items: pageItems,
      meta: {
        page,
        per_page: perPage,
        total,
        last_page: lastPage,
      },
    };
  }

  private requireDomain(slug: string): ReferenceDomainDefinition {
    const def = getReferenceDomain(slug);
    if (!def) {
      throw new NotFoundException('Unknown reference domain.');
    }
    return def;
  }

  private assertOp(def: ReferenceDomainDefinition, op: ReferenceOperation): void {
    if (!domainSupportsOp(def, op)) {
      throw new MethodNotAllowedException(`Operation not allowed for ${def.slug}.`);
    }
  }

  private assertWritable(def: ReferenceDomainDefinition, op: ReferenceOperation): void {
    if (def.readOnly) {
      throw new MethodNotAllowedException(`${def.title} is read-only.`);
    }
    this.assertOp(def, op);
  }

  private delegate(def: ReferenceDomainDefinition): PrismaDelegate {
    const client = this.prisma as unknown as Record<string, PrismaDelegate>;
    const model = client[def.prismaModel];
    if (!model) {
      throw new NotFoundException(`Prisma model ${def.prismaModel} is not configured.`);
    }
    return model;
  }

  private async ensureExists(
    def: ReferenceDomainDefinition,
    routeId: number | string,
  ): Promise<PrismaRecord> {
    const row = await this.delegate(def).findUnique({
      where: this.whereForRouteId(def, routeId),
    });
    if (!row) {
      throw new NotFoundException('Reference record not found.');
    }
    return row;
  }

  private buildListWhere(
    def: ReferenceDomainDefinition,
    search?: string,
    isActiveRaw?: string,
  ): PrismaRecord {
    const and: PrismaRecord[] = [];

    const needle = search?.trim();
    if (needle) {
      and.push({
        OR: def.searchFields.map((field) => this.searchCondition(def, field, needle)),
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

  private searchCondition(
    def: ReferenceDomainDefinition,
    field: string,
    needle: string,
  ): PrismaRecord {
    const idField = def.idField ?? 'id';
    if (/^\d+$/.test(needle) && (field === idField || field.endsWith('Id'))) {
      return { [field]: Number(needle) };
    }
    return { [field]: { contains: needle, mode: 'insensitive' } };
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

  private applyNdcNormalization(
    def: ReferenceDomainDefinition,
    data: PrismaRecord,
    camel: Record<string, unknown>,
  ): void {
    if (def.slug !== 'ndc-codes') {
      return;
    }

    const rawNdc =
      typeof camel.ndc === 'string'
        ? camel.ndc
        : typeof data.ndc === 'string'
          ? data.ndc
          : null;

    if (rawNdc === null) {
      return;
    }

    const hasDigits =
      data.ndcDigits !== undefined &&
      data.ndcDigits !== null &&
      String(data.ndcDigits).trim() !== '';

    if (!hasDigits) {
      const normalized = normalizeNdcFromImport(rawNdc);
      if (normalized === null) {
        throw new BadRequestException(
          'Invalid NDC format. Use 00000-0000-00 or an 11-digit code.',
        );
      }
      data.ndc = normalized.ndc;
      data.ndcDigits = normalized.ndcDigits;
    } else if (typeof data.ndc === 'string') {
      const normalized = normalizeNdcFromImport(String(data.ndc));
      if (normalized !== null) {
        data.ndc = normalized.ndc;
      }
    }
  }

  private buildWritePayload(
    def: ReferenceDomainDefinition,
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

    this.applyNdcNormalization(def, data, camel);

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

    if (
      field === 'isActive' ||
      field === 'active' ||
      field === 'isDeleted' ||
      field === 'indicator' ||
      field === 'inExistencePriorTo1996' ||
      field === 'isAllowed'
    ) {
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
      field === 'descriptionType' ||
      field === 'min' ||
      field === 'max' ||
      field === 'packageItemCount' ||
      field === 'length' ||
      field === 'regionId' ||
      field === 'stateId'
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

    if (field === 'rate' || field === 'hcpcsAmount') {
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

  private async invalidateAfterMutation(def: ReferenceDomainDefinition): Promise<void> {
    if (!def.lookupTable) {
      return;
    }
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
