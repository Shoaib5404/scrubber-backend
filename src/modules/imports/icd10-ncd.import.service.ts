import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadExcelRows } from './import.utils';
import {
  expandIcdRange,
  isIcdRowMarkerToSkip,
  normalizeCode,
  parseCptListFromCell,
  parseIcd10NcdDate,
  parseResolution,
} from './icd10-ncd.import.helpers';
import { LookupSyncHelper } from './lookup-sync.helper';

export interface Icd10NcdImportOptions {
  /** Laravel --header-row: last header row number (1-based); data starts the next row. */
  headerRow?: number;
  /** ICD rows per ncd_icd insert batch (floored to a minimum of 50, matching the CLI option). */
  chunk?: number;
  /** Max codes to expand per hyphenated ICD range (e.g. A4150-A4153). */
  maxRange?: number;
  truncate?: boolean;
}

export interface Icd10NcdImportStats {
  rowsRead: number;
  icdInserted: number;
  cptInserted: number;
  skippedNoIcd: number;
  skippedNoCpt: number;
  descTruncated: number;
  icdCodesFromRanges: number;
  skippedIcdMarkers: number;
}

/** Carry-forward state across rows — Laravel ImportIcd10Ncd::handle $carry. */
interface CarryState {
  ncdNumber: string | null;
  ncdDescription: string | null;
  cptCodes: string[];
  cptEff: string | null;
  cptTerm: string | null;
}

/** ICD rows buffered since the last `@` section-break marker, for new-CPT replay. */
interface SectionIcdBufferEntry {
  icds: string[];
  resolution: number;
  eff: Date | null;
  term: Date | null;
}

/** Mutable batch container — mirrors the PHP by-reference `&$icdBatch` array. */
interface IcdBatchState {
  rows: Prisma.NcdIcdCreateManyInput[];
}

const DEFAULT_HEADER_ROW = 7;
const DEFAULT_CHUNK = 500;
const MIN_CHUNK = 50;
const DEFAULT_MAX_RANGE = 2000;
const NCD_NUMBER_MAX_LENGTH = 32;
const NCD_DESCRIPTION_MAX_LENGTH = 255;
const CODE_MAX_LENGTH = 20;

/**
 * Laravel App\Console\Commands\ImportIcd10Ncd (icd10-ncd:import).
 *
 * Carry-forward state machine: column A (NCD number) and B (description) persist across blank
 * rows; column C accumulates CPT/HCPCS codes for the current section (merging consecutive rows);
 * an ICD cell of only `@` characters (length >= 6) ends the current CPT section so the same
 * NCD+CPT combination later gets a distinct `ncd_cpt` row (`sectionId` increments). ICD rows
 * seen since the last section break are buffered (`sectionIcdBuffer`) and replayed — attached
 * only to the newly-introduced CPT(s) — when a later row in the same section adds new CPT codes
 * in column C. `ncd_cpt` rows are deduped in-memory via `cptIdByKey` keyed on
 * [sectionId, ncdNumber, description, cptCode].
 */
@Injectable()
export class Icd10NcdImportService {
  private readonly logger = new Logger(Icd10NcdImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupSync: LookupSyncHelper,
  ) {}

