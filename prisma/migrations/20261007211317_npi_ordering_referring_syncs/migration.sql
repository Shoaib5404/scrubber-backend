-- CreateTable
CREATE TABLE "npi_ordering_referring_syncs" (
    "id" SERIAL NOT NULL,
    "dataset_release_date" DATE NOT NULL,
    "cms_release_node_id" UUID,
    "cms_file_id" UUID,
    "zip_cache_key" VARCHAR(64),
    "zip_url" TEXT,
    "source_csv_name" TEXT,
    "stored_csv_filename" TEXT NOT NULL,
    "stored_csv_path" TEXT NOT NULL,
    "file_size_bytes" INTEGER,
    "row_count" INTEGER,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "downloaded_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "npi_ordering_referring_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "npi_ordering_referring_syncs_dataset_release_date_key" ON "npi_ordering_referring_syncs"("dataset_release_date");

-- CreateIndex
CREATE INDEX "npi_ordering_referring_syncs_status_idx" ON "npi_ordering_referring_syncs"("status");
