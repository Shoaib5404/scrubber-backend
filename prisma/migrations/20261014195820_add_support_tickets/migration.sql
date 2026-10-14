-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "public_reference" VARCHAR(32) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "tenant_id" INTEGER,
    "requester_user_id" INTEGER,
    "requester_name" VARCHAR(255) NOT NULL,
    "requester_email" VARCHAR(255) NOT NULL,
    "requester_organization" VARCHAR(255),
    "category" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "related_batch_id" INTEGER,
    "status" VARCHAR(32) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(16) NOT NULL DEFAULT 'normal',
    "email_notify_status" VARCHAR(16),
    "attachment_object_key" VARCHAR(512),
    "attachment_original_name" VARCHAR(255),
    "attachment_mime_type" VARCHAR(128),
    "attachment_size_bytes" INTEGER,
    "attachment_uploaded_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "author_user_id" INTEGER,
    "author_type" VARCHAR(16) NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal_note" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_public_reference_key" ON "support_tickets"("public_reference");

-- CreateIndex
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_category_created_at_idx" ON "support_tickets"("category", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_requester_email_idx" ON "support_tickets"("requester_email");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_created_at_idx" ON "support_tickets"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
