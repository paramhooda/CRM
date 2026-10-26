-- Deals at BOQ whose BOQ is already with purchase (or priced, with no quote yet) are in the Pricing stage.
UPDATE "Opportunity" o
SET "stage" = 'PRICING', "probability" = 45
WHERE o."stage" = 'BOQ'
  AND NOT EXISTS (SELECT 1 FROM "PresalesRequest" p WHERE p."opportunityId" = o."id" AND p."status" IN ('REQUESTED', 'IN_PROGRESS', 'NEEDS_INFO'))
  AND EXISTS (SELECT 1 FROM "PricingRequest" r WHERE r."opportunityId" = o."id" AND r."status" IN ('REQUESTED', 'IN_PROGRESS', 'QUOTED'));
