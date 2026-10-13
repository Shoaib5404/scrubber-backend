-- CreateTable
CREATE TABLE "tenant_features" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_features_tenant_id_enabled_idx" ON "tenant_features"("tenant_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenant_id_feature_key" ON "tenant_features"("tenant_id", "feature");

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: active tenants get all four features
INSERT INTO "tenant_features" ("tenant_id", "feature", "enabled", "created_at", "updated_at")
SELECT t."id", f.feature, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (
  VALUES ('web.upload'), ('api.access'), ('api.batches'), ('api.reference')
) AS f(feature)
WHERE t."subscription_status" = 'active'
ON CONFLICT ("tenant_id", "feature") DO NOTHING;
