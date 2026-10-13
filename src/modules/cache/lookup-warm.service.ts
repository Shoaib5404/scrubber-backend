import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LOOKUP_CACHE_TABLE_NAMES } from './lookup-table.registry';
import { LookupCacheService } from './lookup-cache.service';
import { NcciRulesCacheService } from './ncci-rules-cache.service';
import { lookupLogicalName } from './cache.constants';

export type WarmTableResult = {
  table: string;
  ok: boolean;
  detail: string;
};

/**
 * Eagerly loads approved reference tables from PostgreSQL into Redis DB 1
 * (chunked automatically when payloads exceed LOOKUP_CACHE_CHUNK_BYTES).
 */
@Injectable()
export class LookupWarmService {
  private readonly logger = new Logger(LookupWarmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupCache: LookupCacheService,
    private readonly ncciCache: NcciRulesCacheService,
  ) {}

  registeredTables(): readonly string[] {
    return LOOKUP_CACHE_TABLE_NAMES;
  }

  async warmTable(table: string): Promise<WarmTableResult> {
    try {
      if (table === 'nccis') {
        const rows = await this.ncciCache.warmFullTable();
        return { table, ok: true, detail: `warmed ${rows.length} NCCI pair(s)` };
      }

      const loader = this.loaderFor(table);
      if (!loader) {
        return { table, ok: false, detail: 'no warm loader registered for table' };
      }

      await this.lookupCache.invalidateTable(table);
      const logical = lookupLogicalName(table, 'full', 'all');
      const data = await this.lookupCache.getOrLoad(logical, loader);
      const count = Array.isArray(data)
        ? data.length
        : data != null && typeof data === 'object'
          ? Object.keys(data as object).length
          : 1;
      return { table, ok: true, detail: `warmed ${count} item(s) at ${logical}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Warm failed for ${table}: ${msg}`);
      return { table, ok: false, detail: msg };
    }
  }

  async warmMany(tables: readonly string[]): Promise<WarmTableResult[]> {
    const results: WarmTableResult[] = [];
    for (const table of tables) {
      results.push(await this.warmTable(table));
    }
    return results;
  }

  async warmAllRegistered(): Promise<WarmTableResult[]> {
    return this.warmMany([...LOOKUP_CACHE_TABLE_NAMES, 'nccis']);
  }

