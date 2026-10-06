-- CreateTable
CREATE TABLE "article_type_lookup" (
    "article_type_id" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_type_lookup_pkey" PRIMARY KEY ("article_type_id")
);

-- CreateTable
CREATE TABLE "article_url_type_lookup" (
    "url_type_id" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "sort_order" INTEGER,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_url_type_lookup_pkey" PRIMARY KEY ("url_type_id")
);

-- CreateTable
CREATE TABLE "contractor_type_lookup" (
    "contractor_type_id" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_type_lookup_pkey" PRIMARY KEY ("contractor_type_id")
);

-- CreateTable
CREATE TABLE "contractor_subtype_lookup" (
    "contractor_subtype_id" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_subtype_lookup_pkey" PRIMARY KEY ("contractor_subtype_id")
);

-- CreateTable
CREATE TABLE "update_period" (
    "period_id" INTEGER NOT NULL,
    "begin_date" TIMESTAMP(3),
    "dis_end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "update_period_pkey" PRIMARY KEY ("period_id")
);

-- CreateTable
CREATE TABLE "contractor" (
    "id" SERIAL NOT NULL,
    "contractor_id" INTEGER NOT NULL,
    "contractor_type_id" INTEGER NOT NULL,
    "contractor_version" INTEGER NOT NULL,
    "contractor_bus_name" VARCHAR(255),
    "contractor_number" VARCHAR(50),
    "dmerc_rgn" INTEGER,
    "address1" VARCHAR(255),
    "address2" VARCHAR(255),
    "address3" VARCHAR(255),
    "city" VARCHAR(255),
    "state_id" INTEGER,
    "zipcode" VARCHAR(20),
    "phone" VARCHAR(50),
    "fax" VARCHAR(50),
    "status" VARCHAR(10),
    "last_updated" TIMESTAMP(3),
    "url" VARCHAR(500),
    "email" VARCHAR(255),
    "ignore" VARCHAR(10),
    "status_flag" VARCHAR(10),
    "cmd_name" VARCHAR(255),
    "cmd_title" VARCHAR(255),
    "contractor_subtype_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "article_type" INTEGER,
    "title" TEXT,
    "article_pub_date" TIMESTAMP(3),
    "article_eff_date" TIMESTAMP(3),
    "article_end_date" TIMESTAMP(3),
    "description" TEXT,
    "other_comments" TEXT,
    "sad_url" TEXT,
    "status" VARCHAR(50),
    "last_updated" TIMESTAMP(3),
    "history_exp" TEXT,
    "key_article" VARCHAR(10),
    "icd9_covered_para" TEXT,
    "icd9_noncovered_para" TEXT,
    "revenue_para" TEXT,
    "thirty_percent" VARCHAR(10),
    "article_rev_end_date" TIMESTAMP(3),
    "source_article_id" INTEGER,
    "date_retired" TIMESTAMP(3),
    "keywords" TEXT,
    "icd10_doc" TEXT,
    "add_icd10_info" TEXT,
    "cms_cov_policy" TEXT,
    "display_id" VARCHAR(50),
    "reference_article" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_jurisdiction" (
    "id" SERIAL NOT NULL,
    "contractor_id" INTEGER NOT NULL,
    "contractor_type_id" INTEGER NOT NULL,
    "contractor_version" INTEGER NOT NULL,
    "state_id" INTEGER NOT NULL,
    "last_updated" TIMESTAMP(3),
    "active_date" TIMESTAMP(3),
    "term_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_oversight" (
    "id" SERIAL NOT NULL,
    "contractor_id" INTEGER NOT NULL,
    "contractor_type_id" INTEGER NOT NULL,
    "contractor_version" INTEGER NOT NULL,
    "region_id" INTEGER NOT NULL,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_oversight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_future_retire" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "retire_dt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_future_retire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_related_documents" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "related_num" INTEGER NOT NULL,
    "r_article_id" INTEGER,
    "r_article_version" INTEGER,
    "r_lcd_id" INTEGER,
    "r_lcd_version" INTEGER,
    "r_contractor_id" INTEGER,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_related_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_related_ncd_documents" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "related_num" INTEGER NOT NULL,
    "r_ncd_id" INTEGER,
    "r_ncd_version" INTEGER,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_related_ncd_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_related_source_icd9" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "related_num" INTEGER NOT NULL,
    "source_article_id" INTEGER,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_related_source_icd9_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_bill_code" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "bill_code_id" VARCHAR(10) NOT NULL,
    "bill_code_version" INTEGER,
    "last_updated" TIMESTAMP(3),
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_bill_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_code_table" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "article_type" INTEGER,
    "code_table_row" INTEGER,
    "brand_name" VARCHAR(500),
    "eff_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "comments" TEXT,
    "hcpc_code_id" VARCHAR(10),
    "hcpc_code_version" INTEGER,
    "last_updated" TIMESTAMP(3),
    "short_description" VARCHAR(500),
    "long_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_code_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_contractor" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "article_type" INTEGER,
    "contractor_id" INTEGER NOT NULL,
    "contractor_type_id" INTEGER,
    "contractor_version" INTEGER,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_hcpc_code" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "hcpc_code_id" VARCHAR(10) NOT NULL,
    "hcpc_code_version" INTEGER,
    "hcpc_code_group" INTEGER,
    "range" VARCHAR(1),
    "last_updated" TIMESTAMP(3),
    "long_description" TEXT,
    "short_description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_hcpc_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_hcpc_code_group" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "hcpc_code_group" INTEGER NOT NULL,
    "paragraph" TEXT,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_hcpc_code_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_hcpc_modifier" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "hcpc_modifier_code_id" VARCHAR(10) NOT NULL,
    "hcpc_modifier_code_version" INTEGER,
    "hcpc_modifier_group" INTEGER,
    "last_updated" TIMESTAMP(3),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_hcpc_modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_hcpc_modifier_group" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "hcpc_modifier_group" INTEGER NOT NULL,
    "paragraph" TEXT,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_hcpc_modifier_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_icd10_covered" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "icd10_code_id" VARCHAR(10) NOT NULL,
    "icd10_code_version" INTEGER,
    "icd10_covered_group" INTEGER,
    "range" VARCHAR(1),
    "last_updated" TIMESTAMP(3),
    "sort_order" INTEGER,
    "description" TEXT,
    "asterisk" VARCHAR(1),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_icd10_covered_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_icd10_covered_group" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "icd10_covered_group" INTEGER NOT NULL,
    "paragraph" TEXT,
    "last_updated" TIMESTAMP(3),
    "icd10_covered_ast" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_icd10_covered_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_icd10_noncovered" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "icd10_code_id" VARCHAR(10) NOT NULL,
    "icd10_code_version" INTEGER,
    "icd10_noncovered_group" INTEGER,
    "range" VARCHAR(1),
    "last_updated" TIMESTAMP(3),
    "sort_order" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_icd10_noncovered_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_icd10_noncovered_group" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "icd10_noncovered_group" INTEGER NOT NULL,
    "paragraph" TEXT,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_icd10_noncovered_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_icd10_pcs_code" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "range" VARCHAR(1),
    "last_updated" TIMESTAMP(3),
    "sort_order" INTEGER,
    "icd10_pcs_code_id" VARCHAR(10) NOT NULL,
    "icd10_pcs_code_version" INTEGER,
    "icd10_pcs_code_group" INTEGER,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_icd10_pcs_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_icd10_pcs_code_group" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "last_updated" TIMESTAMP(3),
    "icd10_pcs_code_group" INTEGER NOT NULL,
    "paragraph" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_icd10_pcs_code_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_other_coding_group" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "other_coding_group" INTEGER NOT NULL,
    "paragraph" TEXT,
    "codes" TEXT,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_other_coding_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_primary_jurisdiction" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "state_id" INTEGER NOT NULL,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_primary_jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_response_to_comment" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "rtc_num" INTEGER NOT NULL,
    "comment" TEXT,
    "response" TEXT,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_response_to_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_revenue_code" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "revenue_code_id" VARCHAR(10) NOT NULL,
    "revenue_code_version" INTEGER,
    "range" VARCHAR(1),
    "last_updated" TIMESTAMP(3),
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_revenue_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_revision_history" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "rev_hist_num" INTEGER NOT NULL,
    "rev_hist_date" TIMESTAMP(3),
    "rev_hist_exp" TEXT,
    "last_updated" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_revision_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_sticky_note" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "sticky_note_version" INTEGER,
    "sticky_note" TEXT,
    "sticky_note_dt" TIMESTAMP(3),
    "sticky_note_posting_dt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_sticky_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_x_urls" (
    "id" SERIAL NOT NULL,
    "article_id" INTEGER NOT NULL,
    "article_version" INTEGER NOT NULL,
    "url_type_id" INTEGER NOT NULL,
    "url_id" INTEGER NOT NULL,
    "url" TEXT,
    "url_name" VARCHAR(500),
    "sort_order" INTEGER,
    "last_updated" TIMESTAMP(3),
    "url_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_x_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncd_cpt" (
    "id" SERIAL NOT NULL,
    "ncd_number" VARCHAR(32) NOT NULL,
    "ncd_description" TEXT NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "effective_date" DATE,
    "terminate_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncd_cpt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncd_icd" (
    "id" SERIAL NOT NULL,
    "icd_code" VARCHAR(20) NOT NULL,
    "ncd_cpt_id" INTEGER NOT NULL,
    "effective_date" DATE,
    "terminate_date" DATE,
    "resolution_code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncd_icd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncd_other_lab_codes" (
    "id" SERIAL NOT NULL,
    "cpt" VARCHAR(20) NOT NULL,
    "icd" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncd_other_lab_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncd_other_lab_cpt" (
    "id" SERIAL NOT NULL,
    "cpt_code" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncd_other_lab_cpt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncd_other_lab_icd" (
    "id" SERIAL NOT NULL,
    "icd_code" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ncd_other_lab_icd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractor_contractor_id_idx" ON "contractor"("contractor_id");

-- CreateIndex
CREATE INDEX "contractor_contractor_type_id_idx" ON "contractor"("contractor_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_id_type_ver_unique" ON "contractor"("contractor_id", "contractor_type_id", "contractor_version");

-- CreateIndex
CREATE INDEX "article_article_id_idx" ON "article"("article_id");

-- CreateIndex
CREATE INDEX "article_article_type_index" ON "article"("article_type");

-- CreateIndex
CREATE INDEX "article_status_index" ON "article"("status");

-- CreateIndex
CREATE INDEX "article_eff_date_index" ON "article"("article_eff_date");

-- CreateIndex
CREATE UNIQUE INDEX "article_article_id_article_version_key" ON "article"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "contractor_jurisdiction_contractor_id_idx" ON "contractor_jurisdiction"("contractor_id");

-- CreateIndex
CREATE INDEX "contractor_jurisdiction_state_id_idx" ON "contractor_jurisdiction"("state_id");

-- CreateIndex
CREATE INDEX "contractor_jurisdiction_triplet_index" ON "contractor_jurisdiction"("contractor_id", "contractor_type_id", "contractor_version");

-- CreateIndex
CREATE INDEX "contractor_oversight_contractor_id_idx" ON "contractor_oversight"("contractor_id");

-- CreateIndex
CREATE INDEX "contractor_oversight_region_id_idx" ON "contractor_oversight"("region_id");

-- CreateIndex
CREATE INDEX "article_future_retire_article_id_idx" ON "article_future_retire"("article_id");

-- CreateIndex
CREATE INDEX "article_related_documents_article_id_idx" ON "article_related_documents"("article_id");

-- CreateIndex
CREATE INDEX "article_related_documents_show_index" ON "article_related_documents"("article_id", "article_version", "related_num");

-- CreateIndex
CREATE INDEX "article_related_ncd_documents_article_id_idx" ON "article_related_ncd_documents"("article_id");

-- CreateIndex
CREATE INDEX "article_related_ncd_documents_show_index" ON "article_related_ncd_documents"("article_id", "article_version", "related_num");

-- CreateIndex
CREATE INDEX "article_related_source_icd9_article_id_idx" ON "article_related_source_icd9"("article_id");

-- CreateIndex
CREATE INDEX "article_x_bill_code_article_id_idx" ON "article_x_bill_code"("article_id");

-- CreateIndex
CREATE INDEX "article_x_bill_code_article_pair_index" ON "article_x_bill_code"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_code_table_article_id_idx" ON "article_x_code_table"("article_id");

-- CreateIndex
CREATE INDEX "article_x_code_table_article_pair_index" ON "article_x_code_table"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_code_table_row_index" ON "article_x_code_table"("code_table_row");

-- CreateIndex
CREATE INDEX "article_x_contractor_article_id_idx" ON "article_x_contractor"("article_id");

-- CreateIndex
CREATE INDEX "article_x_contractor_contractor_id_idx" ON "article_x_contractor"("contractor_id");

-- CreateIndex
CREATE INDEX "article_x_contractor_article_pair_index" ON "article_x_contractor"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_contractor_contractor_triplet_index" ON "article_x_contractor"("contractor_id", "contractor_type_id", "contractor_version");

-- CreateIndex
CREATE INDEX "article_x_hcpc_code_article_id_idx" ON "article_x_hcpc_code"("article_id");

-- CreateIndex
CREATE INDEX "article_x_hcpc_code_hcpc_code_id_idx" ON "article_x_hcpc_code"("hcpc_code_id");

-- CreateIndex
CREATE INDEX "article_x_hcpc_code_article_pair_index" ON "article_x_hcpc_code"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_hcpc_code_group_article_id_idx" ON "article_x_hcpc_code_group"("article_id");

-- CreateIndex
CREATE INDEX "article_x_hcpc_code_group_article_pair_index" ON "article_x_hcpc_code_group"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_hcpc_modifier_article_id_idx" ON "article_x_hcpc_modifier"("article_id");

-- CreateIndex
CREATE INDEX "article_x_hcpc_modifier_hcpc_modifier_code_id_idx" ON "article_x_hcpc_modifier"("hcpc_modifier_code_id");

-- CreateIndex
CREATE INDEX "article_x_hcpc_modifier_article_pair_index" ON "article_x_hcpc_modifier"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_hcpc_modifier_group_article_id_idx" ON "article_x_hcpc_modifier_group"("article_id");

-- CreateIndex
CREATE INDEX "article_x_hcpc_modifier_group_article_pair_index" ON "article_x_hcpc_modifier_group"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_article_id_idx" ON "article_x_icd10_covered"("article_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_icd10_code_id_idx" ON "article_x_icd10_covered"("icd10_code_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_article_pair_index" ON "article_x_icd10_covered"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_group_index" ON "article_x_icd10_covered"("icd10_covered_group");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_group_article_id_idx" ON "article_x_icd10_covered_group"("article_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_group_article_pair_index" ON "article_x_icd10_covered_group"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_covered_group_id_index" ON "article_x_icd10_covered_group"("icd10_covered_group");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_article_id_idx" ON "article_x_icd10_noncovered"("article_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_icd10_code_id_idx" ON "article_x_icd10_noncovered"("icd10_code_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_article_pair_index" ON "article_x_icd10_noncovered"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_group_index" ON "article_x_icd10_noncovered"("icd10_noncovered_group");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_group_article_id_idx" ON "article_x_icd10_noncovered_group"("article_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_group_article_pair_index" ON "article_x_icd10_noncovered_group"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_noncovered_group_id_index" ON "article_x_icd10_noncovered_group"("icd10_noncovered_group");

-- CreateIndex
CREATE INDEX "article_x_icd10_pcs_code_article_id_idx" ON "article_x_icd10_pcs_code"("article_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_pcs_code_icd10_pcs_code_id_idx" ON "article_x_icd10_pcs_code"("icd10_pcs_code_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_pcs_code_article_pair_index" ON "article_x_icd10_pcs_code"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_pcs_code_group_article_id_idx" ON "article_x_icd10_pcs_code_group"("article_id");

-- CreateIndex
CREATE INDEX "article_x_icd10_pcs_code_group_article_pair_index" ON "article_x_icd10_pcs_code_group"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_icd10_pcs_code_group_id_index" ON "article_x_icd10_pcs_code_group"("icd10_pcs_code_group");

-- CreateIndex
CREATE INDEX "article_x_other_coding_group_article_id_idx" ON "article_x_other_coding_group"("article_id");

-- CreateIndex
CREATE INDEX "article_x_other_coding_group_article_pair_index" ON "article_x_other_coding_group"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_primary_jurisdiction_article_id_idx" ON "article_x_primary_jurisdiction"("article_id");

-- CreateIndex
CREATE INDEX "article_x_primary_jurisdiction_state_id_idx" ON "article_x_primary_jurisdiction"("state_id");

-- CreateIndex
CREATE INDEX "article_x_response_to_comment_article_id_idx" ON "article_x_response_to_comment"("article_id");

-- CreateIndex
CREATE INDEX "article_x_response_to_comment_article_pair_index" ON "article_x_response_to_comment"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_revenue_code_article_id_idx" ON "article_x_revenue_code"("article_id");

-- CreateIndex
CREATE INDEX "article_x_revenue_code_revenue_code_id_idx" ON "article_x_revenue_code"("revenue_code_id");

-- CreateIndex
CREATE INDEX "article_x_revenue_code_article_pair_index" ON "article_x_revenue_code"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_revision_history_article_id_idx" ON "article_x_revision_history"("article_id");

-- CreateIndex
CREATE INDEX "article_x_revision_history_article_pair_index" ON "article_x_revision_history"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_revision_history_rev_hist_num_index" ON "article_x_revision_history"("rev_hist_num");

-- CreateIndex
CREATE INDEX "article_x_sticky_note_article_id_idx" ON "article_x_sticky_note"("article_id");

-- CreateIndex
CREATE INDEX "article_x_sticky_note_article_pair_index" ON "article_x_sticky_note"("article_id", "article_version");

-- CreateIndex
CREATE INDEX "article_x_urls_article_id_idx" ON "article_x_urls"("article_id");

-- CreateIndex
CREATE INDEX "article_x_urls_url_type_id_idx" ON "article_x_urls"("url_type_id");

-- CreateIndex
CREATE INDEX "article_x_urls_show_order_index" ON "article_x_urls"("article_id", "article_version", "url_type_id", "sort_order");

-- CreateIndex
CREATE INDEX "ncd_cpt_ncd_number_idx" ON "ncd_cpt"("ncd_number");

-- CreateIndex
CREATE INDEX "ncd_cpt_cpt_code_idx" ON "ncd_cpt"("cpt_code");

-- CreateIndex
CREATE INDEX "ncd_icd_icd_code_idx" ON "ncd_icd"("icd_code");

-- CreateIndex
CREATE INDEX "ncd_other_lab_codes_cpt_idx" ON "ncd_other_lab_codes"("cpt");

-- CreateIndex
CREATE INDEX "ncd_other_lab_codes_icd_idx" ON "ncd_other_lab_codes"("icd");

-- CreateIndex
CREATE INDEX "ncd_other_lab_codes_is_active_idx" ON "ncd_other_lab_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ncd_other_lab_codes_cpt_icd_key" ON "ncd_other_lab_codes"("cpt", "icd");

-- CreateIndex
CREATE UNIQUE INDEX "ncd_other_lab_cpt_cpt_code_key" ON "ncd_other_lab_cpt"("cpt_code");

-- CreateIndex
CREATE INDEX "ncd_other_lab_cpt_cpt_code_idx" ON "ncd_other_lab_cpt"("cpt_code");

-- CreateIndex
CREATE INDEX "ncd_other_lab_cpt_is_active_idx" ON "ncd_other_lab_cpt"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ncd_other_lab_icd_icd_code_key" ON "ncd_other_lab_icd"("icd_code");

-- CreateIndex
CREATE INDEX "ncd_other_lab_icd_icd_code_idx" ON "ncd_other_lab_icd"("icd_code");

-- CreateIndex
CREATE INDEX "ncd_other_lab_icd_is_active_idx" ON "ncd_other_lab_icd"("is_active");

-- AddForeignKey
ALTER TABLE "ncd_icd" ADD CONSTRAINT "ncd_icd_ncd_cpt_id_fkey" FOREIGN KEY ("ncd_cpt_id") REFERENCES "ncd_cpt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
