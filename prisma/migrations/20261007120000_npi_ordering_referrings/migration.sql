-- AlterTable
CREATE TABLE "npi_ordering_referrings" (
    "id" SERIAL NOT NULL,
    "npi" VARCHAR(20) NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "npi_ordering_referrings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "npi_ordering_referrings_npi_key" ON "npi_ordering_referrings"("npi");

-- CreateIndex
CREATE INDEX "npi_ordering_referrings_npi_idx" ON "npi_ordering_referrings"("npi");

-- CreateIndex
CREATE INDEX "npi_ordering_referrings_last_name_idx" ON "npi_ordering_referrings"("last_name");
