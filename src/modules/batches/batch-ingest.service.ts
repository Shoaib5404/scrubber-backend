import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimValidationService } from '../claim-validation/claim-validation.service';
import { ModelDrivenEdiParser } from '../edi-parser/model-driven-edi.parser';
import { ParsedBatch } from '../edi-parser/types';
import { Edi837ValidationService } from '../edi-structural-validation/edi837-validation.service';
import { Edi837ValidationResultDto } from '../edi-structural-validation/types';

@Injectable()
export class BatchIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly structural: Edi837ValidationService,
    private readonly parser: ModelDrivenEdiParser,
    private readonly claimValidation: ClaimValidationService,
  ) {}

  /** Laravel BatchService::ingestUpload — structural + parse/store; no claim rules. */
  async ingestUpload(
    file: { originalname: string; buffer: Buffer; size: number },
    uploadedById: number | null,
  ) {
    const raw = file.buffer.toString('utf8');
    if (!raw.trim()) {
      throw new UnprocessableEntityException({
        message: 'The uploaded EDI file is empty or could not be read.',
        issues: [
          {
            rule_id: 'EMPTY_FILE',
            severity: 'error',
            message: 'The uploaded EDI file is empty or could not be read.',
            category: 'upload',
          },
        ],
      });
    }

    const max = this.config.get<number>('EDI_MAX_BYTES', 26_214_400);
    if (file.size > max) {
      throw new BadRequestException(`EDI file exceeds max size of ${max} bytes`);
    }

    const ediValidation = this.structural.validate(raw);
    const strict = this.config.get<boolean>('EDI837_VALIDATION_STRICT', true);
    if (!ediValidation.passed && strict) {
      throw new UnprocessableEntityException({
        message: 'EDI 837 structural validation failed',
        ...ediValidation,
      });
    }

    let parsed: ParsedBatch;
    try {
      parsed = this.parser.parse(raw);
    } catch (e) {
      throw new UnprocessableEntityException({
        message: e instanceof Error ? e.message : 'EDI parse failed.',
        issues: [
          {
            rule_id: 'PARSE',
            severity: 'error',
            message: e instanceof Error ? e.message : 'EDI parse failed.',
            category: 'parse',
          },
        ],
      });
    }

    const storedName = `${Date.now()}-${randomBytes(6).toString('hex')}.edi`;
    const relPath = path.posix.join('edi_files', storedName);
    const absDir = path.resolve(
      this.config.get<string>('EDI_LOCAL_PATH', './storage/edi'),
      'edi_files',
    );
    await fsp.mkdir(absDir, { recursive: true });
    await fsp.writeFile(path.join(absDir, storedName), file.buffer);

    const batch = await this.prisma.batchFile.create({
      data: {
        filename: storedName,
        originalFilename: file.originalname,
        filePath: relPath,
        fileSize: file.size,
        uploadedById,
        status: 'processing',
        isaSenderId: parsed.isaSenderId,
        isaReceiverId: parsed.isaReceiverId,
        isaControlNumber: parsed.isaControlNumber,
        gsControlNumber: parsed.gsControlNumber,
        ediValidationErrors: ediValidation.issues.length ? ediValidation : undefined,
      },
    });

    return this.storeParsedData(batch.id, parsed, ediValidation);
  }

  /** Structural + parse only → parsed */
  async ingest(batchId: number) {
    const batch = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Batch not found.');

    const fullPath = path.resolve(
      this.config.get<string>('EDI_LOCAL_PATH', './storage/edi'),
      batch.filePath,
    );
    const raw = await fsp.readFile(fullPath, 'utf8');
    const ediValidation = this.structural.validate(raw);
    const strict = this.config.get<boolean>('EDI837_VALIDATION_STRICT', true);
    if (!ediValidation.passed && strict) {
      return this.prisma.batchFile.update({
        where: { id: batchId },
        data: {
          status: 'error',
          errorMessage: 'EDI 837 structural validation failed',
          ediValidationErrors: ediValidation,
        },
      });
    }
    const parsed = this.parser.parse(raw);
    return this.storeParsedData(batchId, parsed, ediValidation);
  }

  /** Sync process: parse path + claim validation (queue fan-out = SP-5). */
  async process(batchId: number, force = false) {
    const existing = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!existing) throw new NotFoundException('Batch not found.');

    if (!force && existing.status === 'parsed' && existing.totalClaims > 0) {
      await this.prisma.batchFile.update({
        where: { id: batchId },
        data: { status: 'validating' },
      });
      await this.claimValidation.validateBatch(batchId, force);
      return this.prisma.batchFile.findUniqueOrThrow({ where: { id: batchId } });
    }

    const batch = await this.ingest(batchId);
    if (batch.status === 'error') return batch;

    await this.prisma.batchFile.update({
      where: { id: batchId },
      data: { status: 'validating' },
    });
    await this.claimValidation.validateBatch(batchId, force);
    return this.prisma.batchFile.findUniqueOrThrow({ where: { id: batchId } });
  }

  private async storeParsedData(
    batchId: number,
    parsed: ParsedBatch,
    ediValidation?: Edi837ValidationResultDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.serviceLine.deleteMany({ where: { claim: { batchFileId: batchId } } });
      await tx.claimDiagnosis.deleteMany({ where: { claim: { batchFileId: batchId } } });
      await tx.claim.deleteMany({ where: { batchFileId: batchId } });

      for (const c of parsed.claims) {
        const claim = await tx.claim.create({
          data: {
            batchFileId: batchId,
            claimId: c.claimId,
            totalCharge: c.totalCharge,
            placeOfService: c.placeOfService,
            frequencyCode: c.frequencyCode,
            billingProviderName: c.billingProviderName,
            billingProviderNpi: c.billingProviderNpi,
            subscriberLastName: c.subscriberLastName,
            subscriberFirstName: c.subscriberFirstName,
            subscriberMemberId: c.subscriberMemberId,
            subscriberGender: c.subscriberGender,
            payerName: c.payerName,
            payerId: c.payerId,
            patientLastName: c.patientLastName,
            patientFirstName: c.patientFirstName,
            stControlNumber: c.stControlNumber,
            status: 'pending',
          },
        });
        if (c.diagnoses.length) {
          await tx.claimDiagnosis.createMany({
            data: c.diagnoses.map((d) => ({
              claimId: claim.id,
              sequence: d.sequence,
              code: d.code,
              qualifier: d.qualifier,
              type: d.type,
            })),
          });
        }
        if (c.serviceLines.length) {
          await tx.serviceLine.createMany({
            data: c.serviceLines.map((l) => ({
              claimId: claim.id,
              lineNumber: l.lineNumber,
              procedureCode: l.procedureCode,
              modifier1: l.modifiers[0] ?? null,
              modifier2: l.modifiers[1] ?? null,
              modifier3: l.modifiers[2] ?? null,
              modifier4: l.modifiers[3] ?? null,
              chargeAmount: l.chargeAmount,
              units: l.units,
              placeOfService: l.placeOfService,
              diagnosisPointers: l.diagnosisPointers ?? undefined,
              status: 'pending',
            })),
          });
        }
      }

      const totalAmount = parsed.claims.reduce((s, c) => s + c.totalCharge, 0);
      return tx.batchFile.update({
        where: { id: batchId },
        data: {
          status: 'parsed',
          totalClaims: parsed.claims.length,
          totalAmount,
          errorMessage: null,
          ediValidationErrors: ediValidation ?? undefined,
        },
      });
    });
  }
}
