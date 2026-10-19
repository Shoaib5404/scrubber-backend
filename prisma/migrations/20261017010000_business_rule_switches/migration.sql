-- CreateTable
CREATE TABLE "business_rules" (
    "id" SERIAL NOT NULL,
    "rule_key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "default_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_rule_settings" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "scope_type" VARCHAR(16) NOT NULL,
    "scope_id" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_rule_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_rule_grants" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "granted_by" INTEGER NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_rule_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_rules_rule_key_key" ON "business_rules"("rule_key");

-- CreateIndex
CREATE INDEX "business_rules_category_idx" ON "business_rules"("category");

-- CreateIndex
CREATE INDEX "business_rule_settings_scope_type_scope_id_idx" ON "business_rule_settings"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_rule_settings_rule_id_scope_type_scope_id_key" ON "business_rule_settings"("rule_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "business_rule_grants_user_id_revoked_at_idx" ON "business_rule_grants"("user_id", "revoked_at");

-- One active grant per user.
CREATE UNIQUE INDEX "business_rule_grants_one_active" ON "business_rule_grants"("user_id") WHERE "revoked_at" IS NULL;

-- AddForeignKey
ALTER TABLE "business_rule_settings" ADD CONSTRAINT "business_rule_settings_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "business_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule_settings" ADD CONSTRAINT "business_rule_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule_grants" ADD CONSTRAINT "business_rule_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule_grants" ADD CONSTRAINT "business_rule_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
