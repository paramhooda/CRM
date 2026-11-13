# Data dictionary

Generated from `prisma/schema.prisma` by `npm run docs:dictionary`. Do not edit by hand; change the schema comments instead.

All tables have UUID primary keys, timestamps in UTC, money as decimal(16,2) in INR and soft deletes where noted (`deleted_at`). Dropdown values live in the lookup tables and are edited by administrators.

## Tables

| Table | What it holds |
|---|---|
| [`business_units`](#businessunits) | A business unit (practice): IT Infrastructure, Cloud, Services, Cybersecurity. Top of the product hierarchy. |
| [`sub_business_units`](#subbusinessunits) | A Sub BU (category) inside a business unit, for example Server under IT Infrastructure. |
| [`oems`](#oems) | A vendor whose products are sold. Not mapped to a business unit. |
| [`lead_sources`](#leadsources) | Where a lead or deal came from (OEM Referral, Distributor Referral, Existing Customer, Inbound, Outbound, Tender, Event). |
| [`segments`](#segments) | Customer segment (Enterprise, Mid-market, SMB, Government/PSU). |
| [`industries`](#industries) | Customer industry (BFSI, Manufacturing, …). |
| [`loss_reasons`](#lossreasons) | Why a deal was lost or dropped. Required when closing as lost or dropped. |
| [`document_kinds`](#documentkinds) | Kind of file attached to a deal (Customer RFP, SoW, Solution document, Supplier quote, Customer PO, Proposal, Other). |
| [`sales_methods`](#salesmethods) | How a third-party line is bought: B2B, MoQ or Stock. Not used for own-IP lines. |
| [`products`](#products) | The product catalogue. A product fixes the business unit, Sub BU and OEM of a deal line. |
| [`users`](#users) | A person who uses the CRM. Users are deactivated, never deleted. |
| [`auth_identities`](#authidentities) | A way a user signs in. One row per provider; the password hash lives here for PASSWORD. |
| [`sessions`](#sessions) | A signed-in browser session. The cookie holds a random token; only its hash is stored. |
| [`login_attempts`](#loginattempts) | Every sign-in attempt, for rate limiting and lockout. Rows older than 30 days are pruned. |
| [`sequences`](#sequences) | Counters behind record codes (ACC, LEAD, PRD, OPP-FY27). |
| [`accounts`](#accounts) | A customer or prospect company. |
| [`contacts`](#contacts) | A person at an account. |
| [`leads`](#leads) | An unqualified enquiry. Converted once into an account, a contact and a deal. |
| [`deals`](#deals) | A sale being pursued at an account. Value, cost, margin and the primary BU/OEM are derived from its lines. |
| [`deal_lines`](#deallines) | One item sold on a deal: a catalogue product or a custom item, with quantity, price and cost. |
| [`deal_stage_history`](#dealstagehistory) | Every stage change of a deal, for time-in-stage reporting. |
| [`audit_log`](#auditlog) | Who changed what and when, with the old and new value. |
| [`presales_requests`](#presalesrequests) | Sales asking presales to build the BOQ for a deal. |
| [`pricing_requests`](#pricingrequests) | Sales or presales asking purchase to price the lines of a deal. |
| [`deal_documents`](#dealdocuments) | A file attached to a deal. The content is stored in the database. |
| [`approval_rules`](#approvalrules) | An admin-defined rule saying when a deal's prices need approval, and by whom. Every condition set must hold. |
| [`approval_rule_steps`](#approvalrulesteps) | One approver in a rule's chain, in order. |
| [`deal_approvals`](#dealapprovals) | A request to approve a deal's prices, with its resolved chain of steps. |
| [`deal_approval_steps`](#dealapprovalsteps) | One step of a deal approval and its decision. |
| [`pipeline_reviews`](#pipelinereviews) | A pipeline review that was carried out, so "since last review" can be worked out per person. |
| [`sales_targets`](#salestargets) | A sales person's quarterly target. |

## business_units

A business unit (practice): IT Infrastructure, Cloud, Services, Cybersecurity. Top of the product hierarchy.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes | Permanent identifier. | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes | Display name, unique. | unique |
| `code` | text | yes | Short code used in reports (ITI, CLD, SVC, CYB), unique. | unique |
| `colour_token` | text | yes | Theme token that gives this unit its colour on tags and charts (bu-iti, bu-cloud, bu-services, bu-cyber). | default "bu-iti") @map("colour_token" |
| `is_active` | boolean | yes | Inactive values are hidden from new records but kept on old ones. | default true) @map("is_active" |
| `sort_order` | integer | yes | Order in dropdowns and charts. | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## sub_business_units

A Sub BU (category) inside a business unit, for example Server under IT Infrastructure.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `business_unit_id` | text (Uuid) | yes | The business unit this Sub BU belongs to. |  |
| `name` | text | yes | Display name, unique within its business unit. |  |
| `needs_presales` | boolean | yes | Whether deals selling this Sub BU usually need presales (suggests the deal's "needs presales" flag). | default false) @map("needs_presales" |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `businessUnit (relation)` | → BusinessUnit | yes |  |  |

Unique together: (businessUnitId, name)

## oems

A vendor whose products are sold. Not mapped to a business unit.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes | Display name, unique. | unique |
| `is_own_ip` | boolean | yes | Own IP: the OEM is Progression itself or Neon Cloud. Own-IP lines have no sales method and may be costed by presales. | default false) @map("is_own_ip" |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## lead_sources

Where a lead or deal came from (OEM Referral, Distributor Referral, Existing Customer, Inbound, Outbound, Tender, Event).

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## segments

Customer segment (Enterprise, Mid-market, SMB, Government/PSU).

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## industries

Customer industry (BFSI, Manufacturing, …).

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## loss_reasons

Why a deal was lost or dropped. Required when closing as lost or dropped.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `applies_to` | enum LossReasonAppliesTo | yes | Whether the reason is offered for Closed-Lost, Dropped, or both. Allowed values: `LOST`, `DROPPED`, `BOTH`. | default BOTH) @map("applies_to" |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## document_kinds

Kind of file attached to a deal (Customer RFP, SoW, Solution document, Supplier quote, Customer PO, Proposal, Other).

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `restricted_to_sales` | boolean | yes | Only sales roles may see documents of this kind (they carry sales prices): Customer PO, Proposal. | default false) @map("restricted_to_sales" |
| `required_at_won` | boolean | yes | A document of this kind must be attached before a deal can be closed as won: Customer PO. | default false) @map("required_at_won" |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## sales_methods

How a third-party line is bought: B2B, MoQ or Stock. Not used for own-IP lines.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |

## products

The product catalogue. A product fixes the business unit, Sub BU and OEM of a deal line.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `code` | text | yes | Product code (PRD-0001), unique. | unique |
| `name` | text | yes | Product name, unique per OEM. |  |
| `business_unit_id` | text (Uuid) | yes |  |  |
| `sub_business_unit_id` | text (Uuid) | yes |  |  |
| `oem_id` | text (Uuid) | yes |  |  |
| `unit` | text | yes | Unit of measure (Nos, Licence, Month, Pool…). | default "Nos" |
| `revenue_model` | enum RevenueModel | yes | Default revenue model for lines of this product. Allowed values: `ONE_TIME`, `ARR`. | default ONE_TIME) @map("revenue_model" |
| `default_term_months` | integer | no | Default term in months for ARR products. |  |
| `list_price` | decimal (Decimal(16, 2)) | no | Indicative list price per unit (annual for ARR), INR. |  |
| `standard_cost` | decimal (Decimal(16, 2)) | no | Standard cost per unit, used as the default purchase cost of own-IP lines, INR. |  |
| `hsn_sac` | text | no | GST classification code. |  |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `created_by_id` | text (Uuid) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no | Soft delete: when set, the product is hidden everywhere until restored. |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `businessUnit (relation)` | → BusinessUnit | yes |  |  |
| `subBusinessUnit (relation)` | → SubBusinessUnit | yes |  |  |
| `oem (relation)` | → Oem | yes |  |  |
| `createdBy (relation)` | → User | no |  |  |

Unique together: (oemId, name)

Indexes: (businessUnitId, subBusinessUnitId), (deletedAt)

## users

A person who uses the CRM. Users are deactivated, never deleted.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `full_name` | text | yes | Full name as shown in the application. |  |
| `email` | text | yes | Sign-in email, stored lower-case, unique. | unique |
| `role` | enum UserRole | yes |  Allowed values: `ADMIN`, `SALES_HEAD`, `SALES`, `PRESALES`, `PURCHASE`. |  |
| `manager_id` | text (Uuid) | no | The person this user reports to. Managers see the deals of everyone who reports to them. |  |
| `title` | text | no | Job title, for display. |  |
| `is_active` | boolean | yes | Inactive users cannot sign in and their sessions are revoked. | default true) @map("is_active" |
| `must_change_password` | boolean | yes | Set when an admin gives a temporary password; the user must choose a new one at next sign-in. | default false) @map("must_change_password" |
| `locked_until` | timestamp (UTC) (Timestamptz(6)) | no | Sign-in is refused until this time after too many failed attempts. |  |
| `last_login_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `manager (relation)` | → User | no |  |  |

Indexes: (role, isActive), (managerId)

## auth_identities

A way a user signs in. One row per provider; the password hash lives here for PASSWORD.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `user_id` | text (Uuid) | yes |  |  |
| `provider` | enum AuthProvider | yes |  Allowed values: `PASSWORD`, `MICROSOFT_365`. |  |
| `provider_subject` | text | yes | The identifier at the provider: the email for PASSWORD, the directory object id for MICROSOFT_365. |  |
| `password_hash` | text | no | bcrypt hash; only for PASSWORD. |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `last_used_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `user (relation)` | → User | yes |  |  |

Unique together: (provider, providerSubject), (userId, provider)

## sessions

A signed-in browser session. The cookie holds a random token; only its hash is stored.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `token_hash` | text | yes | SHA-256 of the cookie token, unique. | unique |
| `user_id` | text (Uuid) | yes |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `last_seen_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `expires_at` | timestamp (UTC) (Timestamptz(6)) | yes | Idle expiry, extended on use (12 hours). |  |
| `absolute_expires_at` | timestamp (UTC) (Timestamptz(6)) | yes | Hard expiry, never extended (72 hours). |  |
| `revoked_at` | timestamp (UTC) (Timestamptz(6)) | no | Set when the session is signed out or revoked. |  |
| `ip` | text | no |  |  |
| `user_agent` | text | no |  |  |
| `user (relation)` | → User | yes |  |  |

Indexes: (userId), (expiresAt)

## login_attempts

Every sign-in attempt, for rate limiting and lockout. Rows older than 30 days are pruned.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | bigint | yes |  | primary key, default autoincrement() |
| `email` | text | yes |  |  |
| `ip` | text | no |  |  |
| `succeeded` | boolean | yes |  |  |
| `attempted_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |

Indexes: (email, attemptedAt), (ip, attemptedAt)

## sequences

Counters behind record codes (ACC, LEAD, PRD, OPP-FY27).

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `key` | text | yes | The counter's name. | primary key |
| `next_value` | bigint | yes | The next number to hand out. | default 1) @map("next_value" |

## accounts

A customer or prospect company.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `code` | text | yes | Account code (ACC-0001), unique. | unique |
| `name` | text | yes | Legal or trading name. Unique among non-deleted accounts (checked by the application). |  |
| `gstin` | text (Char(15)) | no | GST identification number, 15 characters, unique. | unique |
| `industry_id` | text (Uuid) | no |  |  |
| `segment_id` | text (Uuid) | no |  |  |
| `website` | text | no |  |  |
| `phone` | text | no |  |  |
| `address_line` | text | no |  |  |
| `city` | text | no |  |  |
| `state` | text | no |  |  |
| `pincode` | text (Char(6)) | no |  |  |
| `owner_id` | text (Uuid) | yes | The sales person who owns the relationship. |  |
| `notes` | text | no |  |  |
| `created_by_id` | text (Uuid) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no | Soft delete: when set, the account is hidden until an admin restores it. |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `industry (relation)` | → Industry | no |  |  |
| `segment (relation)` | → Segment | no |  |  |
| `owner (relation)` | → User | yes |  |  |

Indexes: (ownerId), (name), (deletedAt)

## contacts

A person at an account.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `account_id` | text (Uuid) | yes |  |  |
| `first_name` | text | yes |  |  |
| `last_name` | text | yes |  |  |
| `email` | text | no | Email, stored lower-case, unique across contacts. | unique |
| `phone` | text | no |  |  |
| `mobile` | text | no |  |  |
| `designation` | text | no |  |  |
| `department` | text | no |  |  |
| `is_primary` | boolean | yes | The main contact at the account. | default false) @map("is_primary" |
| `notes` | text | no |  |  |
| `created_by_id` | text (Uuid) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `account (relation)` | → Account | yes |  |  |

Indexes: (accountId), (deletedAt)

## leads

An unqualified enquiry. Converted once into an account, a contact and a deal.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `code` | text | yes | Lead code (LEAD-0001), unique. | unique |
| `company_name` | text | yes |  |  |
| `contact_name` | text | yes |  |  |
| `contact_email` | text | no |  |  |
| `contact_phone` | text | no |  |  |
| `designation` | text | no |  |  |
| `lead_source_id` | text (Uuid) | yes |  |  |
| `industry_id` | text (Uuid) | no |  |  |
| `segment_id` | text (Uuid) | no |  |  |
| `business_unit_id` | text (Uuid) | no | Business unit of interest. |  |
| `estimated_value` | decimal (Decimal(16, 2)) | no | Rough value, INR. |  |
| `currency` | text (Char(3)) | yes |  | default "INR") @db.Char(3 |
| `notes` | text | no |  |  |
| `status` | enum LeadStatus | yes |  Allowed values: `NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `DISQUALIFIED`. | default NEW |
| `owner_id` | text (Uuid) | yes |  |  |
| `disqualify_reason` | text | no | Why the lead was disqualified. |  |
| `converted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `converted_account_id` | text (Uuid) | no |  |  |
| `converted_contact_id` | text (Uuid) | no |  |  |
| `converted_deal_id` | text (Uuid) | no |  |  |
| `created_by_id` | text (Uuid) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `leadSource (relation)` | → LeadSource | yes |  |  |
| `industry (relation)` | → Industry | no |  |  |
| `segment (relation)` | → Segment | no |  |  |
| `businessUnit (relation)` | → BusinessUnit | no |  |  |
| `owner (relation)` | → User | yes |  |  |
| `convertedAccount (relation)` | → Account | no |  |  |
| `convertedContact (relation)` | → Contact | no |  |  |
| `convertedDeal (relation)` | → Deal | no |  |  |

Indexes: (ownerId, status), (deletedAt)

## deals

A sale being pursued at an account. Value, cost, margin and the primary BU/OEM are derived from its lines.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `code` | text | yes | Deal code numbered per fiscal year (OPP-FY27-0042), unique. | unique |
| `name` | text | yes |  |  |
| `account_id` | text (Uuid) | yes |  |  |
| `primary_contact_id` | text (Uuid) | no | The customer contact for this deal; required to leave Qualified. |  |
| `owner_id` | text (Uuid) | yes | The sales person who owns the deal. |  |
| `presales_owner_id` | text (Uuid) | no | The presales engineer on the latest presales request. |  |
| `stage` | enum DealStage | yes |  Allowed values: `QUALIFIED`, `BOQ`, `PROPOSAL_SUBMITTED`, `NEGOTIATION`, `HOLD`, `CLOSED_WON`, `CLOSED_LOST`, `DROPPED`. | default QUALIFIED |
| `stage_entered_at` | timestamp (UTC) (Timestamptz(6)) | yes | When the deal entered its current stage; the basis of time-in-stage. | default now() |
| `held_from_stage` | enum DealStage | no | The open stage the deal was in when it was put on hold; Resume returns it there. Allowed values: `QUALIFIED`, `BOQ`, `PROPOSAL_SUBMITTED`, `NEGOTIATION`, `HOLD`, `CLOSED_WON`, `CLOSED_LOST`, `DROPPED`. |  |
| `last_open_stage` | enum DealStage | no | The last open stage before closing; Reopen returns the deal there. Allowed values: `QUALIFIED`, `BOQ`, `PROPOSAL_SUBMITTED`, `NEGOTIATION`, `HOLD`, `CLOSED_WON`, `CLOSED_LOST`, `DROPPED`. |  |
| `forecast_category` | enum ForecastCategory | yes |  Allowed values: `COMMIT`, `UPSIDE`, `PIPELINE`. | default PIPELINE) @map("forecast_category" |
| `expected_close_date` | timestamp (UTC) (Date) | yes |  |  |
| `needs_presales` | boolean | yes | Whether presales builds a BOQ before the proposal. Suggested from the lines' Sub BUs. | default false) @map("needs_presales" |
| `lead_source_id` | text (Uuid) | no |  |  |
| `description` | text | no |  |  |
| `next_step` | text | no | What happens next on the deal, and when. |  |
| `next_step_date` | timestamp (UTC) (Date) | no |  |  |
| `hold_reason` | text | no | Why the deal is on hold. |  |
| `loss_reason_id` | text (Uuid) | no |  |  |
| `loss_notes` | text | no |  |  |
| `closed_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `po_number` | text | no | Customer purchase order number, recorded at Closed-Won. |  |
| `currency` | text (Char(3)) | yes |  | default "INR") @db.Char(3 |
| `deal_value` | decimal (Decimal(16, 2)) | yes | Derived: total value of all lines (one-time plus ARR over its term), INR. | default 0) @map("deal_value" |
| `one_time_value` | decimal (Decimal(16, 2)) | yes | Derived: value of the one-time lines. | default 0) @map("one_time_value" |
| `annual_recurring_value` | decimal (Decimal(16, 2)) | yes | Derived: annual value of the ARR lines. | default 0) @map("annual_recurring_value" |
| `total_cost` | decimal (Decimal(16, 2)) | no | Derived: total purchase cost of the priced lines; null while any priced line has no cost. |  |
| `expected_gm_pct` | decimal (Decimal(5, 2)) | no | Derived: expected gross margin, (value - cost) / value, percent; null while the cost is unknown. |  |
| `primary_business_unit_id` | text (Uuid) | no | Derived: business unit of the largest line. |  |
| `primary_oem_id` | text (Uuid) | no | Derived: OEM of the largest line. |  |
| `price_fingerprint` | text | no | Hash of the lines' quantities, prices, costs and terms; an approval is valid only while it matches. |  |
| `version` | integer | yes | Optimistic lock: a write must carry the version it read. | default 1 |
| `created_by_id` | text (Uuid) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `account (relation)` | → Account | yes |  |  |
| `primaryContact (relation)` | → Contact | no |  |  |
| `owner (relation)` | → User | yes |  |  |
| `presalesOwner (relation)` | → User | no |  |  |
| `leadSource (relation)` | → LeadSource | no |  |  |
| `lossReason (relation)` | → LossReason | no |  |  |
| `primaryBusinessUnit (relation)` | → BusinessUnit | no |  |  |
| `primaryOem (relation)` | → Oem | no |  |  |

Indexes: (ownerId, stage), (stage, expectedCloseDate), (accountId), (primaryBusinessUnitId), (primaryOemId), (presalesOwnerId), (deletedAt)

## deal_lines

One item sold on a deal: a catalogue product or a custom item, with quantity, price and cost.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_id` | text (Uuid) | yes |  |  |
| `line_no` | integer | yes | Position on the deal, 1-based, unique per deal. |  |
| `product_id` | text (Uuid) | no | The catalogue product, or null for a custom item. |  |
| `description` | text | yes |  |  |
| `business_unit_id` | text (Uuid) | yes |  |  |
| `sub_business_unit_id` | text (Uuid) | yes |  |  |
| `oem_id` | text (Uuid) | yes |  |  |
| `quantity` | decimal (Decimal(12, 2)) | yes |  | default 1) @db.Decimal(12, 2 |
| `unit` | text | yes |  | default "Nos" |
| `revenue_model` | enum RevenueModel | yes |  Allowed values: `ONE_TIME`, `ARR`. | default ONE_TIME) @map("revenue_model" |
| `term_months` | integer | no | Term in months; required for ARR lines. |  |
| `unit_sales_price` | decimal (Decimal(16, 2)) | no | Sales price per unit (annual for ARR), INR. Set by sales. |  |
| `unit_purchase_cost` | decimal (Decimal(16, 2)) | no | Purchase cost per unit (annual for ARR), INR. Set by purchase, or presales for own-IP lines. |  |
| `cost_set_by_id` | text (Uuid) | no |  |  |
| `cost_set_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `sales_method_id` | text (Uuid) | no | B2B, MoQ or Stock; null for own-IP lines. |  |
| `annual_value` | decimal (Decimal(16, 2)) | no | Derived: quantity × unit price for ARR lines (per year). |  |
| `line_value` | decimal (Decimal(16, 2)) | no | Derived: quantity × unit price, times term/12 for ARR lines. |  |
| `line_cost` | decimal (Decimal(16, 2)) | no | Derived: quantity × unit cost, times term/12 for ARR lines. |  |
| `expected_gm_pct` | decimal (Decimal(5, 2)) | no | Derived: (price - cost) / price, percent. |  |
| `updated_by_id` | text (Uuid) | no |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes | Last updated. | set on every change |
| `deal (relation)` | → Deal | yes |  |  |
| `product (relation)` | → Product | no |  |  |
| `businessUnit (relation)` | → BusinessUnit | yes |  |  |
| `subBusinessUnit (relation)` | → SubBusinessUnit | yes |  |  |
| `oem (relation)` | → Oem | yes |  |  |
| `salesMethod (relation)` | → SalesMethod | no |  |  |

Unique together: (dealId, lineNo)

Indexes: (productId), (oemId), (businessUnitId, subBusinessUnitId)

## deal_stage_history

Every stage change of a deal, for time-in-stage reporting.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_id` | text (Uuid) | yes |  |  |
| `from_stage` | enum DealStage | no | Null for the first row (creation). Allowed values: `QUALIFIED`, `BOQ`, `PROPOSAL_SUBMITTED`, `NEGOTIATION`, `HOLD`, `CLOSED_WON`, `CLOSED_LOST`, `DROPPED`. |  |
| `to_stage` | enum DealStage | yes |  Allowed values: `QUALIFIED`, `BOQ`, `PROPOSAL_SUBMITTED`, `NEGOTIATION`, `HOLD`, `CLOSED_WON`, `CLOSED_LOST`, `DROPPED`. |  |
| `changed_by_id` | text (Uuid) | yes |  |  |
| `changed_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `days_in_previous_stage` | decimal (Decimal(8, 2)) | no | Days the deal spent in the previous stage. |  |
| `deal_value_at_change` | decimal (Decimal(16, 2)) | yes | The deal's value when the stage changed. |  |
| `note` | text | no | The reason given (hold, back, reopen), the loss reason, or the PO number. |  |
| `deal (relation)` | → Deal | yes |  |  |
| `changedBy (relation)` | → User | yes |  |  |

Indexes: (dealId, changedAt)

## audit_log

Who changed what and when, with the old and new value.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | bigint | yes |  | primary key, default autoincrement() |
| `entity_type` | text | yes | The kind of record (deal, deal_line, account, contact, lead, user, product, lookup:<table>, …). |  |
| `entity_id` | text (Uuid) | yes |  |  |
| `deal_id` | text (Uuid) | no | The deal a change belongs to, so a deal's history includes its lines, requests and documents. |  |
| `action` | enum AuditAction | yes |  Allowed values: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, `STAGE_CHANGE`, `LOGIN`, `LOGOUT`. |  |
| `field` | text | no | The field changed, for UPDATE rows. |  |
| `old_value` | text | no |  |  |
| `new_value` | text | no |  |  |
| `changed_by_id` | text (Uuid) | no |  |  |
| `changed_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `request_id` | text (Uuid) | no | Groups the rows written by one request. |  |
| `changedBy (relation)` | → User | no |  |  |

Indexes: (entityType, entityId, changedAt), (dealId, changedAt), (changedAt), (changedById, changedAt)

## presales_requests

Sales asking presales to build the BOQ for a deal.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_id` | text (Uuid) | yes |  |  |
| `requested_by_id` | text (Uuid) | yes |  |  |
| `assigned_to_id` | text (Uuid) | yes | The presales engineer. |  |
| `due_date` | timestamp (UTC) (Date) | yes |  |  |
| `status` | enum PresalesRequestStatus | yes |  Allowed values: `REQUESTED`, `IN_PROGRESS`, `SUBMITTED`, `CANCELLED`. | default REQUESTED |
| `scope` | text | yes | What sales needs from presales. |  |
| `summary` | text | no | Presales' summary when submitting. |  |
| `requested_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `started_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `submitted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `cancelled_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deal (relation)` | → Deal | yes |  |  |
| `requestedBy (relation)` | → User | yes |  |  |
| `assignedTo (relation)` | → User | yes |  |  |

Indexes: (assignedToId, status), (dealId, status)

## pricing_requests

Sales or presales asking purchase to price the lines of a deal.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_id` | text (Uuid) | yes |  |  |
| `requested_by_id` | text (Uuid) | yes |  |  |
| `assigned_to_id` | text (Uuid) | yes | The buyer. |  |
| `due_date` | timestamp (UTC) (Date) | yes |  |  |
| `status` | enum PricingRequestStatus | yes |  Allowed values: `REQUESTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. | default REQUESTED |
| `notes` | text | no |  |  |
| `completion_notes` | text | no | Purchase's notes when completing. |  |
| `requested_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `started_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `completed_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `cancelled_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deal (relation)` | → Deal | yes |  |  |
| `requestedBy (relation)` | → User | yes |  |  |
| `assignedTo (relation)` | → User | yes |  |  |

Indexes: (assignedToId, status), (dealId, status)

## deal_documents

A file attached to a deal. The content is stored in the database.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_id` | text (Uuid) | yes |  |  |
| `document_kind_id` | text (Uuid) | yes |  |  |
| `file_name` | text | yes |  |  |
| `content_type` | text | yes |  |  |
| `size_bytes` | integer | yes | Size in bytes (at most 20 MB). |  |
| `content` | binary | yes |  |  |
| `description` | text | no |  |  |
| `uploaded_by_id` | text (Uuid) | yes |  |  |
| `uploaded_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `deal (relation)` | → Deal | yes |  |  |
| `kind (relation)` | → DocumentKind | yes |  |  |
| `uploadedBy (relation)` | → User | yes |  |  |

Indexes: (dealId)

## approval_rules

An admin-defined rule saying when a deal's prices need approval, and by whom. Every condition set must hold.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `name` | text | yes |  | unique |
| `is_active` | boolean | yes |  | default true) @map("is_active" |
| `gm_below_pct` | decimal (Decimal(5, 2)) | no | Applies when the deal's expected GM is below this percentage. |  |
| `deal_value_at_least` | decimal (Decimal(16, 2)) | no | Applies when the deal value is at or above this amount, INR. |  |
| `business_unit_id` | text (Uuid) | no | Applies only to deals with a line in this business unit; null means any. |  |
| `sort_order` | integer | yes |  | default 0) @map("sort_order" |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `deleted_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `deleted_by_id` | text (Uuid) | no |  |  |
| `businessUnit (relation)` | → BusinessUnit | no |  |  |

## approval_rule_steps

One approver in a rule's chain, in order.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `approval_rule_id` | text (Uuid) | yes |  |  |
| `step_no` | integer | yes |  |  |
| `approver_kind` | enum ApproverKind | yes |  Allowed values: `OWNER_MANAGER`, `ROLE`, `USER`. |  |
| `approver_role` | enum UserRole | no | For ROLE: anyone with this role may approve. Allowed values: `ADMIN`, `SALES_HEAD`, `SALES`, `PRESALES`, `PURCHASE`. |  |
| `approver_user_id` | text (Uuid) | no | For USER: this person. |  |
| `rule (relation)` | → ApprovalRule | yes |  |  |

Unique together: (approvalRuleId, stepNo)

## deal_approvals

A request to approve a deal's prices, with its resolved chain of steps.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_id` | text (Uuid) | yes |  |  |
| `requested_by_id` | text (Uuid) | yes |  |  |
| `requested_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `status` | enum ApprovalStatus | yes |  Allowed values: `PENDING`, `APPROVED`, `REJECTED`, `SUPERSEDED`. | default PENDING |
| `price_fingerprint` | text | yes | The deal's price fingerprint when approval was requested. |  |
| `deal_value` | decimal (Decimal(16, 2)) | yes |  |  |
| `gm_pct` | decimal (Decimal(5, 2)) | no |  |  |
| `reasons` | text[] | no | The rule conditions that matched, in words. |  |
| `current_step` | integer | yes | The step waiting for a decision, 1-based. | default 1) @map("current_step" |
| `decided_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `deal (relation)` | → Deal | yes |  |  |
| `requestedBy (relation)` | → User | yes |  |  |

Indexes: (dealId, status)

## deal_approval_steps

One step of a deal approval and its decision.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `deal_approval_id` | text (Uuid) | yes |  |  |
| `step_no` | integer | yes |  |  |
| `label` | text | yes | Who this step is for, in words ("Vivek Malhotra (manager)", "Any Sales Head"). |  |
| `approver_user_ids` | text (Uuid)[] | no | The users who may decide this step. |  |
| `decision` | enum ApprovalDecision | no |  Allowed values: `APPROVED`, `REJECTED`. |  |
| `decided_by_id` | text (Uuid) | no |  |  |
| `decided_at` | timestamp (UTC) (Timestamptz(6)) | no |  |  |
| `note` | text | no |  |  |
| `auto_passed` | boolean | yes | True when the step passed on its own because its only approver was the requester. | default false) @map("auto_passed" |
| `approval (relation)` | → DealApproval | yes |  |  |

Unique together: (dealApprovalId, stepNo)

## pipeline_reviews

A pipeline review that was carried out, so "since last review" can be worked out per person.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `reviewed_by_id` | text (Uuid) | yes |  |  |
| `reviewed_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `scope` | enum ReviewScope | yes |  Allowed values: `REP`, `TEAM`, `EVERYONE`. |  |
| `scope_user_id` | text (Uuid) | no | The sales person (REP) or manager (TEAM) the scope refers to. |  |
| `subject_user_ids` | text (Uuid)[] | no | The sales people the review covered. |  |
| `since_date` | timestamp (UTC) (Timestamptz(6)) | yes | The start of the window the review looked at. |  |
| `notes` | text | no |  |  |
| `reviewedBy (relation)` | → User | yes |  |  |

Indexes: (reviewedAt)

## sales_targets

A sales person's quarterly target.

| Column | Type | Required | Meaning | Notes |
|---|---|---|---|---|
| `id` | text (Uuid) | yes |  | primary key, default dbgenerated("gen_random_uuid()" |
| `user_id` | text (Uuid) | yes |  |  |
| `fiscal_year` | integer | yes | Fiscal year by its end year: FY27 = 2027 (April 2026 to March 2027). |  |
| `quarter` | integer | yes | Quarter 1–4 of the fiscal year (Q1 = April–June). |  |
| `target_value` | decimal (Decimal(16, 2)) | yes |  |  |
| `created_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | default now() |
| `updated_at` | timestamp (UTC) (Timestamptz(6)) | yes |  | set on every change |
| `user (relation)` | → User | yes |  |  |

Unique together: (userId, fiscalYear, quarter)

## Enumerations

### UserRole

What a person may do in the CRM. ADMIN manages everything; SALES_HEAD manages a team; SALES owns deals; PRESALES builds BOQs; PURCHASE prices lines.

| Value | Meaning |
|---|---|
| `ADMIN` |  |
| `SALES_HEAD` |  |
| `SALES` |  |
| `PRESALES` |  |
| `PURCHASE` |  |

### AuthProvider

How a person signs in. PASSWORD today; MICROSOFT_365 is reserved for single sign-on later.

| Value | Meaning |
|---|---|
| `PASSWORD` |  |
| `MICROSOFT_365` |  |

### DealStage

Stage and status of a deal in one field. Open: QUALIFIED, BOQ, PROPOSAL_SUBMITTED, NEGOTIATION, HOLD. Closed: CLOSED_WON, CLOSED_LOST, DROPPED.

| Value | Meaning |
|---|---|
| `QUALIFIED` |  |
| `BOQ` |  |
| `PROPOSAL_SUBMITTED` |  |
| `NEGOTIATION` |  |
| `HOLD` |  |
| `CLOSED_WON` |  |
| `CLOSED_LOST` |  |
| `DROPPED` |  |

### ForecastCategory

Sales person's confidence: COMMIT (will close this quarter), UPSIDE (could), PIPELINE (working it).

| Value | Meaning |
|---|---|
| `COMMIT` |  |
| `UPSIDE` |  |
| `PIPELINE` |  |

### RevenueModel

ONE_TIME is billed once; ARR is billed annually over a term in months.

| Value | Meaning |
|---|---|
| `ONE_TIME` |  |
| `ARR` |  |

### LeadStatus

Lead lifecycle. CONVERTED and DISQUALIFIED are final.

| Value | Meaning |
|---|---|
| `NEW` |  |
| `CONTACTED` |  |
| `QUALIFIED` |  |
| `CONVERTED` |  |
| `DISQUALIFIED` |  |

### PresalesRequestStatus

Presales request lifecycle.

| Value | Meaning |
|---|---|
| `REQUESTED` |  |
| `IN_PROGRESS` |  |
| `SUBMITTED` |  |
| `CANCELLED` |  |

### PricingRequestStatus

Pricing request lifecycle.

| Value | Meaning |
|---|---|
| `REQUESTED` |  |
| `IN_PROGRESS` |  |
| `COMPLETED` |  |
| `CANCELLED` |  |

### ApprovalStatus

Price approval lifecycle. SUPERSEDED: the lines or prices changed after the request, so it no longer applies.

| Value | Meaning |
|---|---|
| `PENDING` |  |
| `APPROVED` |  |
| `REJECTED` |  |
| `SUPERSEDED` |  |

### ApproverKind

Who approves a step of an approval rule: the deal owner's manager, anyone with a role, or a named person.

| Value | Meaning |
|---|---|
| `OWNER_MANAGER` |  |
| `ROLE` |  |
| `USER` |  |

### ApprovalDecision

Decision on one step of an approval.

| Value | Meaning |
|---|---|
| `APPROVED` |  |
| `REJECTED` |  |

### AuditAction

What an audit row records.

| Value | Meaning |
|---|---|
| `CREATE` |  |
| `UPDATE` |  |
| `DELETE` |  |
| `RESTORE` |  |
| `STAGE_CHANGE` |  |
| `LOGIN` |  |
| `LOGOUT` |  |

### ReviewScope

Who a pipeline review covered: one sales person, a manager's team, or everyone.

| Value | Meaning |
|---|---|
| `REP` |  |
| `TEAM` |  |
| `EVERYONE` |  |

### LossReasonAppliesTo

Which closing outcome a loss reason may be used for.

| Value | Meaning |
|---|---|
| `LOST` |  |
| `DROPPED` |  |
| `BOTH` |  |

