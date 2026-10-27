-- Cost sources: purchase prices third-party lines (each with its own supplier validity); own-brand lines are costed
-- from the rate card (catalogue standard cost) or by presales.
CREATE TYPE "CostSource" AS ENUM ('PURCHASE', 'RATE_CARD', 'PRESALES');
ALTER TABLE "Oem" ADD COLUMN "ownBrand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OpportunityLineItem" ADD COLUMN "costSource" "CostSource" NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN "costValidTill" TIMESTAMP(3),
  ADD COLUMN "costNote" TEXT;

UPDATE "Oem" SET "ownBrand" = true WHERE "name" IN ('Progression', 'Neon Cloud');

-- Own-brand lines: rate card when the catalogue has a standard cost, otherwise presales costs them
UPDATE "OpportunityLineItem" l SET "costSource" = CASE
    WHEN EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = l."productId" AND p."standardCost" IS NOT NULL) THEN 'RATE_CARD'::"CostSource"
    ELSE 'PRESALES'::"CostSource" END
WHERE l."oemId" IN (SELECT "id" FROM "Oem" WHERE "ownBrand");

-- Supplier validity moves to each purchase line: start from the deal's latest completed pricing request
UPDATE "OpportunityLineItem" l SET "costValidTill" = r."quoteValidTill"
FROM (
  SELECT DISTINCT ON ("opportunityId") "opportunityId", "quoteValidTill"
  FROM "PricingRequest" WHERE "status" = 'QUOTED' AND "quoteValidTill" IS NOT NULL ORDER BY "opportunityId", "quotedAt" DESC
) r
WHERE r."opportunityId" = l."opportunityId" AND l."costSource" = 'PURCHASE' AND l."unitCost" IS NOT NULL;
