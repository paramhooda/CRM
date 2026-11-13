-- AlterTable
ALTER TABLE "OpportunityLineItem" ADD COLUMN     "bundleLeadId" TEXT;

-- CreateIndex
CREATE INDEX "OpportunityLineItem_bundleLeadId_idx" ON "OpportunityLineItem"("bundleLeadId");

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_bundleLeadId_fkey" FOREIGN KEY ("bundleLeadId") REFERENCES "OpportunityLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
