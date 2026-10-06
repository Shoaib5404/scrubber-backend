-- CreateTable
CREATE TABLE "taxonomy_codes" (
    "id" SERIAL NOT NULL,
    "taxonomy_code" VARCHAR(10) NOT NULL,
    "specialty_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxonomy_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zip_codes" (
    "id" SERIAL NOT NULL,
    "zip_code" VARCHAR(10) NOT NULL,
    "zip_code_type" VARCHAR(5),
    "city" VARCHAR(100) NOT NULL,
    "state_name" VARCHAR(100),
    "state" VARCHAR(2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zip_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_lookup" (
    "region_id" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "region_lookup_pkey" PRIMARY KEY ("region_id")
);

-- CreateTable
CREATE TABLE "state_lookup" (
    "state_id" INTEGER NOT NULL,
    "state_abbrev" VARCHAR(10) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_lookup_pkey" PRIMARY KEY ("state_id")
);

-- CreateTable
CREATE TABLE "dmerc_region_lookup" (
    "region_id" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "psc_description" VARCHAR(255),
    "mac_description" VARCHAR(255),
    "super_mac_description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dmerc_region_lookup_pkey" PRIMARY KEY ("region_id")
);

-- CreateTable
CREATE TABLE "state_x_region" (
    "id" SERIAL NOT NULL,
    "state_id" INTEGER NOT NULL,
    "region_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_x_region_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_codes_taxonomy_code_key" ON "taxonomy_codes"("taxonomy_code");

-- CreateIndex
CREATE INDEX "taxonomy_codes_is_active_idx" ON "taxonomy_codes"("is_active");

-- CreateIndex
CREATE INDEX "taxonomy_codes_specialty_name_idx" ON "taxonomy_codes"("specialty_name");

-- CreateIndex
CREATE INDEX "zip_codes_zip_code_idx" ON "zip_codes"("zip_code");

-- CreateIndex
CREATE INDEX "zip_codes_zip_code_type_idx" ON "zip_codes"("zip_code_type");

-- CreateIndex
CREATE INDEX "zip_codes_state_idx" ON "zip_codes"("state");

-- CreateIndex
CREATE INDEX "zip_codes_is_active_idx" ON "zip_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "zip_codes_zip_city_state_unique" ON "zip_codes"("zip_code", "city", "state");

-- CreateIndex
CREATE INDEX "state_x_region_state_id_idx" ON "state_x_region"("state_id");

-- CreateIndex
CREATE INDEX "state_x_region_region_id_idx" ON "state_x_region"("region_id");

-- CreateIndex
CREATE UNIQUE INDEX "state_x_region_state_id_region_id_key" ON "state_x_region"("state_id", "region_id");
