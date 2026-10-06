-- CreateTable
CREATE TABLE "ndc_codes" (
    "id" SERIAL NOT NULL,
    "ndc" VARCHAR(15) NOT NULL,
    "ndc_digits" VARCHAR(11) NOT NULL,
    "package_description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ndc_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ndc_hcpcs_crosswalk" (
    "id" SERIAL NOT NULL,
    "ndc" VARCHAR(20) NOT NULL,
    "hcpcs" VARCHAR(10) NOT NULL,
    "ndc_label" TEXT,
    "hcpcs_amount" DECIMAL(12,4),
    "hcpcs_measure" VARCHAR(20),
    "package_item_count" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ndc_hcpcs_crosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cigna_cpt_icd_crosswalk" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "icd_code" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cigna_cpt_icd_crosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uhc_pos_crosswalk" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "pos_code" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uhc_pos_crosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uhc_authorizations" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "condition" VARCHAR(64) NOT NULL,
    "condition_values" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uhc_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aetna_fetal_lcd" (
    "id" SERIAL NOT NULL,
    "icd" VARCHAR(20) NOT NULL,
    "cpt" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aetna_fetal_lcd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aetna_b12_lcd" (
    "id" SERIAL NOT NULL,
    "icd" VARCHAR(20) NOT NULL,
    "cpt" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aetna_b12_lcd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bcbs_claim_routings" (
    "id" SERIAL NOT NULL,
    "prefix" VARCHAR(10) NOT NULL,
    "payer_id" VARCHAR(20) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bcbs_claim_routings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mue_87726_uhc_06111_oxford" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mue_87726_uhc_06111_oxford_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ndc_codes_ndc_key" ON "ndc_codes"("ndc");

-- CreateIndex
CREATE UNIQUE INDEX "ndc_codes_ndc_digits_key" ON "ndc_codes"("ndc_digits");

-- CreateIndex
CREATE INDEX "ndc_codes_is_active_idx" ON "ndc_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ndc_hcpcs_crosswalk_ndc_hcpcs_key" ON "ndc_hcpcs_crosswalk"("ndc", "hcpcs");

-- CreateIndex
CREATE INDEX "cigna_cpt_icd_crosswalk_cpt_code_idx" ON "cigna_cpt_icd_crosswalk"("cpt_code");

-- CreateIndex
CREATE INDEX "cigna_cpt_icd_crosswalk_icd_code_idx" ON "cigna_cpt_icd_crosswalk"("icd_code");

-- CreateIndex
CREATE UNIQUE INDEX "cigna_cpt_icd_crosswalk_cpt_code_icd_code_key" ON "cigna_cpt_icd_crosswalk"("cpt_code", "icd_code");

-- CreateIndex
CREATE UNIQUE INDEX "uhc_pos_crosswalk_cpt_code_pos_code_key" ON "uhc_pos_crosswalk"("cpt_code", "pos_code");

-- CreateIndex
CREATE INDEX "uhc_authorizations_cpt_code_idx" ON "uhc_authorizations"("cpt_code");

-- CreateIndex
CREATE INDEX "uhc_authorizations_condition_idx" ON "uhc_authorizations"("condition");

-- CreateIndex
CREATE INDEX "uhc_authorizations_is_active_idx" ON "uhc_authorizations"("is_active");

-- CreateIndex
CREATE INDEX "aetna_fetal_lcd_icd_idx" ON "aetna_fetal_lcd"("icd");

-- CreateIndex
CREATE INDEX "aetna_fetal_lcd_cpt_idx" ON "aetna_fetal_lcd"("cpt");

-- CreateIndex
CREATE UNIQUE INDEX "aetna_fetal_lcd_cpt_icd_key" ON "aetna_fetal_lcd"("cpt", "icd");

-- CreateIndex
CREATE INDEX "aetna_b12_lcd_icd_idx" ON "aetna_b12_lcd"("icd");

-- CreateIndex
CREATE INDEX "aetna_b12_lcd_cpt_idx" ON "aetna_b12_lcd"("cpt");

-- CreateIndex
CREATE UNIQUE INDEX "aetna_b12_lcd_cpt_icd_key" ON "aetna_b12_lcd"("cpt", "icd");

-- CreateIndex
CREATE UNIQUE INDEX "bcbs_claim_routings_prefix_payer_id_key" ON "bcbs_claim_routings"("prefix", "payer_id");

-- CreateIndex
CREATE UNIQUE INDEX "mue_87726_uhc_06111_oxford_cpt_code_key" ON "mue_87726_uhc_06111_oxford"("cpt_code");

-- CreateIndex
CREATE INDEX "mue_87726_uhc_06111_oxford_is_active_idx" ON "mue_87726_uhc_06111_oxford"("is_active");
