-- CreateEnum
CREATE TYPE "UnitScale" AS ENUM ('UN', 'MJ', 'F2');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT,
    "subscription_status" TEXT NOT NULL DEFAULT 'inactive',
    "subscription_starts_at" TIMESTAMP(3),
    "subscription_ends_at" TIMESTAMP(3),
    "remember_token" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "scopes" JSONB,
    "last_used_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_files" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "uploaded_by" INTEGER,
    "isa_sender_id" TEXT,
    "isa_receiver_id" TEXT,
    "isa_date" DATE,
    "bht_date" DATE,
    "isa_time" TIME(0),
    "isa_control_number" TEXT,
    "gs_sender_code" TEXT,
    "gs_receiver_code" TEXT,
    "gs_control_number" TEXT,
    "gs_version_code" TEXT,
    "total_claims" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valid_claims" INTEGER NOT NULL DEFAULT 0,
    "error_claims" INTEGER NOT NULL DEFAULT 0,
    "warning_claims" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "edi_validation_errors" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" SERIAL NOT NULL,
    "batch_file_id" INTEGER NOT NULL,
    "st_control_number" TEXT,
    "transaction_set_creation_date" DATE,
    "claim_id" TEXT NOT NULL,
    "billing_provider_name" TEXT,
    "billing_provider_npi" TEXT,
    "billing_provider_tax_id" TEXT,
    "billing_provider_ssn" VARCHAR(11),
    "billing_provider_taxonomy" VARCHAR(10),
    "billing_provider_upin" VARCHAR(30),
    "billing_provider_state_license" VARCHAR(50),
    "billing_provider_address" TEXT,
    "billing_provider_address_line_1" TEXT,
    "billing_provider_address_line_2" TEXT,
    "billing_provider_city" TEXT,
    "billing_provider_state" VARCHAR(2),
    "billing_provider_zip" VARCHAR(15),
    "subscriber_last_name" TEXT,
    "subscriber_first_name" TEXT,
    "subscriber_member_id" TEXT,
    "subscriber_ssn" VARCHAR(11),
    "subscriber_dob" DATE,
    "subscriber_gender" TEXT,
    "subscriber_address" TEXT,
    "subscriber_group_number" TEXT,
    "subscriber_group_name" VARCHAR(60),
    "subscriber_relationship" VARCHAR(2),
    "payer_responsibility" VARCHAR(1),
    "claim_filing_indicator" VARCHAR(2),
    "insurance_type_code" VARCHAR(3),
    "other_subscribers" JSONB,
    "patient_last_name" TEXT,
    "patient_first_name" TEXT,
    "patient_dob" DATE,
    "patient_gender" TEXT,
    "patient_relationship" TEXT,
    "patient_address" TEXT,
    "payer_name" TEXT,
    "payer_id" TEXT,
    "payer_address" TEXT,
    "rendering_provider_npi" TEXT,
    "rendering_provider_last_name" TEXT,
    "rendering_provider_first_name" TEXT,
    "rendering_provider_middle_name" TEXT,
    "rendering_provider_upin" VARCHAR(30),
    "rendering_provider_state_license" VARCHAR(50),
    "referring_provider_npi" TEXT,
    "referring_provider_last_name" TEXT,
    "referring_provider_first_name" TEXT,
    "referring_provider_middle_name" TEXT,
    "referring_provider_upin" VARCHAR(30),
    "referring_provider_state_license" VARCHAR(50),
    "facility_name" TEXT,
    "facility_npi" TEXT,
    "facility_address" TEXT,
    "total_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "place_of_service" TEXT,
    "frequency_code" TEXT,
    "delay_reason_code" VARCHAR(2),
    "submission_method" VARCHAR(20),
    "related_causes_code" VARCHAR(50),
    "admission_date" DATE,
    "discharge_date" DATE,
    "onset_of_illness_date" DATE,
    "last_menstrual_period_date" DATE,
    "initial_treatment_date" DATE,
    "last_seen_date" DATE,
    "accident_date" DATE,
    "last_xray_date" DATE,
    "hearing_vision_prescription_date" DATE,
    "disability_start_date" DATE,
    "disability_end_date" DATE,
    "last_worked_date" DATE,
    "authorized_return_to_work_date" DATE,
    "assumed_care_date" DATE,
    "relinquished_care_date" DATE,
    "original_reference_number" TEXT,
    "prior_auth_number" TEXT,
    "referral_number" TEXT,
    "clia_number" VARCHAR(20),
    "mammography_certification_number" VARCHAR(50),
    "claim_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validation_errors" JSONB,
    "is_modified" BOOLEAN NOT NULL DEFAULT false,
    "original_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_diagnoses" (
    "id" SERIAL NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "qualifier" TEXT,
    "type" TEXT NOT NULL DEFAULT 'other',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_lines" (
    "id" SERIAL NOT NULL,
    "claim_id" INTEGER NOT NULL,
    "line_number" INTEGER NOT NULL,
    "procedure_code" TEXT NOT NULL,
    "procedure_description" TEXT,
    "modifier_1" TEXT,
    "modifier_2" TEXT,
    "modifier_3" TEXT,
    "modifier_4" TEXT,
    "charge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "units" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_scale" "UnitScale" NOT NULL DEFAULT 'UN',
    "service_date_from" DATE,
    "service_date_to" DATE,
    "place_of_service" TEXT,
    "diagnosis_pointers" JSONB,
    "rendering_provider_npi" TEXT,
    "referring_provider_npi" TEXT,
    "referring_provider_last_name" TEXT,
    "referring_provider_first_name" TEXT,
    "referring_provider_middle_name" TEXT,
    "other_payer_paid_amount" DECIMAL(12,2),
    "reference_id" TEXT,
    "ndc_code" TEXT,
    "ndc_quantity" DECIMAL(12,3),
    "ndc_unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validation_errors" JSONB,
    "is_modified" BOOLEAN NOT NULL DEFAULT false,
    "original_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edi_upload_error_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "batch_file_id" INTEGER,
    "failed_job_uuid" TEXT,
    "original_filename" TEXT,
    "file_size" INTEGER,
    "source" VARCHAR(20) NOT NULL DEFAULT 'web',
    "status" VARCHAR(20) NOT NULL DEFAULT 'failed',
    "error_type" VARCHAR(40),
    "error_message" TEXT,
    "total_claims" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edi_upload_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_subscription_status_idx" ON "users"("subscription_status");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_key" ON "role_permissions"("role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_user_id_key" ON "api_clients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_client_id_key" ON "api_clients"("client_id");

-- CreateIndex
CREATE INDEX "api_clients_user_id_is_active_idx" ON "api_clients"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "batch_files_status_idx" ON "batch_files"("status");

-- CreateIndex
CREATE INDEX "batch_files_isa_control_number_idx" ON "batch_files"("isa_control_number");

-- CreateIndex
CREATE INDEX "batch_files_created_at_idx" ON "batch_files"("created_at");

-- CreateIndex
CREATE INDEX "claims_claim_id_idx" ON "claims"("claim_id");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "claims_subscriber_member_id_idx" ON "claims"("subscriber_member_id");

-- CreateIndex
CREATE INDEX "claims_billing_provider_npi_idx" ON "claims"("billing_provider_npi");

-- CreateIndex
CREATE INDEX "claims_payer_id_idx" ON "claims"("payer_id");

-- CreateIndex
CREATE INDEX "claims_claim_filing_indicator_idx" ON "claims"("claim_filing_indicator");

-- CreateIndex
CREATE INDEX "claim_diagnoses_code_idx" ON "claim_diagnoses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "claim_diagnoses_claim_id_sequence_key" ON "claim_diagnoses"("claim_id", "sequence");

-- CreateIndex
CREATE INDEX "service_lines_procedure_code_idx" ON "service_lines"("procedure_code");

-- CreateIndex
CREATE INDEX "service_lines_service_date_from_idx" ON "service_lines"("service_date_from");

-- CreateIndex
CREATE UNIQUE INDEX "service_lines_claim_id_line_number_key" ON "service_lines"("claim_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "edi_upload_error_logs_failed_job_uuid_key" ON "edi_upload_error_logs"("failed_job_uuid");

-- CreateIndex
CREATE INDEX "edi_upload_error_logs_user_id_created_at_idx" ON "edi_upload_error_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "edi_upload_error_logs_user_id_error_type_idx" ON "edi_upload_error_logs"("user_id", "error_type");

-- CreateIndex
CREATE INDEX "edi_upload_error_logs_user_id_status_idx" ON "edi_upload_error_logs"("user_id", "status");

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_files" ADD CONSTRAINT "batch_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_batch_file_id_fkey" FOREIGN KEY ("batch_file_id") REFERENCES "batch_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_diagnoses" ADD CONSTRAINT "claim_diagnoses_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_lines" ADD CONSTRAINT "service_lines_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edi_upload_error_logs" ADD CONSTRAINT "edi_upload_error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edi_upload_error_logs" ADD CONSTRAINT "edi_upload_error_logs_batch_file_id_fkey" FOREIGN KEY ("batch_file_id") REFERENCES "batch_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
