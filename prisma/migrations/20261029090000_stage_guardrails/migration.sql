-- Stage guardrails: deals on hold remember why and where they resume; every stage change can carry a reason.
ALTER TABLE "Opportunity" ADD COLUMN "holdReason" TEXT, ADD COLUMN "heldFromStage" "Stage";
ALTER TABLE "StageHistory" ADD COLUMN "note" TEXT;

-- Deals already on hold resume to the stage they were in before
UPDATE "Opportunity" o SET "heldFromStage" = h."fromStage"
FROM (
  SELECT DISTINCT ON ("opportunityId") "opportunityId", "fromStage"
  FROM "StageHistory" WHERE "toStage" = 'HOLD' ORDER BY "opportunityId", "changedAt" DESC
) h
WHERE h."opportunityId" = o."id" AND o."stage" = 'HOLD' AND h."fromStage" NOT IN ('HOLD', 'WON', 'LOST', 'DROPPED');
