-- OEM moves to line items: every deal carries at least one line.
ALTER TABLE "OpportunityLineItem" ADD COLUMN "isEstimate" BOOLEAN NOT NULL DEFAULT false;

-- Deals without lines get one estimate line built from the header, so value and OEM are preserved.
-- Header OEM may be empty on old deals: fall back to the first OEM named "Other" (or any OEM).
INSERT INTO "OpportunityLineItem" (
  "id", "opportunityId", "lineNo", "businessUnitId", "categoryId", "oemId", "description", "isEstimate",
  "quantity", "unit", "billingFrequency", "unitPrice", "createdAt", "updatedAt"
)
SELECT
  'est_' || o."id", o."id", 1, o."businessUnitId", o."categoryId",
  COALESCE(o."oemId", (SELECT "id" FROM "Oem" ORDER BY ("name" = 'Other') DESC, "name" LIMIT 1)),
  'Estimate · ' || COALESCE(oem."name", 'OEM to confirm') || ' · ' || cat."name", true,
  1, 'Lot', 'ONE_TIME', o."amount", NOW(), NOW()
FROM "Opportunity" o
JOIN "Category" cat ON cat."id" = o."categoryId"
LEFT JOIN "Oem" oem ON oem."id" = o."oemId"
WHERE NOT EXISTS (SELECT 1 FROM "OpportunityLineItem" l WHERE l."opportunityId" = o."id")
  AND EXISTS (SELECT 1 FROM "Oem");

-- The header OEM is now derived from the largest line; fill it where it was missing
UPDATE "Opportunity" o SET "oemId" = l."oemId"
FROM "OpportunityLineItem" l
WHERE o."oemId" IS NULL AND l."opportunityId" = o."id" AND l."lineNo" = 1;
