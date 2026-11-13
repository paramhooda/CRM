-- CreateEnum
CREATE TYPE "ApproverKind" AS ENUM ('OWNER_MANAGER', 'ROLE', 'USER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "OpportunityLineItem" ADD COLUMN     "costSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DocumentLine" (
    "documentId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,

    CONSTRAINT "DocumentLine_pkey" PRIMARY KEY ("documentId","lineItemId")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "gmBelowPct" DECIMAL(5,2),
    "rateCardDiscount" BOOLEAN NOT NULL DEFAULT false,
    "minDealValue" DECIMAL(16,2),
    "businessUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRuleStep" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ApproverKind" NOT NULL,
    "role" "Role",
    "userId" TEXT,

    CONSTRAINT "ApprovalRuleStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceApproval" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "gmPct" DECIMAL(6,2),
    "totalValue" DECIMAL(16,2) NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" JSONB NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentLine_lineItemId_idx" ON "DocumentLine"("lineItemId");

-- CreateIndex
CREATE INDEX "ApprovalRuleStep_ruleId_position_idx" ON "ApprovalRuleStep"("ruleId", "position");

-- CreateIndex
CREATE INDEX "PriceApproval_opportunityId_createdAt_idx" ON "PriceApproval"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceApproval_status_idx" ON "PriceApproval"("status");

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OpportunityDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "OpportunityLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRuleStep" ADD CONSTRAINT "ApprovalRuleStep_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceApproval" ADD CONSTRAINT "PriceApproval_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The Identified stage is retired: every opportunity starts at Qualified (leads carry the qualification). Open deals
-- at Identified move to Qualified with its probability, and the move is recorded in their stage history.
INSERT INTO "StageHistory" ("id", "opportunityId", "fromStage", "toStage", "amount", "changedById", "changedAt", "daysInPrevStage", "note")
SELECT 'sh_retire_' || "id", "id", 'IDENTIFIED', 'QUALIFIED', "amount", "salesOwnerId", now(),
       GREATEST(0, EXTRACT(DAY FROM now() - "stageEnteredAt"))::int, 'Identified stage retired: opportunities start at Qualified'
FROM "Opportunity" WHERE "stage" = 'IDENTIFIED';
UPDATE "Opportunity" SET "stage" = 'QUALIFIED', "probability" = 20, "stageEnteredAt" = now() WHERE "stage" = 'IDENTIFIED';
-- Deals put on hold while Identified resume to Qualified
UPDATE "Opportunity" SET "heldFromStage" = 'QUALIFIED' WHERE "heldFromStage" = 'IDENTIFIED';
