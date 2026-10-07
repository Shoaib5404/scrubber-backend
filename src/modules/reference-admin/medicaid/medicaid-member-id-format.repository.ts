import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

type FlatRecord = {
  id: string;
  payer_name: string;
  direct_indirect: string | null;
  rt_payer_id: string | null;
  member_id_format: string;
  length: number | null;
  format_type: string | null;
  pattern: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ByPayerPayload = {
  meta: { updated_at: string | null };
  by_payer_id: Record<
    string,
    {
      payer_name: string;
      formats: Array<Record<string, unknown>>;
    }
  >;
};

@Injectable()
export class MedicaidMemberIdFormatRepository {
  private readonly filePath: string;

  constructor() {
    const configured = process.env.MEDICAID_MEMBER_ID_FORMATS_PATH?.trim();
    this.filePath = configured
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'storage/data/medicaid-member-id-formats.json');
  }

  async listPage(params: {
    page: number;
    perPage: number;
    search?: string;
    isActive?: string;
  }): Promise<{ items: FlatRecord[]; total: number }> {
    const all = await this.allFlat();
    const filtered = all.filter((record) => this.matchesListFilters(record, params));
    filtered.sort((a, b) => a.payer_name.localeCompare(b.payer_name));
    const total = filtered.length;
    const skip = (params.page - 1) * params.perPage;
    const items = filtered.slice(skip, skip + params.perPage);
    return { items, total };
  }

  async findOrFail(id: string): Promise<FlatRecord> {
    const record = await this.find(id);
    if (!record) {
      throw new NotFoundException('Reference record not found.');
    }
    return record;
  }

  async create(data: Record<string, unknown>): Promise<FlatRecord> {
    const now = new Date().toISOString();
    const flat = this.normalizeFlatRecord({
      ...data,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
    });
    await this.assertUnique(flat);

    const payerKey = this.payerKeyFromRecord(flat);
    if (payerKey === '') {
      throw new ConflictException('RT payer ID is required.');
    }

    const payload = await this.read();
    if (!payload.by_payer_id[payerKey]) {
      payload.by_payer_id[payerKey] = { payer_name: flat.payer_name, formats: [] };
    } else {
      payload.by_payer_id[payerKey].payer_name = flat.payer_name;
    }
    payload.by_payer_id[payerKey].formats.push(this.flatToFormat(flat));
    await this.write(payload);
    return flat;
  }

  async update(id: string, data: Record<string, unknown>): Promise<FlatRecord> {
    const payload = await this.read();
    const located = this.locateFormat(payload, id);
    if (!located) {
      throw new NotFoundException('Reference record not found.');
    }

    const [oldPayerKey, formatIndex, existingFlat] = located;
    const merged = this.normalizeFlatRecord({
      ...existingFlat,
      ...data,
      id,
      created_at: existingFlat.created_at,
      updated_at: new Date().toISOString(),
    });
    await this.assertUnique(merged, id);

    const newPayerKey = this.payerKeyFromRecord(merged);
    if (newPayerKey === '') {
      throw new ConflictException('RT payer ID is required.');
    }

    payload.by_payer_id[oldPayerKey].formats.splice(formatIndex, 1);
    if (payload.by_payer_id[oldPayerKey].formats.length === 0) {
      delete payload.by_payer_id[oldPayerKey];
    }

    if (!payload.by_payer_id[newPayerKey]) {
      payload.by_payer_id[newPayerKey] = { payer_name: merged.payer_name, formats: [] };
    } else {
      payload.by_payer_id[newPayerKey].payer_name = merged.payer_name;
    }
    payload.by_payer_id[newPayerKey].formats.push(this.flatToFormat(merged));
    await this.write(payload);
    return merged;
  }

  async delete(id: string): Promise<void> {
    const payload = await this.read();
    const located = this.locateFormat(payload, id);
    if (!located) {
      throw new NotFoundException('Reference record not found.');
    }
    const [payerKey, formatIndex] = located;
    payload.by_payer_id[payerKey].formats.splice(formatIndex, 1);
    if (payload.by_payer_id[payerKey].formats.length === 0) {
      delete payload.by_payer_id[payerKey];
    }
    await this.write(payload);
  }

  async toggleActive(id: string): Promise<FlatRecord> {
    const record = await this.findOrFail(id);
    return this.update(id, { is_active: !record.is_active });
  }

  async count(): Promise<number> {
    return (await this.allFlat()).length;
  }

  /**
   * Laravel MedicaidMemberIdFormatRepository::replaceAll — rebuilds the entire by_payer_id
   * store from import rows, skipping rows with an empty rt_payer_id, and writes the JSON file.
   */
  async replaceAll(records: Array<Record<string, unknown>>): Promise<number> {
    const now = new Date().toISOString();
    const byPayerId: ByPayerPayload['by_payer_id'] = {};

    for (const record of records) {
      const flat = this.normalizeFlatRecord({
        ...record,
        id: String(record.id ?? randomUUID()),
        created_at: record.created_at ?? now,
        updated_at: now,
      });

      const payerKey = this.payerKeyFromRecord(flat);
      if (payerKey === '') {
        continue;
      }

      if (!byPayerId[payerKey]) {
        byPayerId[payerKey] = { payer_name: flat.payer_name, formats: [] };
      } else {
        byPayerId[payerKey].payer_name = flat.payer_name;
      }
      byPayerId[payerKey].formats.push(this.flatToFormat(flat));
    }

    await this.write({ meta: { updated_at: now }, by_payer_id: byPayerId });

    return this.countFormats(byPayerId);
  }

  flatRecordToApi(record: FlatRecord): Record<string, unknown> {
    return { ...record };
  }

  camelInputToFlat(data: Record<string, unknown>): Record<string, unknown> {
    return {
      payer_name: data.payerName,
      direct_indirect: data.directIndirect,
      rt_payer_id: data.rtPayerId,
      member_id_format: data.memberIdFormat,
      length: data.length,
      format_type: data.formatType,
      pattern: data.pattern,
      is_active: data.isActive,
    };
  }

  private matchesListFilters(
    record: FlatRecord,
    params: { search?: string; isActive?: string },
  ): boolean {
    const needle = params.search?.trim().toLowerCase();
    if (needle) {
      const haystack = [
        record.payer_name,
        record.rt_payer_id ?? '',
        record.member_id_format,
        record.format_type ?? '',
        record.pattern ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }

    if (params.isActive !== undefined && params.isActive !== '') {
      const want = this.parseBooleanQuery(params.isActive);
      if (want === null) {
        return true;
      }
      if (record.is_active !== want) {
        return false;
      }
    }

    return true;
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

  private async allFlat(): Promise<FlatRecord[]> {
    return this.flattenRecords(await this.read());
  }

  private async find(id: string): Promise<FlatRecord | null> {
    for (const record of await this.allFlat()) {
      if (record.id === id) {
        return record;
      }
    }
    return null;
  }

  private async read(): Promise<ByPayerPayload> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const decoded = JSON.parse(raw) as Record<string, unknown>;
      if (!decoded || typeof decoded !== 'object') {
        throw new Error('invalid');
      }
      const meta =
        decoded.meta && typeof decoded.meta === 'object'
          ? (decoded.meta as { updated_at: string | null })
          : { updated_at: null };

      if (decoded.by_payer_id && typeof decoded.by_payer_id === 'object') {
        return {
          meta,
          by_payer_id: this.normalizeByPayerId(
            decoded.by_payer_id as ByPayerPayload['by_payer_id'],
          ),
        };
      }

      if (Array.isArray(decoded.records)) {
        return {
          meta,
          by_payer_id: this.legacyRecordsToByPayerId(decoded.records as Record<string, unknown>[]),
        };
      }

      return { meta, by_payer_id: {} };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { meta: { updated_at: null }, by_payer_id: {} };
      }
      throw e;
    }
  }

  private async write(payload: ByPayerPayload): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const byPayerId = this.normalizeByPayerId(payload.by_payer_id);
    const keys = Object.keys(byPayerId).sort();
    const sorted: ByPayerPayload['by_payer_id'] = {};
    for (const key of keys) {
      sorted[key] = byPayerId[key]!;
    }
    const encoded = JSON.stringify(
      {
        meta: { updated_at: new Date().toISOString() },
        by_payer_id: sorted,
      },
      null,
      2,
    );
    await fs.writeFile(this.filePath, encoded, 'utf8');
  }

  private flattenRecords(payload: ByPayerPayload): FlatRecord[] {
    const flat: FlatRecord[] = [];
    for (const [payerKey, group] of Object.entries(payload.by_payer_id)) {
      for (const format of group.formats) {
        flat.push(this.formatToFlatRecord(payerKey, group.payer_name, format));
      }
    }
    return flat;
  }

  private formatToFlatRecord(
    payerKey: string,
    payerName: string,
    format: Record<string, unknown>,
  ): FlatRecord {
    return {
      id: String(format.id ?? ''),
      payer_name: payerName,
      direct_indirect: (format.direct_indirect as string | null) ?? null,
      rt_payer_id: payerKey,
      member_id_format: String(format.member_id_format ?? ''),
      length: format.length === null || format.length === undefined ? null : Number(format.length),
      format_type: (format.format_type as string | null) ?? null,
      pattern: (format.pattern as string | null) ?? null,
      is_active: Boolean(format.is_active ?? true),
      created_at: String(format.created_at ?? ''),
      updated_at: String(format.updated_at ?? ''),
    };
  }

  private flatToFormat(flat: FlatRecord): Record<string, unknown> {
    return {
      id: flat.id,
      direct_indirect: flat.direct_indirect,
      member_id_format: flat.member_id_format,
      length: flat.length,
      format_type: flat.format_type,
      pattern: flat.pattern,
      is_active: flat.is_active,
      created_at: flat.created_at,
      updated_at: flat.updated_at,
    };
  }

  private normalizeFlatRecord(record: Record<string, unknown>): FlatRecord {
    let lengthVal = record.length;
    if (lengthVal === '' || lengthVal === null || lengthVal === undefined) {
      lengthVal = null;
    } else if (typeof lengthVal === 'string' || typeof lengthVal === 'number') {
      lengthVal = Number(lengthVal);
      if (!Number.isFinite(lengthVal)) {
        lengthVal = null;
      }
    }

    const now = new Date().toISOString();
    return {
      id: String(record.id ?? randomUUID()),
      payer_name: String(record.payer_name ?? '')
        .trim()
        .toUpperCase(),
      direct_indirect: this.nullableString(record.direct_indirect),
      rt_payer_id: this.nullableString(record.rt_payer_id),
      member_id_format: String(record.member_id_format ?? '')
        .trim()
        .toUpperCase(),
      length: lengthVal as number | null,
      format_type: this.nullableString(record.format_type),
      pattern: this.nullableString(record.pattern),
      is_active: Boolean(record.is_active ?? true),
      created_at: String(record.created_at ?? now),
      updated_at: String(record.updated_at ?? now),
    };
  }

  private normalizeByPayerId(
    byPayerId: ByPayerPayload['by_payer_id'],
  ): ByPayerPayload['by_payer_id'] {
    const normalized: ByPayerPayload['by_payer_id'] = {};
    for (const [payerKey, group] of Object.entries(byPayerId)) {
      const key = String(payerKey).trim();
      if (key === '' || !group) {
        continue;
      }
      const formats: Array<Record<string, unknown>> = [];
      for (const format of group.formats ?? []) {
        if (format && typeof format === 'object') {
          formats.push(this.flatToFormat(this.formatToFlatRecord(key, group.payer_name, format)));
        }
      }
      normalized[key] = {
        payer_name: String(group.payer_name ?? '')
          .trim()
          .toUpperCase(),
        formats,
      };
    }
    return normalized;
  }

  private legacyRecordsToByPayerId(
    records: Record<string, unknown>[],
  ): ByPayerPayload['by_payer_id'] {
    const byPayerId: ByPayerPayload['by_payer_id'] = {};
    for (const record of records) {
      const flat = this.normalizeFlatRecord(record);
      const payerKey = this.payerKeyFromRecord(flat);
      if (payerKey === '') {
        continue;
      }
      if (!byPayerId[payerKey]) {
        byPayerId[payerKey] = { payer_name: flat.payer_name, formats: [] };
      }
      byPayerId[payerKey].formats.push(this.flatToFormat(flat));
    }
    return byPayerId;
  }

  private locateFormat(
    payload: ByPayerPayload,
    id: string,
  ): [string, number, FlatRecord] | null {
    for (const [payerKey, group] of Object.entries(payload.by_payer_id)) {
      for (let index = 0; index < group.formats.length; index++) {
        const format = group.formats[index]!;
        if (String(format.id ?? '') !== id) {
          continue;
        }
        return [
          payerKey,
          index,
          this.formatToFlatRecord(payerKey, group.payer_name, format),
        ];
      }
    }
    return null;
  }

  private async assertUnique(flat: FlatRecord, ignoreId?: string): Promise<void> {
    for (const existing of await this.allFlat()) {
      if (ignoreId !== undefined && existing.id === ignoreId) {
        continue;
      }
      if (
        existing.payer_name === flat.payer_name &&
        (existing.rt_payer_id ?? '') === (flat.rt_payer_id ?? '') &&
        existing.member_id_format === flat.member_id_format
      ) {
        throw new ConflictException(
          `Duplicate record for payer ${flat.payer_name}, RT payer ID ${flat.rt_payer_id ?? '-'}, member ID format ${flat.member_id_format}.`,
        );
      }
    }
  }

  private payerKeyFromRecord(record: FlatRecord): string {
    return String(record.rt_payer_id ?? '').trim();
  }

  private countFormats(byPayerId: ByPayerPayload['by_payer_id']): number {
    let count = 0;
    for (const group of Object.values(byPayerId)) {
      count += group.formats.length;
    }
    return count;
  }

  private nullableString(value: unknown): string | null {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  }
}
