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
  ],
})
export class ImportsModule {}
