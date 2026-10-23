-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('HARDWARE', 'SOFTWARE_LICENCE', 'SUBSCRIPTION', 'SERVICE', 'SUPPORT_AMC');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "LineBillingStatus" AS ENUM ('NOT_READY', 'READY', 'SENT', 'INVOICED');

-- DropForeignKey
ALTER TABLE "OpportunityLineItem" DROP CONSTRAINT "OpportunityLineItem_businessUnitId_fkey";

-- DropForeignKey
ALTER TABLE "OpportunityLineItem" DROP CONSTRAINT "OpportunityLineItem_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "OpportunityLineItem" DROP CONSTRAINT "OpportunityLineItem_oemId_fkey";

-- AlterTable: add billing-ready columns
ALTER TABLE "OpportunityLineItem"
ADD COLUMN     "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "billingStartDate" TIMESTAMP(3),
ADD COLUMN     "billingStatus" "LineBillingStatus" NOT NULL DEFAULT 'NOT_READY',
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "gstRatePct" DECIMAL(5,2),
ADD COLUMN     "hsnSac" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "productCode" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "productName" TEXT;

-- Data: recurring lines were billed monthly
UPDATE "OpportunityLineItem" SET "billingFrequency" = 'MONTHLY' WHERE "recurring" = true;

-- Data: every line must carry BU, category and OEM; fill gaps from the opportunity header
UPDATE "OpportunityLineItem" li SET "businessUnitId" = o."businessUnitId"
  FROM "Opportunity" o WHERE li."opportunityId" = o."id" AND li."businessUnitId" IS NULL;
UPDATE "OpportunityLineItem" li SET "categoryId" = o."categoryId"
  FROM "Opportunity" o WHERE li."opportunityId" = o."id" AND li."categoryId" IS NULL;
UPDATE "OpportunityLineItem" li SET "oemId" = o."oemId"
  FROM "Opportunity" o WHERE li."opportunityId" = o."id" AND li."oemId" IS NULL AND o."oemId" IS NOT NULL;
UPDATE "OpportunityLineItem" SET "oemId" = (SELECT "id" FROM "Oem" ORDER BY "sortOrder" LIMIT 1) WHERE "oemId" IS NULL;

-- AlterTable: drop the old flag and enforce classification
ALTER TABLE "OpportunityLineItem" DROP COLUMN "recurring",
ALTER COLUMN "businessUnitId" SET NOT NULL,
ALTER COLUMN "categoryId" SET NOT NULL,
ALTER COLUMN "oemId" SET NOT NULL;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "businessUnitId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "oemId" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',
    "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'ONE_TIME',
    "defaultTermMonths" INTEGER,
    "listPrice" DECIMAL(16,2),
    "standardCost" DECIMAL(16,2),
    "hsnSac" TEXT NOT NULL,
    "gstRatePct" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_oemId_idx" ON "Product"("oemId");

-- CreateIndex
CREATE INDEX "Product_businessUnitId_categoryId_idx" ON "Product"("businessUnitId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE INDEX "IntegrationEvent_processedAt_createdAt_idx" ON "IntegrationEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_aggregateType_aggregateId_idx" ON "IntegrationEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "OpportunityLineItem_productId_idx" ON "OpportunityLineItem"("productId");

-- CreateIndex
CREATE INDEX "OpportunityLineItem_oemId_idx" ON "OpportunityLineItem"("oemId");

-- CreateIndex
CREATE INDEX "OpportunityLineItem_businessUnitId_categoryId_idx" ON "OpportunityLineItem"("businessUnitId", "categoryId");

-- CreateIndex
CREATE INDEX "OpportunityLineItem_billingStatus_idx" ON "OpportunityLineItem"("billingStatus");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_oemId_fkey" FOREIGN KEY ("oemId") REFERENCES "Oem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_oemId_fkey" FOREIGN KEY ("oemId") REFERENCES "Oem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

