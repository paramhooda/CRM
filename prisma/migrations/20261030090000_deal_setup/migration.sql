-- Deal setup: which categories need presales, which OEMs run deal registration, and what presales is asked for.
ALTER TABLE "Category" ADD COLUMN "needsPresales" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Oem" ADD COLUMN "dealRegistration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN "presalesRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PresalesRequest" ADD COLUMN "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "siteDetails" TEXT,
  ADD COLUMN "assumptions" TEXT;

-- Solution categories (design and sizing needed); resale categories such as laptops and licences are left off
UPDATE "Category" c SET "needsPresales" = true
FROM "BusinessUnit" b
WHERE c."businessUnitId" = b."id"
  AND ((b."name" = 'IT Infrastructure' AND c."name" IN ('Server', 'Storage', 'Networking'))
    OR (b."name" = 'Cloud' AND c."name" <> 'Licence')
    OR b."name" = 'Services'
    OR (b."name" = 'Cybersecurity' AND c."name" <> 'Licence'));

UPDATE "Oem" SET "dealRegistration" = true
WHERE "name" IN ('HPE', 'HPI', 'Lenovo', 'Dell', 'Acer', 'VMware', 'Nutanix', 'Cisco', 'Fortinet', 'Zscaler',
  'Crowdstrike', 'Forcepoint', 'Cato', 'Seclore', 'Veeam', 'Commvault', 'Acronis');

-- Existing deals: presales is required where presales is already involved or the deal's category needs it
UPDATE "Opportunity" o SET "presalesRequired" = true
WHERE o."presalesOwnerId" IS NOT NULL
   OR EXISTS (SELECT 1 FROM "PresalesRequest" p WHERE p."opportunityId" = o."id")
   OR EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = o."categoryId" AND c."needsPresales");