  private loaderFor(table: string): (() => Promise<unknown>) | null {
    switch (table) {
      case 'cpt_codes':
        return async () =>
          this.prisma.cptCode.findMany({
            where: { isActive: true },
            select: { id: true, name: true, description: true, isActive: true },
          });
      case 'modifiers':
        return async () =>
          this.prisma.modifier.findMany({
            select: { id: true, modifier: true, shortDescription: true },
          });
      case 'modifier_sequences':
        return async () =>
          this.prisma.modifierSequence.findMany({
            where: { isActive: true },
          });
      case 'taxonomy_codes':
        return async () =>
          this.prisma.taxonomyCode.findMany({
            where: { isActive: true },
            select: { taxonomyCode: true, isActive: true },
          });
      case 'zip_codes':
        return async () =>
          this.prisma.zipCode.findMany({
            select: { zipCode: true, city: true, state: true, zipCodeType: true },
          });
      case 'ndc_codes':
        return async () =>
          this.prisma.ndcCode.findMany({
            where: { isActive: true },
          });
      case 'ndc_hcpcs_crosswalk':
        return async () => this.prisma.ndcHcpcsCrosswalk.findMany();
      case 'icd10_tabular_codes':
        return async () =>
          this.prisma.icd10TabularCode.findMany({
            select: {
              id: true,
              code: true,
              parentId: true,
              isChapter: true,
              isSection: true,
              isBillable: true,
            },
          });
      case 'icd10_tabular_code_descriptions':
        return async () => this.prisma.icd10TabularCodeDescription.findMany();
      case 'age_specific_cpt_rules':
        return async () =>
          this.prisma.ageSpecificCptRule.findMany({ where: { isActive: true } });
      case 'gender_specific_cpt_rules':
        return async () =>
          this.prisma.genderSpecificCptRule.findMany({ where: { isActive: true } });
      case 'age_specific_icd_rules':
        return async () =>
          this.prisma.ageSpecificIcdRule.findMany({ where: { isActive: true } });
      case 'icd_gender_specific_rules':
        return async () =>
          this.prisma.icdGenderSpecificRule.findMany({ where: { isActive: true } });
      case 'cpt_modifier_rules':
      case 'cpt_modifier_rules_by_cpt':
        return async () =>
          this.prisma.cptModifierRule.findMany({ where: { isActive: true } });
      case 'cpt_pos_rules':
      case 'cpt_pos_rules_by_cpt':
        return async () => this.prisma.cptPosRule.findMany({ where: { isDeleted: false } });
      case 'add_on_codes':
        return async () => this.prisma.addOnCode.findMany();
      case 'mue_practitioners':
        return async () => this.prisma.muePractitioner.findMany();
      case 'enm_procedures':
        return async () => {
          const rows = await this.prisma.enmProcedure.findMany({
            where: { isActive: true },
            select: { cptCode: true },
          });
          return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true]));
        };
      case 'enm_surgery_codes':
        return async () => {
          const rows = await this.prisma.enmSurgeryCode.findMany({
            where: { isActive: true },
            select: { cptCode: true },
          });
          return Object.fromEntries(rows.map((r) => [r.cptCode.toUpperCase(), true]));
        };
      case 'lab_codes':
        return async () => this.prisma.labCode.findMany({ where: { isActive: true } });
      case 'vaccine_codes':
        return async () => this.prisma.vaccineCode.findMany({ where: { isActive: true } });
      case 'mcr_vaccine_codes':
        return async () => this.prisma.mcrVaccineCode.findMany({ where: { isActive: true } });
      case 'consultation_procedures':
        return async () =>
          this.prisma.consultationProcedure.findMany({ where: { isActive: true } });
      case 'uhc_authorizations':
      case 'uhc_authorizations_by_cpt':
        return async () =>
          this.prisma.uhcAuthorization.findMany({ where: { isActive: true } });
      case 'uhc_pos_crosswalk':
        return async () => this.prisma.uhcPosCrosswalk.findMany();
      case 'cigna_cpt_icd_crosswalk':
        return async () => this.prisma.cignaCptIcdCrosswalk.findMany();
      case 'aetna_fetal_lcd':
        return async () => this.prisma.aetnaFetalLcd.findMany({ where: { isActive: true } });
      case 'aetna_b12_lcd':
        return async () => this.prisma.aetnaB12Lcd.findMany({ where: { isActive: true } });
      case 'bcbs_claim_routings':
        return async () => this.prisma.bcbsClaimRouting.findMany({ where: { isActive: true } });
      case 'ncd_cpt':
        return async () => this.prisma.ncdCpt.findMany();
      case 'ncd_icd':
        return async () => this.prisma.ncdIcd.findMany();
      case 'ncd_other_lab_codes':
        return async () => this.prisma.ncdOtherLabCode.findMany();
      case 'ncd_other_lab_cpt':
        return async () => this.prisma.ncdOtherLabCpt.findMany();
      case 'ncd_denied_icd_pairs':
        return async () => {
          const ncdCpts = await this.prisma.ncdCpt.findMany({
            include: { ncdIcds: true },
          });
          const out: Record<string, Record<string, true>> = {};
          for (const row of ncdCpts) {
            const cpt = row.cptCode.toUpperCase();
            for (const icd of row.ncdIcds) {
              if (icd.resolutionCode !== 2) continue;
              (out[cpt] ??= {})[icd.icdCode.replace(/\./g, '').toUpperCase()] = true;
            }
          }
          return out;
        };
      case 'npi_ordering_referrings':
        // Full CMS list is too large for a single warm; by-NPI keys are filled on read.
        // Warm a compact presence marker only.
        return async () => ({ warmedAt: new Date().toISOString(), mode: 'by_npi_on_read' });
      case 'i_codes':
        return async () => this.prisma.iCode.findMany({ where: { active: true } });
      case 'zero_amount_procedures':
        return async () =>
          this.prisma.zeroAmountProcedure.findMany({ where: { isActive: true } });
      case 'no_of_units_cpts':
        return async () => this.prisma.noOfUnitsCpt.findMany({ where: { isActive: true } });
      case 'radiology_cpt_codes':
        return async () => this.prisma.radiologyCptCode.findMany({ where: { isActive: true } });
      case 'major_surgery_codes':
        return async () => this.prisma.majorSurgeryCode.findMany({ where: { active: true } });
      case 'global_days_surgeries':
        return async () => this.prisma.globalDaysSurgery.findMany({ where: { isActive: true } });
      case 'anesthesia_codes':
        return async () => this.prisma.anesthesiaCode.findMany({ where: { active: true } });
      case 'anesthesia_modifiers':
        return async () => this.prisma.anesthesiaModifier.findMany({ where: { active: true } });
      case 'anesthesia_codes_with_billable_modifiers':
        return async () =>
          this.prisma.anesthesiaCodeWithBillableModifier.findMany({ where: { active: true } });
      case 'icd10_body_sidewise':
        return async () => this.prisma.icd10BodySidewise.findMany();
      case 'icd10_unacceptable_principal_diagnose_codes':
        return async () => this.prisma.icd10UnacceptablePrincipalDiagnoseCode.findMany();
      case 'tobacco_counseling_icd_rules':
        return async () =>
          this.prisma.tobaccoCounselingIcdRule.findMany({ where: { isActive: true } });
      case 'mue_87726_uhc_06111_oxford':
        return async () => this.prisma.mue87726Uhc06111Oxford.findMany();
      case 'initial_treatment_codes':
        return async () => this.prisma.initialTreatmentCode.findMany({ where: { active: true } });
      case 'state_lookup':
        return async () => this.prisma.stateLookup.findMany();
      case 'region_lookup':
        return async () => this.prisma.regionLookup.findMany();
      case 'contractor_type_lookup':
        return async () => this.prisma.contractorTypeLookup.findMany();
      case 'contractor_subtype_lookup':
        return async () => this.prisma.contractorSubtypeLookup.findMany();
      case 'contractor':
        return async () => this.prisma.contractor.findMany();
      case 'contractor_jurisdiction':
        return async () => this.prisma.contractorJurisdiction.findMany();
      case 'contractor_oversight':
        return async () => this.prisma.contractorOversight.findMany();
      default:
        return null;
    }
  }
}
