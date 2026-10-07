import { Module } from '@nestjs/common';
import { LookupCacheModule } from '../cache/lookup-cache.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AnesthesiaCodesImportCommand } from './anesthesia-codes.command';
import { AnesthesiaCodesImportService } from './anesthesia-codes.import.service';
import { AnesthesiaCodesWithBillableModifiersImportCommand } from './anesthesia-codes-with-billable-modifiers.command';
import { AnesthesiaCodesWithBillableModifiersImportService } from './anesthesia-codes-with-billable-modifiers.import.service';
import { AnesthesiaModifiersImportCommand } from './anesthesia-modifiers.command';
import { AnesthesiaModifiersImportService } from './anesthesia-modifiers.import.service';
import { GlobalDaysSurgeriesImportCommand } from './global-days-surgeries.command';
import { GlobalDaysSurgeriesImportService } from './global-days-surgeries.import.service';
import { ICodesImportCommand } from './i-codes.command';
import { ICodesImportService } from './i-codes.import.service';
import { InitialTreatmentCodesImportCommand } from './initial-treatment-codes.command';
import { InitialTreatmentCodesImportService } from './initial-treatment-codes.import.service';
import { LookupSyncHelper } from './lookup-sync.helper';
import { MajorSurgeryCodesImportCommand } from './major-surgery-codes.command';
import { MajorSurgeryCodesImportService } from './major-surgery-codes.import.service';
import { NoOfUnitsCptsImportCommand } from './no-of-units-cpts.command';
import { NoOfUnitsCptsImportService } from './no-of-units-cpts.import.service';
import { RadiologyCptCodesImportCommand } from './radiology-cpt-codes.command';
import { RadiologyCptCodesImportService } from './radiology-cpt-codes.import.service';
import { BcbsClaimRoutingsImportCommand } from './bcbs-claim-routings.command';
import { BcbsClaimRoutingsImportService } from './bcbs-claim-routings.import.service';
import { Mue87726Uhc06111OxfordImportCommand } from './mue-87726-uhc-06111-oxford.command';
import { Mue87726Uhc06111OxfordImportService } from './mue-87726-uhc-06111-oxford.import.service';
import { UhcAuthorizationsImportCommand } from './uhc-authorizations.command';
import { UhcAuthorizationsImportService } from './uhc-authorizations.import.service';
import { ZeroAmountProceduresImportCommand } from './zero-amount-procedures.command';
import { ZeroAmountProceduresImportService } from './zero-amount-procedures.import.service';
import { EnmProceduresImportCommand } from './enm-procedures.command';
import { EnmProceduresImportService } from './enm-procedures.import.service';
import { EnmSurgeryCodesImportCommand } from './enm-surgery-codes.command';
import { EnmSurgeryCodesImportService } from './enm-surgery-codes.import.service';
import { ConsultationProceduresImportCommand } from './consultation-procedures.command';
import { ConsultationProceduresImportService } from './consultation-procedures.import.service';
import { LabCodesImportCommand } from './lab-codes.command';
import { LabCodesImportService } from './lab-codes.import.service';
import { VaccineCodesImportCommand } from './vaccine-codes.command';
import { VaccineCodesImportService } from './vaccine-codes.import.service';
import { AgeSpecificCptRulesImportCommand } from './age-specific-cpt-rules.command';
import { AgeSpecificCptRulesImportService } from './age-specific-cpt-rules.import.service';
import { GenderSpecificCptRulesImportCommand } from './gender-specific-cpt-rules.command';
import { GenderSpecificCptRulesImportService } from './gender-specific-cpt-rules.import.service';
import { AgeSpecificIcdRulesImportCommand } from './age-specific-icd-rules.command';
import { AgeSpecificIcdRulesImportService } from './age-specific-icd-rules.import.service';
import { IcdGenderSpecificRulesImportCommand } from './icd-gender-specific-rules.command';
import { IcdGenderSpecificRulesImportService } from './icd-gender-specific-rules.import.service';
import { TobaccoCounselingIcdRulesImportCommand } from './tobacco-counseling-icd-rules.command';
import { TobaccoCounselingIcdRulesImportService } from './tobacco-counseling-icd-rules.import.service';
import { ModifierSequencesImportCommand } from './modifier-sequences.command';
import { ModifierSequencesImportService } from './modifier-sequences.import.service';
import { CptCodesImportCommand } from './cpt-codes.command';
import { CptCodesImportService } from './cpt-codes.import.service';
import { ModifiersImportCommand } from './modifiers.command';
import { ModifiersImportService } from './modifiers.import.service';
import { NdcCodesImportCommand } from './ndc-codes.command';
import { NdcCodesImportService } from './ndc-codes.import.service';
import { NdcHcpcsCrosswalkImportCommand } from './ndc-hcpcs-crosswalk.command';
import { NdcHcpcsCrosswalkImportService } from './ndc-hcpcs-crosswalk.import.service';
import { UhcPosCrosswalkImportCommand } from './uhc-pos-crosswalk.command';
import { UhcPosCrosswalkImportService } from './uhc-pos-crosswalk.import.service';
import { TaxonomyCodesImportCommand } from './taxonomy-codes.command';
import { TaxonomyCodesImportService } from './taxonomy-codes.import.service';
import { Icd10RangeExpander } from './icd10-range.expander';
import { UhcAuthorizationConditionValuesNormalizer } from './uhc-authorization-condition-values.normalizer';

