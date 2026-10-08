import {
  BadRequestException,
  Injectable,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AgeSpecificCptRulesImportService } from '../imports/age-specific-cpt-rules.import.service';
import { getReferenceDomain } from './domains.registry';
import {
  referenceDomainSupportsWebExport,
  referenceDomainSupportsWebImport,
} from './reference-io.registry';
import { toSnakeCase } from './snake.util';

export type ReferenceExportResult = {
  filename: string;
  body: Record<string, unknown>;
};

export type ReferenceImportResult = {
  message: string;
  upserted: number;
  skipped: number;
};

@Injectable()
export class ReferenceAdminIoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ageSpecificCptImport: AgeSpecificCptRulesImportService,
  ) {}

  async exportDomain(slug: string): Promise<ReferenceExportResult> {
    if (!getReferenceDomain(slug)) {
      throw new NotFoundException(`Unknown reference domain: ${slug}`);
    }
    if (!referenceDomainSupportsWebExport(slug)) {
      throw new MethodNotAllowedException(`Export is not available for ${slug}.`);
    }

    const stamp = formatStamp(new Date());

    switch (slug) {
      case 'age-specific-cpt-rules': {
        const rows = await this.prisma.ageSpecificCptRule.findMany({
          orderBy: { cptCode: 'asc' },
        });
        return {
          filename: `age_specific_cpt_rules_${stamp}.json`,
          body: {
            rules: rows.map((r) => ({
              cpt_code: r.cptCode,
              description: r.description,
              low_limit: r.lowLimit,
              high_limit: r.highLimit,
              unit: r.unit,
              gender: r.gender,
              notes: r.notes,
              is_active: r.isActive,
            })),
          },
        };
      }
      case 'cpt-codes': {
        const rows = await this.prisma.cptCode.findMany({ orderBy: { name: 'asc' } });
        return {
          filename: `cpt_codes_${stamp}.json`,
          body: {
            codes: rows.map((r) => ({
              name: r.name,
              description: r.description,
              effective_date: r.effectiveDate
                ? r.effectiveDate.toISOString().slice(0, 10)
                : null,
              is_active: r.isActive,
            })),
          },
        };
      }
      case 'ncci': {
        const rows = await this.prisma.ncci.findMany({
          orderBy: [{ column1: 'asc' }, { column2: 'asc' }],
        });
        return {
          filename: `ncci_${stamp}.json`,
          body: {
            records: rows.map((r) => ({
              column_1: r.column1,
              column_2: r.column2,
              in_existence_prior_to_1996: r.inExistencePriorTo1996,
              effective_date: r.effectiveDate
                ? r.effectiveDate.toISOString().slice(0, 10)
                : null,
              deletion_date: r.deletionDate
                ? r.deletionDate.toISOString().slice(0, 10)
                : null,
              modifier: r.modifier,
              ptp_edit_rationale: r.ptpEditRationale,
              source_file: r.sourceFile,
              is_active: r.isActive,
            })),
          },
        };
      }
      case 'cpt-pos-rules': {
        const rows = await this.prisma.cptPosRule.findMany({
          orderBy: [{ cptCode: 'asc' }, { posCode: 'asc' }],
          select: {
            cptCode: true,
            posCode: true,
            payerId: true,
            isDeleted: true,
          },
        });
        return {
          filename: `cpt_pos_rules_${stamp}.json`,
          body: {
            rules: rows.map(
              (r) => toSnakeCase(r as unknown as Record<string, unknown>) as Record<string, unknown>,
            ),
          },
        };
      }
      case 'cpt-modifier-rules': {
        const rows = await this.prisma.cptModifierRule.findMany({
          orderBy: [{ cptCode: 'asc' }, { modifierCode: 'asc' }],
          select: {
            cptCode: true,
            modifierCode: true,
            isAllowed: true,
            payerId: true,
            description: true,
            notes: true,
            isActive: true,
          },
        });
        return {
          filename: `cpt_modifier_rules_${stamp}.json`,
          body: {
            rules: rows.map(
              (r) => toSnakeCase(r as unknown as Record<string, unknown>) as Record<string, unknown>,
            ),
          },
        };
      }
      case 'gender-specific-cpt-rules': {
        const rows = await this.prisma.genderSpecificCptRule.findMany({
          orderBy: { cptCode: 'asc' },
        });
        return {
          filename: `gender_specific_cpt_rules_${stamp}.json`,
          body: {
            rules: rows.map((r) => ({
              cpt_code: r.cptCode,
              description: r.description,
              gender: r.gender,
              notes: r.notes,
              is_active: r.isActive,
            })),
          },
        };
      }
      default:
        throw new MethodNotAllowedException(`Export is not available for ${slug}.`);
    }
  }

  async importDomain(
    slug: string,
    file: Express.Multer.File | undefined,
  ): Promise<ReferenceImportResult> {
    if (!getReferenceDomain(slug)) {
      throw new NotFoundException(`Unknown reference domain: ${slug}`);
    }
    if (!referenceDomainSupportsWebImport(slug)) {
      throw new MethodNotAllowedException(`Import is not available for ${slug}.`);
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required.');
    }

    const original = String(file.originalname ?? 'upload.bin');
    const ext = path.extname(original).toLowerCase() || guessExtFromMime(file.mimetype);
    if (!['.xlsx', '.xls', '.json', '.txt'].includes(ext)) {
      throw new BadRequestException(
        'Unsupported file type. Use .xlsx, .xls, .json, or .txt',
      );
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'scrubber-ref-import-'));
    const filePath = path.join(dir, `upload${ext}`);
    try {
      await writeFile(filePath, file.buffer);

      if (slug !== 'age-specific-cpt-rules') {
        throw new MethodNotAllowedException(`Import is not available for ${slug}.`);
      }

      const result = await this.ageSpecificCptImport.importFromFile(filePath);
      const parts = [`Upserted ${result.upserted} rules.`];
      if (result.skipped > 0) {
        parts.push(`Skipped ${result.skipped} empty rows.`);
      }
      return {
        message: parts.join(' '),
        upserted: result.upserted,
        skipped: result.skipped,
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function guessExtFromMime(mime: string | undefined): string {
  const m = String(mime ?? '').toLowerCase();
  if (m.includes('spreadsheet') || m.includes('excel')) return '.xlsx';
  if (m.includes('json')) return '.json';
  return '.bin';
}