  async importFromFile(
    filePath: string,
    options: Icd10NcdImportOptions = {},
  ): Promise<Icd10NcdImportStats> {
    const headerRow = Math.max(1, options.headerRow ?? DEFAULT_HEADER_ROW);
    const chunkSize = Math.max(MIN_CHUNK, options.chunk ?? DEFAULT_CHUNK);
    const maxRange = Math.max(1, options.maxRange ?? DEFAULT_MAX_RANGE);

    if (options.truncate) {
      // Both tables in a single statement — Postgres requires any table referenced by a
      // foreign key (ncd_icd.ncd_cpt_id -> ncd_cpt.id) to be truncated together with it
      // (or via CASCADE). Listed child-first to match the Laravel truncate order.
      await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "ncd_icd", "ncd_cpt" RESTART IDENTITY');
    }

    const rows = await loadExcelRows(filePath);

    const stats: Icd10NcdImportStats = {
      rowsRead: 0,
      icdInserted: 0,
      cptInserted: 0,
      skippedNoIcd: 0,
      skippedNoCpt: 0,
      descTruncated: 0,
      icdCodesFromRanges: 0,
      skippedIcdMarkers: 0,
    };

    const carry: CarryState = {
      ncdNumber: null,
      ncdDescription: null,
      cptCodes: [],
      cptEff: null,
      cptTerm: null,
    };

    let sectionIcdBuffer: SectionIcdBufferEntry[] = [];
    const cptIdByKey = new Map<string, number>();
    let sectionId = 0;
    const batch: IcdBatchState = { rows: [] };
    let rangeWarningShown = false;

    // Laravel --header-row=N means data starts at 1-based row N+1; loadExcelRows() is
    // 0-indexed (rows[0] === spreadsheet row 1), so the 0-based data start index === headerRow.
    const dataRows = rows.slice(headerRow);

    for (const row of dataRows) {
      stats.rowsRead += 1;

      const a = row[0] ?? '';
      const b = row[1] ?? '';
      const c = row[2] ?? '';
      const d = row[3] ?? '';
      const e = row[4] ?? '';
      const f = row[5] ?? '';
      const g = row[6] ?? '';
      const h = row[7] ?? '';
      const i = row[8] ?? '';

      if (a !== '') {
        carry.ncdNumber = normalizeCode(a);
      }
      if (b !== '') {
        const desc = b.trim();
        if (desc !== '') {
          if (desc.length > NCD_DESCRIPTION_MAX_LENGTH) {
            stats.descTruncated += 1;
            carry.ncdDescription = desc.slice(0, NCD_DESCRIPTION_MAX_LENGTH);
          } else {
            carry.ncdDescription = desc;
          }
        }
      }

      const cptCodesBefore = [...carry.cptCodes];

      let rowIntroducedCpt = false;
      if (c !== '') {
        const parsedCpts = parseCptListFromCell(c);
        if (parsedCpts.length > 0) {
          rowIntroducedCpt = true;
          for (const pc of parsedCpts) {
            if (pc !== '' && !carry.cptCodes.includes(pc)) {
              carry.cptCodes.push(pc);
            }
          }
        }
        carry.cptEff = d !== '' ? d : null;
        carry.cptTerm = e !== '' ? e : null;
      } else {
        if (d !== '') {
          carry.cptEff = d;
        }
        if (e !== '') {
          carry.cptTerm = e;
        }
      }

      const newCptCodesThisRow = carry.cptCodes.filter((code) => !cptCodesBefore.includes(code));

      const fPlain = f.trim();
      if (fPlain !== '' && isIcdRowMarkerToSkip(fPlain)) {
        stats.skippedIcdMarkers += 1;
        sectionIcdBuffer = [];
        if (!rowIntroducedCpt) {
          carry.cptCodes = [];
          carry.cptEff = null;
          carry.cptTerm = null;
          sectionId += 1;
        }
        continue;
      }

      if (newCptCodesThisRow.length > 0) {
        await this.insertBufferedIcdsForNewCptsOnly(
          newCptCodesThisRow,
          sectionIcdBuffer,
          carry,
          sectionId,
          cptIdByKey,
          batch,
          chunkSize,
          stats,
        );
      }

      const icdCode = f !== '' ? normalizeCode(f) : null;
      if (icdCode === null || icdCode === '') {
        stats.skippedNoIcd += 1;
        continue;
      }

      const { codes: icdCodes, rangeExceeded } = expandIcdRange(icdCode, maxRange);
      if (rangeExceeded && !rangeWarningShown) {
        this.logger.warn(
          `At least one ICD range spans ${rangeExceeded.span} codes (max ${rangeExceeded.maxSpan}); ` +
            `those cells are stored as a single literal. Example: ${rangeExceeded.code}`,
        );
        rangeWarningShown = true;
      }
      if (icdCodes.length === 0) {
        stats.skippedNoIcd += 1;
        continue;
      }
      if (icdCodes.length > 1) {
        stats.icdCodesFromRanges += icdCodes.length - 1;
      }

      const cptList = [...carry.cptCodes];
      if (cptList.length === 0) {
        stats.skippedNoCpt += 1;
        continue;
      }

      const resolution = parseResolution(i);
      const icdEff = parseIcd10NcdDate(g);
      const icdTerm = parseIcd10NcdDate(h);

      sectionIcdBuffer.push({ icds: icdCodes, resolution, eff: icdEff, term: icdTerm });

      await this.insertExpandedIcdsForCptList(
        icdCodes,
        cptList,
        carry,
        sectionId,
        resolution,
        icdEff,
        icdTerm,
        cptIdByKey,
        batch,
        chunkSize,
        stats,
      );
    }

    await this.flushIcdBatch(batch, stats);

    await this.lookupSync.syncTables(['ncd_cpt', 'ncd_icd', 'ncd_denied_icd_pairs']);

    return stats;
  }

