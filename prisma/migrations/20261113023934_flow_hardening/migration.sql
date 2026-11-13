-- AlterTable
ALTER TABLE "OpportunityLineItem" ADD COLUMN     "needsReprice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PresalesRequest" ADD COLUMN     "involved" BOOLEAN NOT NULL DEFAULT false;

-- "Duplicate" as a reason to drop a deal that was entered twice (kept out of the win rate like every Dropped deal)
INSERT INTO "PicklistValue" ("id", "type", "value", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('pl_loss_duplicate', 'LOSS_REASON', 'Duplicate', 99, true, now(), now())
ON CONFLICT ("type", "value") DO NOTHING;

-- Lines already waiting for a new cost after a change (pending, with an old cost kept for reference) are flagged, so
-- purchase must enter or confirm their cost rather than have "Pricing complete" pass the old one through
UPDATE "OpportunityLineItem" SET "needsReprice" = true
WHERE "pricingStatus" = 'PENDING' AND "unitCost" IS NOT NULL AND "isEstimate" = false AND "costSource" = 'PURCHASE';
