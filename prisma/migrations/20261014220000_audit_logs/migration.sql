-- CreateTable
CREATE TABLE "audit_categories" (
    "code" VARCHAR(64) NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group_name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_categories_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" SERIAL NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category_code" VARCHAR(64) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "actor_user_id" INTEGER,
    "actor_api_client_id" INTEGER,
    "actor_role" VARCHAR(40),
    "tenant_id" INTEGER,
    "resource_type" VARCHAR(64),
    "resource_id" VARCHAR(64),
    "request_id" VARCHAR(128),
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_categories_group_name_idx" ON "audit_categories"("group_name");

-- CreateIndex
CREATE INDEX "audit_categories_enabled_idx" ON "audit_categories"("enabled");

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_occurred_at_idx" ON "audit_events"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_category_code_occurred_at_idx" ON "audit_events"("category_code", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_resource_type_resource_id_idx" ON "audit_events"("resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "audit_categories" ADD CONSTRAINT "audit_categories_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_category_code_fkey" FOREIGN KEY ("category_code") REFERENCES "audit_categories"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
