-- AlterEnum
ALTER TYPE "PresalesStatus" ADD VALUE 'NEEDS_INFO';

-- AlterEnum
ALTER TYPE "PricingStatus" ADD VALUE 'RETURNED';

-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'CHANGES_REQUESTED';

-- AlterTable
ALTER TABLE "Oem" ADD COLUMN     "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "boqVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PresalesRequest" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "infoAnswer" TEXT,
ADD COLUMN     "infoQuestion" TEXT,
ADD COLUMN     "infoRequestedAt" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SALES';

-- AlterTable
ALTER TABLE "PricingRequest" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'FULL',
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseNote" TEXT;


-- "To be decided" OEM for early estimate lines (never used on catalogue or BOQ lines)
INSERT INTO "Oem" ("id", "name", "sortOrder", "active", "isPlaceholder", "createdAt", "updatedAt")
VALUES ('oem_to_be_decided', 'To be decided', -1, true, true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE SET "isPlaceholder" = true;

-- Existing presales requests become BOQ revisions 1, 2, ... per deal
UPDATE "PresalesRequest" p SET "revision" = r.n
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "opportunityId" ORDER BY "createdAt") AS n FROM "PresalesRequest") r
WHERE r."id" = p."id";
