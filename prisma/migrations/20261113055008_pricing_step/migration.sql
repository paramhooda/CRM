-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "rateCard" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "pricesReadyAt" TIMESTAMP(3);

-- The rate card applies to Cloud, NOC and SOC for now. Admins can tick it on other categories in Settings.
UPDATE "Category" SET "rateCard" = true
WHERE lower("name") IN ('noc', 'soc')
   OR "businessUnitId" IN (SELECT "id" FROM "BusinessUnit" WHERE lower("name") = 'cloud');

-- Open deals: own-brand lines costed from the rate card in any other category keep their cost, now as a presales
-- cost (presales can change it on Line items). Closed deals keep their history as it was.
UPDATE "OpportunityLineItem" li SET
  "costSource" = 'PRESALES',
  "costNote" = COALESCE(li."costNote", 'Was the rate card cost')
FROM "Opportunity" o, "Category" c
WHERE li."opportunityId" = o."id" AND li."categoryId" = c."id"
  AND li."costSource" = 'RATE_CARD' AND c."rateCard" = false
  AND o."stage" NOT IN ('WON', 'LOST', 'DROPPED');
