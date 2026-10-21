-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES_HEAD', 'SALES', 'PRESALES', 'PURCHASE');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('IDENTIFIED', 'QUALIFIED', 'BOQ', 'PROPOSAL', 'NEGOTIATION', 'HOLD', 'WON', 'LOST', 'DROPPED');

-- CreateEnum
CREATE TYPE "ForecastCategory" AS ENUM ('COMMIT', 'UPSIDE', 'PIPELINE', 'OMITTED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('NEW_LOGO', 'EXISTING');

-- CreateEnum
CREATE TYPE "RevenueModel" AS ENUM ('ONE_TIME', 'ARR');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('NEW_BUSINESS', 'UPSELL', 'CROSS_SELL', 'RENEWAL');

-- CreateEnum
CREATE TYPE "ProcurementMode" AS ENUM ('DIRECT', 'RFQ', 'RFP', 'TENDER');

-- CreateEnum
CREATE TYPE "DealRegStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HealthLabel" AS ENUM ('HOT', 'HEALTHY', 'AT_RISK', 'DYING', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'DORMANT');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('ENTERPRISE', 'MID_MARKET', 'SMB', 'GOVT_PSU');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('DECISION_MAKER', 'INFLUENCER', 'CHAMPION', 'TECHNICAL_EVALUATOR', 'PROCUREMENT', 'FINANCE', 'END_USER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'DEMO', 'SITE_VISIT', 'NOTE', 'TASK');

-- CreateEnum
CREATE TYPE "PresalesStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'BOQ_SUBMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PricingStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'QUOTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LinePricingStatus" AS ENUM ('PENDING', 'QUOTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PRESALES_REQUEST', 'BOQ_SUBMITTED', 'PRICING_REQUEST', 'PRICING_COMPLETE', 'STAGE_CHANGE', 'ASSIGNMENT', 'MENTION', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "region" TEXT,
    "managerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Oem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Oem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PicklistValue" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PicklistValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'NEW_LOGO',
    "status" "AccountStatus" NOT NULL DEFAULT 'PROSPECT',
    "segment" "Segment" NOT NULL DEFAULT 'ENTERPRISE',
    "industry" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "annualRevenueCr" DECIMAL(14,2),
    "employees" INTEGER,
    "ownerId" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "role" "ContactRole" NOT NULL DEFAULT 'INFLUENCER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "linkedin" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "source" TEXT,
    "businessUnitId" TEXT,
    "requirement" TEXT,
    "estimatedValue" DECIMAL(16,2),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT NOT NULL,
    "convertedAt" TIMESTAMP(3),
    "convertedAccountId" TEXT,
    "convertedOpportunityId" TEXT,
    "disqualifyReason" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "businessUnitId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "oemId" TEXT,
    "accountType" "AccountType" NOT NULL,
    "revenueModel" "RevenueModel" NOT NULL DEFAULT 'ONE_TIME',
    "dealType" "DealType" NOT NULL DEFAULT 'NEW_BUSINESS',
    "procurementMode" "ProcurementMode" NOT NULL DEFAULT 'DIRECT',
    "amount" DECIMAL(16,2) NOT NULL,
    "arrAmount" DECIMAL(16,2),
    "contractTermMonths" INTEGER,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "expectedMarginPct" DECIMAL(5,2),
    "stage" "Stage" NOT NULL DEFAULT 'IDENTIFIED',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "forecastCategory" "ForecastCategory" NOT NULL DEFAULT 'PIPELINE',
    "expectedCloseDate" TIMESTAMP(3) NOT NULL,
    "originalCloseDate" TIMESTAMP(3) NOT NULL,
    "closeDateSlipCount" INTEGER NOT NULL DEFAULT 0,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "salesOwnerId" TEXT NOT NULL,
    "presalesOwnerId" TEXT,
    "purchaseOwnerId" TEXT,
    "leadSource" TEXT,
    "competitors" TEXT,
    "nextStep" TEXT,
    "nextStepDate" TIMESTAMP(3),
    "submissionDueDate" TIMESTAMP(3),
    "dealRegStatus" "DealRegStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "dealRegNumber" TEXT,
    "dealRegExpiry" TIMESTAMP(3),
    "lossReason" TEXT,
    "lossNotes" TEXT,
    "poNumber" TEXT,
    "poDate" TIMESTAMP(3),
    "description" TEXT,
    "healthScore" INTEGER NOT NULL DEFAULT 50,
    "healthLabel" "HealthLabel" NOT NULL DEFAULT 'HEALTHY',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rulesEvaluatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityContact" (
    "opportunityId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "ContactRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityContact_pkey" PRIMARY KEY ("opportunityId","contactId")
);

-- CreateTable
CREATE TABLE "OpportunityLineItem" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "businessUnitId" TEXT,
    "categoryId" TEXT,
    "oemId" TEXT,
    "partNumber" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "termMonths" INTEGER,
    "unitCost" DECIMAL(16,2),
    "distributor" TEXT,
    "oemQuoteRef" TEXT,
    "leadTimeDays" INTEGER,
    "pricingStatus" "LinePricingStatus" NOT NULL DEFAULT 'PENDING',
    "unitPrice" DECIMAL(16,2),
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresalesRequest" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "status" "PresalesStatus" NOT NULL DEFAULT 'REQUESTED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scope" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "solutionSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresalesRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRequest" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "presalesRequestId" TEXT,
    "requestedById" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "status" "PricingStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "quoteValidTill" TIMESTAMP(3),
    "responseNotes" TEXT,
    "startedAt" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPrice" DECIMAL(16,2) NOT NULL,
    "totalCost" DECIMAL(16,2) NOT NULL,
    "marginPct" DECIMAL(6,2) NOT NULL,
    "validTill" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" "Stage",
    "toStage" "Stage" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daysInPrevStage" INTEGER,

    CONSTRAINT "StageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineReview" (
    "id" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "snapshot" JSONB,

    CONSTRAINT "PipelineReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "targetAmount" DECIMAL(16,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_name_key" ON "BusinessUnit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_code_key" ON "BusinessUnit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessUnitId_name_key" ON "Category"("businessUnitId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Oem_name_key" ON "Oem"("name");

-- CreateIndex
CREATE INDEX "PicklistValue_type_active_idx" ON "PicklistValue"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PicklistValue_type_value_key" ON "PicklistValue"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");

-- CreateIndex
CREATE INDEX "Account_deletedAt_idx" ON "Account"("deletedAt");

-- CreateIndex
CREATE INDEX "Contact_accountId_idx" ON "Contact"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_code_key" ON "Lead"("code");

-- CreateIndex
CREATE INDEX "Lead_ownerId_status_idx" ON "Lead"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_code_key" ON "Opportunity"("code");

-- CreateIndex
CREATE INDEX "Opportunity_stage_idx" ON "Opportunity"("stage");

-- CreateIndex
CREATE INDEX "Opportunity_salesOwnerId_idx" ON "Opportunity"("salesOwnerId");

-- CreateIndex
CREATE INDEX "Opportunity_presalesOwnerId_idx" ON "Opportunity"("presalesOwnerId");

-- CreateIndex
CREATE INDEX "Opportunity_businessUnitId_categoryId_idx" ON "Opportunity"("businessUnitId", "categoryId");

-- CreateIndex
CREATE INDEX "Opportunity_expectedCloseDate_idx" ON "Opportunity"("expectedCloseDate");

-- CreateIndex
CREATE INDEX "Opportunity_healthLabel_idx" ON "Opportunity"("healthLabel");

-- CreateIndex
CREATE INDEX "Opportunity_deletedAt_idx" ON "Opportunity"("deletedAt");

-- CreateIndex
CREATE INDEX "OpportunityLineItem_opportunityId_lineNo_idx" ON "OpportunityLineItem"("opportunityId", "lineNo");

-- CreateIndex
CREATE INDEX "PresalesRequest_assignedToId_status_idx" ON "PresalesRequest"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "PricingRequest_assignedToId_status_idx" ON "PricingRequest"("assignedToId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_code_key" ON "Quote"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_opportunityId_version_key" ON "Quote"("opportunityId", "version");

-- CreateIndex
CREATE INDEX "Activity_opportunityId_occurredAt_idx" ON "Activity"("opportunityId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_accountId_idx" ON "Activity"("accountId");

-- CreateIndex
CREATE INDEX "Activity_ownerId_dueAt_idx" ON "Activity"("ownerId", "dueAt");

-- CreateIndex
CREATE INDEX "StageHistory_opportunityId_changedAt_idx" ON "StageHistory"("opportunityId", "changedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_changedAt_idx" ON "AuditLog"("entityType", "entityId", "changedAt");

-- CreateIndex
CREATE INDEX "AuditLog_changedAt_idx" ON "AuditLog"("changedAt");

-- CreateIndex
CREATE INDEX "PipelineReview_reviewedById_reviewedAt_idx" ON "PipelineReview"("reviewedById", "reviewedAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_userId_fiscalYear_quarter_key" ON "SalesTarget"("userId", "fiscalYear", "quarter");

-- CreateIndex
CREATE INDEX "SavedView_userId_page_idx" ON "SavedView"("userId", "page");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_oemId_fkey" FOREIGN KEY ("oemId") REFERENCES "Oem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_salesOwnerId_fkey" FOREIGN KEY ("salesOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_presalesOwnerId_fkey" FOREIGN KEY ("presalesOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_purchaseOwnerId_fkey" FOREIGN KEY ("purchaseOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLineItem" ADD CONSTRAINT "OpportunityLineItem_oemId_fkey" FOREIGN KEY ("oemId") REFERENCES "Oem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesRequest" ADD CONSTRAINT "PresalesRequest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesRequest" ADD CONSTRAINT "PresalesRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresalesRequest" ADD CONSTRAINT "PresalesRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRequest" ADD CONSTRAINT "PricingRequest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRequest" ADD CONSTRAINT "PricingRequest_presalesRequestId_fkey" FOREIGN KEY ("presalesRequestId") REFERENCES "PresalesRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRequest" ADD CONSTRAINT "PricingRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRequest" ADD CONSTRAINT "PricingRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineReview" ADD CONSTRAINT "PipelineReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