@Module({
  imports: [PrismaModule, LookupCacheModule],
  providers: [
    LookupSyncHelper,
    RadiologyCptCodesImportService,
    MajorSurgeryCodesImportService,
    InitialTreatmentCodesImportService,
    NoOfUnitsCptsImportService,
    AnesthesiaCodesImportService,
    AnesthesiaModifiersImportService,
    AnesthesiaCodesWithBillableModifiersImportService,
    ICodesImportService,
    GlobalDaysSurgeriesImportService,
    BcbsClaimRoutingsImportService,
    Mue87726Uhc06111OxfordImportService,
    UhcAuthorizationsImportService,
    ZeroAmountProceduresImportService,
    EnmProceduresImportService,
    EnmSurgeryCodesImportService,
    ConsultationProceduresImportService,
    LabCodesImportService,
    VaccineCodesImportService,
    AgeSpecificCptRulesImportService,
    GenderSpecificCptRulesImportService,
    AgeSpecificIcdRulesImportService,
    IcdGenderSpecificRulesImportService,
    TobaccoCounselingIcdRulesImportService,
    ModifierSequencesImportService,
    CptCodesImportService,
    ModifiersImportService,
    NdcCodesImportService,
    NdcHcpcsCrosswalkImportService,
    UhcPosCrosswalkImportService,
    TaxonomyCodesImportService,
    Icd10RangeExpander,
    UhcAuthorizationConditionValuesNormalizer,
    RadiologyCptCodesImportCommand,
    MajorSurgeryCodesImportCommand,
    InitialTreatmentCodesImportCommand,
    NoOfUnitsCptsImportCommand,
    AnesthesiaCodesImportCommand,
    AnesthesiaModifiersImportCommand,
    AnesthesiaCodesWithBillableModifiersImportCommand,
    ICodesImportCommand,
    GlobalDaysSurgeriesImportCommand,
    BcbsClaimRoutingsImportCommand,
    Mue87726Uhc06111OxfordImportCommand,
    UhcAuthorizationsImportCommand,
    ZeroAmountProceduresImportCommand,
    EnmProceduresImportCommand,
    EnmSurgeryCodesImportCommand,
    ConsultationProceduresImportCommand,
    LabCodesImportCommand,
    VaccineCodesImportCommand,
    AgeSpecificCptRulesImportCommand,
    GenderSpecificCptRulesImportCommand,
    AgeSpecificIcdRulesImportCommand,
    IcdGenderSpecificRulesImportCommand,
    TobaccoCounselingIcdRulesImportCommand,
    ModifierSequencesImportCommand,
    CptCodesImportCommand,
    ModifiersImportCommand,
    NdcCodesImportCommand,
    NdcHcpcsCrosswalkImportCommand,
    UhcPosCrosswalkImportCommand,
    TaxonomyCodesImportCommand,
  ],
  exports: [
    RadiologyCptCodesImportService,
    MajorSurgeryCodesImportService,
    InitialTreatmentCodesImportService,
    NoOfUnitsCptsImportService,
    AnesthesiaCodesImportService,
    AnesthesiaModifiersImportService,
    AnesthesiaCodesWithBillableModifiersImportService,
    ICodesImportService,
    GlobalDaysSurgeriesImportService,
    BcbsClaimRoutingsImportService,
    Mue87726Uhc06111OxfordImportService,
    UhcAuthorizationsImportService,
    ZeroAmountProceduresImportService,
    EnmProceduresImportService,
    EnmSurgeryCodesImportService,
    ConsultationProceduresImportService,
    LabCodesImportService,
    VaccineCodesImportService,
    AgeSpecificCptRulesImportService,
    GenderSpecificCptRulesImportService,
    AgeSpecificIcdRulesImportService,
    IcdGenderSpecificRulesImportService,
    TobaccoCounselingIcdRulesImportService,
    ModifierSequencesImportService,
    CptCodesImportService,
    ModifiersImportService,
    NdcCodesImportService,
    NdcHcpcsCrosswalkImportService,
    UhcPosCrosswalkImportService,
    TaxonomyCodesImportService,
  ],
})
export class ImportsModule {}
