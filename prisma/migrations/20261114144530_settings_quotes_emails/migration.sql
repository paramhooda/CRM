-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deal_id" UUID NOT NULL,
    "quote_no" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "valid_until" DATE NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(16,2) NOT NULL,
    "document_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deal_id" UUID NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "to" TEXT[],
    "cc" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "document_ids" UUID[],
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_no_key" ON "quotes"("quote_no");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_document_id_key" ON "quotes"("document_id");

-- CreateIndex
CREATE INDEX "quotes_deal_id_idx" ON "quotes"("deal_id");

-- CreateIndex
CREATE INDEX "deal_emails_deal_id_idx" ON "deal_emails"("deal_id");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "deal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_emails" ADD CONSTRAINT "deal_emails_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_emails" ADD CONSTRAINT "deal_emails_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: the two example approval rules start switched off (the owner enables them when the process is set),
-- and the Quotation document kind exists for generated quotes.
UPDATE "approval_rules" SET "is_active" = false WHERE "name" IN ('Low margin: GM below 12%', 'Large deal: ₹1 Cr or more');
INSERT INTO "document_kinds" ("id", "name", "restricted_to_sales", "required_at_won", "is_active", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Quotation', true, false, true, 7, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "document_kinds" WHERE "name" = 'Quotation');
