-- CreateTable
CREATE TABLE "tenants" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "subscription_status" TEXT NOT NULL DEFAULT 'inactive',
    "subscription_starts_at" TIMESTAMP(3),
    "subscription_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invites" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "email_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_invites_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "tenant_id" INTEGER;

-- AlterTable
ALTER TABLE "api_clients" ADD COLUMN "tenant_id" INTEGER;

-- AlterTable
ALTER TABLE "batch_files" ADD COLUMN "tenant_id" INTEGER;

-- AlterTable
ALTER TABLE "edi_upload_error_logs" ADD COLUMN "tenant_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_subscription_status_idx" ON "tenants"("subscription_status");

-- CreateIndex
CREATE INDEX "tenant_invites_tenant_id_email_idx" ON "tenant_invites"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "tenant_invites_token_hash_idx" ON "tenant_invites"("token_hash");

-- CreateIndex
CREATE INDEX "tenant_invites_expires_at_idx" ON "tenant_invites"("expires_at");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "api_clients_tenant_id_is_active_idx" ON "api_clients"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "batch_files_tenant_id_created_at_idx" ON "batch_files"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "edi_upload_error_logs_tenant_id_created_at_idx" ON "edi_upload_error_logs"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_files" ADD CONSTRAINT "batch_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edi_upload_error_logs" ADD CONSTRAINT "edi_upload_error_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
