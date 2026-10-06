-- CreateTable
CREATE TABLE "icd10_tabular_codes" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER,
    "code" VARCHAR(32) NOT NULL,
    "is_chapter" BOOLEAN NOT NULL DEFAULT false,
    "is_section" BOOLEAN NOT NULL DEFAULT false,
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "effective_start_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icd10_tabular_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd10_tabular_code_descriptions" (
    "id" SERIAL NOT NULL,
    "icd10_tabular_code_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "description_type" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icd10_tabular_code_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "age_specific_cpt_rules" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "low_limit" INTEGER,
    "high_limit" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'years',
    "gender" TEXT NOT NULL DEFAULT 'B',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "age_specific_cpt_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "age_specific_icd_rules" (
    "id" SERIAL NOT NULL,
    "icd_code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "low_limit" INTEGER,
    "upper_limit" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'years',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "age_specific_icd_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gender_specific_cpt_rules" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(10) NOT NULL,
    "description" VARCHAR(500),
    "gender" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gender_specific_cpt_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd_gender_specific_rules" (
    "id" SERIAL NOT NULL,
    "icd_code" VARCHAR(20) NOT NULL,
    "description" VARCHAR(500),
    "gender" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icd_gender_specific_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpt_codes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "description" VARCHAR(500),
    "effective_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpt_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" SERIAL NOT NULL,
    "modifier" VARCHAR(10) NOT NULL,
    "short_description" VARCHAR(500),
    "add_dt" DATE,
    "act_eff_dt" DATE,
    "term_dt" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_sequences" (
    "id" SERIAL NOT NULL,
    "modifier" VARCHAR(10) NOT NULL,
    "modifier_group" VARCHAR(100) NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpt_modifier_rules" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(10) NOT NULL,
    "modifier_code" VARCHAR(5) NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "payer_id" VARCHAR(50),
    "description" VARCHAR(500),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpt_modifier_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpt_pos_rules" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(10) NOT NULL,
    "pos_code" VARCHAR(2) NOT NULL,
    "payer_id" VARCHAR(10),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpt_pos_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd10_body_sidewise" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "long_description" TEXT,
    "side" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icd10_body_sidewise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd10_unacceptable_principal_diagnose_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "claim_type" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icd10_unacceptable_principal_diagnose_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nccis" (
    "id" SERIAL NOT NULL,
    "column_1" VARCHAR(20) NOT NULL,
    "column_2" VARCHAR(20) NOT NULL,
    "in_existence_prior_to_1996" BOOLEAN NOT NULL DEFAULT false,
    "effective_date" DATE,
    "deletion_date" DATE,
    "modifier" INTEGER NOT NULL DEFAULT 0,
    "ptp_edit_rationale" VARCHAR(500),
    "source_file" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nccis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mue_practitioners" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "lower_limit" VARCHAR(32),
    "upper_limit" VARCHAR(32),
    "indicator" TEXT,
    "effective_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mue_practitioners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "add_on_codes" (
    "id" SERIAL NOT NULL,
    "primary_code" VARCHAR(20) NOT NULL,
    "aoc_edit_type" INTEGER,
    "add_on_code" VARCHAR(20),
    "aoc_deldt" DATE,
    "primary_code_deldt" DATE,
    "aoc_edit_effdt" DATE,
    "aoc_edit_deldt" DATE,
    "special_instruction_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "add_on_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zero_amount_procedures" (
    "id" SERIAL NOT NULL,
    "procedure_code" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zero_amount_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_of_units_cpts" (
    "id" SERIAL NOT NULL,
    "cpt" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "no_of_units_cpts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_days_surgeries" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_days_surgeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "initial_treatment_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "initial_treatment_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radiology_cpt_codes" (
    "id" SERIAL NOT NULL,
    "cpt" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radiology_cpt_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "major_surgery_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "major_surgery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anesthesia_codes" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "unit" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anesthesia_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anesthesia_modifiers" (
    "id" SERIAL NOT NULL,
    "modifier" VARCHAR(10) NOT NULL,
    "description" VARCHAR(500),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anesthesia_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anesthesia_codes_with_billable_modifiers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "modifier" VARCHAR(10) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anesthesia_codes_with_billable_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tobacco_counseling_icd_rules" (
    "id" SERIAL NOT NULL,
    "icd_code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "indicator" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tobacco_counseling_icd_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_procedures" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "type_of_service" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enm_procedures" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enm_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enm_surgery_codes" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enm_surgery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_codes" (
    "id" SERIAL NOT NULL,
    "hcpcs" VARCHAR(20) NOT NULL,
    "modifier" VARCHAR(10) NOT NULL DEFAULT '',
    "effective_date" DATE,
    "indicator" VARCHAR(5),
    "rate" DECIMAL(12,2),
    "short_description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcr_vaccine_codes" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "vaccine_code" VARCHAR(20) NOT NULL,
    "icd10_code" VARCHAR(20),
    "administration_code" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcr_vaccine_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_codes" (
    "id" SERIAL NOT NULL,
    "vaccine_code" VARCHAR(20) NOT NULL,
    "description" VARCHAR(1000),
    "component_count" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccine_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "i_codes" (
    "id" SERIAL NOT NULL,
    "hcpcs" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "i_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "icd10_tabular_codes_code_idx" ON "icd10_tabular_codes"("code");

-- CreateIndex
CREATE INDEX "icd10_tabular_codes_parent_section_idx" ON "icd10_tabular_codes"("parent_id", "is_section");

-- CreateIndex
CREATE INDEX "icd10_tabular_codes_code_chapter_idx" ON "icd10_tabular_codes"("code", "is_chapter");

-- CreateIndex
CREATE INDEX "icd10_tabular_code_descriptions_description_type_idx" ON "icd10_tabular_code_descriptions"("description_type");

-- CreateIndex
CREATE INDEX "icd10_tabular_descriptions_code_type_id_idx" ON "icd10_tabular_code_descriptions"("icd10_tabular_code_id", "description_type", "id");

-- CreateIndex
CREATE UNIQUE INDEX "age_specific_cpt_rules_cpt_code_key" ON "age_specific_cpt_rules"("cpt_code");

-- CreateIndex
CREATE INDEX "age_specific_cpt_rules_cpt_code_idx" ON "age_specific_cpt_rules"("cpt_code");

-- CreateIndex
CREATE UNIQUE INDEX "age_specific_icd_rules_icd_code_key" ON "age_specific_icd_rules"("icd_code");

-- CreateIndex
CREATE UNIQUE INDEX "gender_specific_cpt_rules_cpt_code_key" ON "gender_specific_cpt_rules"("cpt_code");

-- CreateIndex
CREATE INDEX "gender_specific_cpt_rules_cpt_code_idx" ON "gender_specific_cpt_rules"("cpt_code");

-- CreateIndex
CREATE INDEX "icd_gender_specific_rules_icd_code_idx" ON "icd_gender_specific_rules"("icd_code");

-- CreateIndex
CREATE INDEX "icd_gender_specific_rules_gender_idx" ON "icd_gender_specific_rules"("gender");

-- CreateIndex
CREATE INDEX "icd_gender_specific_rules_is_active_idx" ON "icd_gender_specific_rules"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "icd_gender_specific_rules_unique_code_gender" ON "icd_gender_specific_rules"("icd_code", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "cpt_codes_name_key" ON "cpt_codes"("name");

-- CreateIndex
CREATE INDEX "cpt_codes_name_idx" ON "cpt_codes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "modifiers_modifier_key" ON "modifiers"("modifier");

-- CreateIndex
CREATE INDEX "modifiers_add_dt_idx" ON "modifiers"("add_dt");

-- CreateIndex
CREATE INDEX "modifiers_act_eff_dt_idx" ON "modifiers"("act_eff_dt");

-- CreateIndex
CREATE INDEX "modifiers_term_dt_idx" ON "modifiers"("term_dt");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_sequences_modifier_key" ON "modifier_sequences"("modifier");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_sequences_sequence_order_key" ON "modifier_sequences"("sequence_order");

-- CreateIndex
CREATE INDEX "cpt_modifier_rules_cpt_code_idx" ON "cpt_modifier_rules"("cpt_code");

-- CreateIndex
CREATE INDEX "cpt_modifier_rules_modifier_code_idx" ON "cpt_modifier_rules"("modifier_code");

-- CreateIndex
CREATE UNIQUE INDEX "cpt_mod_payer_unique" ON "cpt_modifier_rules"("cpt_code", "modifier_code", "payer_id");

-- CreateIndex
CREATE INDEX "cpt_pos_rules_cpt_code_idx" ON "cpt_pos_rules"("cpt_code");

-- CreateIndex
CREATE INDEX "cpt_pos_rules_pos_code_idx" ON "cpt_pos_rules"("pos_code");

-- CreateIndex
CREATE UNIQUE INDEX "cpt_pos_payer_unique" ON "cpt_pos_rules"("cpt_code", "pos_code", "payer_id");

-- CreateIndex
CREATE INDEX "icd10_body_sidewise_code_idx" ON "icd10_body_sidewise"("code");

-- CreateIndex
CREATE INDEX "icd10_body_sidewise_side_idx" ON "icd10_body_sidewise"("side");

-- CreateIndex
CREATE INDEX "icd10_body_sidewise_code_side_index" ON "icd10_body_sidewise"("code", "side");

-- CreateIndex
CREATE INDEX "icd10_unacceptable_principal_dx_code_index" ON "icd10_unacceptable_principal_diagnose_codes"("code");

-- CreateIndex
CREATE INDEX "icd10_unacceptable_principal_diagnose_codes_claim_type_idx" ON "icd10_unacceptable_principal_diagnose_codes"("claim_type");

-- CreateIndex
CREATE INDEX "icd10_unacceptable_principal_diagnose_codes_active_idx" ON "icd10_unacceptable_principal_diagnose_codes"("active");

-- CreateIndex
CREATE UNIQUE INDEX "icd10_unacceptable_principal_dx_code_claim_unique" ON "icd10_unacceptable_principal_diagnose_codes"("code", "claim_type");

-- CreateIndex
CREATE INDEX "nccis_column_1_idx" ON "nccis"("column_1");

-- CreateIndex
CREATE INDEX "nccis_column_2_idx" ON "nccis"("column_2");

-- CreateIndex
CREATE INDEX "nccis_column_1_column_2_idx" ON "nccis"("column_1", "column_2");

-- CreateIndex
CREATE INDEX "nccis_modifier_index" ON "nccis"("modifier");

-- CreateIndex
CREATE INDEX "nccis_source_file_index" ON "nccis"("source_file");

-- CreateIndex
CREATE INDEX "nccis_is_active_index" ON "nccis"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "nccis_pair_date_unique" ON "nccis"("column_1", "column_2", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "mue_practitioners_cpt_code_key" ON "mue_practitioners"("cpt_code");

-- CreateIndex
CREATE INDEX "mue_practitioners_cpt_code_idx" ON "mue_practitioners"("cpt_code");

-- CreateIndex
CREATE INDEX "add_on_codes_primary_code_idx" ON "add_on_codes"("primary_code");

-- CreateIndex
CREATE INDEX "add_on_codes_add_on_code_idx" ON "add_on_codes"("add_on_code");

-- CreateIndex
CREATE INDEX "add_on_codes_primary_addon_index" ON "add_on_codes"("primary_code", "add_on_code");

-- CreateIndex
CREATE UNIQUE INDEX "zero_amount_procedures_procedure_code_key" ON "zero_amount_procedures"("procedure_code");

-- CreateIndex
CREATE INDEX "zero_amount_procedures_is_active_idx" ON "zero_amount_procedures"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "no_of_units_cpts_cpt_key" ON "no_of_units_cpts"("cpt");

-- CreateIndex
CREATE INDEX "no_of_units_cpts_is_active_idx" ON "no_of_units_cpts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "global_days_surgeries_cpt_code_key" ON "global_days_surgeries"("cpt_code");

-- CreateIndex
CREATE INDEX "global_days_surgeries_is_active_idx" ON "global_days_surgeries"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "initial_treatment_codes_code_key" ON "initial_treatment_codes"("code");

-- CreateIndex
CREATE INDEX "initial_treatment_codes_active_idx" ON "initial_treatment_codes"("active");

-- CreateIndex
CREATE UNIQUE INDEX "radiology_cpt_codes_cpt_key" ON "radiology_cpt_codes"("cpt");

-- CreateIndex
CREATE INDEX "radiology_cpt_codes_is_active_idx" ON "radiology_cpt_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "major_surgery_codes_code_key" ON "major_surgery_codes"("code");

-- CreateIndex
CREATE INDEX "major_surgery_codes_active_idx" ON "major_surgery_codes"("active");

-- CreateIndex
CREATE UNIQUE INDEX "anesthesia_codes_cpt_code_key" ON "anesthesia_codes"("cpt_code");

-- CreateIndex
CREATE INDEX "anesthesia_codes_active_idx" ON "anesthesia_codes"("active");

-- CreateIndex
CREATE UNIQUE INDEX "anesthesia_modifiers_modifier_key" ON "anesthesia_modifiers"("modifier");

-- CreateIndex
CREATE INDEX "anesthesia_modifiers_active_idx" ON "anesthesia_modifiers"("active");

-- CreateIndex
CREATE INDEX "anesthesia_codes_with_billable_modifiers_code_idx" ON "anesthesia_codes_with_billable_modifiers"("code");

-- CreateIndex
CREATE INDEX "anesthesia_codes_with_billable_modifiers_modifier_idx" ON "anesthesia_codes_with_billable_modifiers"("modifier");

-- CreateIndex
CREATE INDEX "anesthesia_codes_with_billable_modifiers_active_idx" ON "anesthesia_codes_with_billable_modifiers"("active");

-- CreateIndex
CREATE UNIQUE INDEX "anesthesia_codes_billable_modifier_unique" ON "anesthesia_codes_with_billable_modifiers"("code", "modifier");

-- CreateIndex
CREATE UNIQUE INDEX "tobacco_counseling_icd_rules_icd_code_key" ON "tobacco_counseling_icd_rules"("icd_code");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_procedures_cpt_code_key" ON "consultation_procedures"("cpt_code");

-- CreateIndex
CREATE UNIQUE INDEX "enm_procedures_cpt_code_key" ON "enm_procedures"("cpt_code");

-- CreateIndex
CREATE UNIQUE INDEX "enm_surgery_codes_cpt_code_key" ON "enm_surgery_codes"("cpt_code");

-- CreateIndex
CREATE INDEX "lab_codes_hcpcs_idx" ON "lab_codes"("hcpcs");

-- CreateIndex
CREATE INDEX "lab_codes_effective_date_idx" ON "lab_codes"("effective_date");

-- CreateIndex
CREATE INDEX "lab_codes_indicator_idx" ON "lab_codes"("indicator");

-- CreateIndex
CREATE INDEX "lab_codes_is_active_idx" ON "lab_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "lab_codes_hcpcs_modifier_key" ON "lab_codes"("hcpcs", "modifier");

-- CreateIndex
CREATE INDEX "mcr_vaccine_codes_type_idx" ON "mcr_vaccine_codes"("type");

-- CreateIndex
CREATE INDEX "mcr_vaccine_codes_vaccine_code_idx" ON "mcr_vaccine_codes"("vaccine_code");

-- CreateIndex
CREATE INDEX "mcr_vaccine_codes_icd10_code_idx" ON "mcr_vaccine_codes"("icd10_code");

-- CreateIndex
CREATE INDEX "mcr_vaccine_codes_administration_code_idx" ON "mcr_vaccine_codes"("administration_code");

-- CreateIndex
CREATE INDEX "mcr_vaccine_codes_is_active_idx" ON "mcr_vaccine_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "mcr_vaccine_codes_type_vaccine_code_key" ON "mcr_vaccine_codes"("type", "vaccine_code");

-- CreateIndex
CREATE UNIQUE INDEX "vaccine_codes_vaccine_code_key" ON "vaccine_codes"("vaccine_code");

-- CreateIndex
CREATE INDEX "vaccine_codes_component_count_idx" ON "vaccine_codes"("component_count");

-- CreateIndex
CREATE INDEX "vaccine_codes_is_active_idx" ON "vaccine_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "i_codes_hcpcs_key" ON "i_codes"("hcpcs");

-- CreateIndex
CREATE INDEX "i_codes_active_idx" ON "i_codes"("active");

-- AddForeignKey
ALTER TABLE "icd10_tabular_codes" ADD CONSTRAINT "icd10_tabular_codes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "icd10_tabular_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icd10_tabular_code_descriptions" ADD CONSTRAINT "icd10_tabular_code_descriptions_icd10_tabular_code_id_fkey" FOREIGN KEY ("icd10_tabular_code_id") REFERENCES "icd10_tabular_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