  /**
   * Laravel ImportIcd10Ncd::insertBufferedIcdsForNewCptsOnly — when a new CPT joins the
   * current section (consecutive row in column C), attach all ICD rows seen since the last
   * `@` marker to that CPT only (not the full current CPT list).
   */
  private async insertBufferedIcdsForNewCptsOnly(
    newCptCodesThisRow: string[],
    sectionIcdBuffer: SectionIcdBufferEntry[],
    carry: CarryState,
    sectionId: number,
    cptIdByKey: Map<string, number>,
    batch: IcdBatchState,
    chunkSize: number,
    stats: Icd10NcdImportStats,
  ): Promise<void> {
    for (const cptCode of newCptCodesThisRow) {
      if (cptCode === '') {
        continue;
      }
      for (const buffered of sectionIcdBuffer) {
        await this.insertExpandedIcdsForCptList(
          buffered.icds,
          [cptCode],
          carry,
          sectionId,
          buffered.resolution,
          buffered.eff,
          buffered.term,
          cptIdByKey,
          batch,
          chunkSize,
          stats,
        );
      }
    }
  }

  /** Laravel ImportIcd10Ncd::insertExpandedIcdsForCptList. */
  private async insertExpandedIcdsForCptList(
    icdCodes: string[],
    cptList: string[],
    carry: CarryState,
    sectionId: number,
    resolution: number,
    icdEff: Date | null,
    icdTerm: Date | null,
    cptIdByKey: Map<string, number>,
    batch: IcdBatchState,
    chunkSize: number,
    stats: Icd10NcdImportStats,
  ): Promise<void> {
    let ncdNum = carry.ncdNumber ?? '';
    if (ncdNum.length > NCD_NUMBER_MAX_LENGTH) {
      ncdNum = ncdNum.slice(0, NCD_NUMBER_MAX_LENGTH);
    }

    const cptEffDate = parseIcd10NcdDate(carry.cptEff);
    const cptTermDate = parseIcd10NcdDate(carry.cptTerm);
    const desc = carry.ncdDescription ?? '';

    for (const rawCptCode of cptList) {
      if (rawCptCode === '') {
        continue;
      }
      const cptCode =
        rawCptCode.length > CODE_MAX_LENGTH ? rawCptCode.slice(0, CODE_MAX_LENGTH) : rawCptCode;

      const cptKey = JSON.stringify([sectionId, ncdNum, desc, cptCode]);

      let cptId = cptIdByKey.get(cptKey);
      if (cptId === undefined) {
        const created = await this.prisma.ncdCpt.create({
          data: {
            ncdNumber: ncdNum,
            ncdDescription: desc,
            cptCode,
            effectiveDate: cptEffDate,
            terminateDate: cptTermDate,
          },
        });
        cptId = created.id;
        cptIdByKey.set(cptKey, cptId);
        stats.cptInserted += 1;
      }

      for (const rawIcd of icdCodes) {
        const singleIcd = rawIcd.length > CODE_MAX_LENGTH ? rawIcd.slice(0, CODE_MAX_LENGTH) : rawIcd;

        batch.rows.push({
          icdCode: singleIcd,
          ncdCptId: cptId,
          effectiveDate: icdEff,
          terminateDate: icdTerm,
          resolutionCode: resolution,
        });

        if (batch.rows.length >= chunkSize) {
          await this.flushIcdBatch(batch, stats);
        }
      }
    }
  }

  /** Flush the buffered ncd_icd rows — no skipDuplicates (Laravel inserts unconditionally). */
  private async flushIcdBatch(batch: IcdBatchState, stats: Icd10NcdImportStats): Promise<void> {
    if (batch.rows.length === 0) {
      return;
    }
    const pending = batch.rows.length;
    await this.prisma.ncdIcd.createMany({ data: batch.rows });
    stats.icdInserted += pending;
    batch.rows.length = 0;
  }
}
