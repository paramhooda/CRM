-- Deal documents: SoW and solution documents from presales, supplier and OEM quotes from purchase, customer RFP and PO from sales
-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CUSTOMER_RFP', 'CUSTOMER_PO', 'SOW', 'SOLUTION_DOC', 'BOQ_SHEET', 'PRESENTATION', 'SITE_SURVEY', 'SUPPLIER_QUOTE', 'OEM_QUOTE', 'OTHER');

-- CreateTable
CREATE TABLE "OpportunityDocument" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "note" TEXT,
    "presalesRequestId" TEXT,
    "pricingRequestId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityDocument_opportunityId_createdAt_idx" ON "OpportunityDocument"("opportunityId", "createdAt");

-- AddForeignKey
ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_presalesRequestId_fkey" FOREIGN KEY ("presalesRequestId") REFERENCES "PresalesRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_pricingRequestId_fkey" FOREIGN KEY ("pricingRequestId") REFERENCES "PricingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

