// Reference data: the lookups every installation starts with. Admins can extend them later.

export const BUSINESS_UNITS: { name: string; code: string; colourToken: string; subBusinessUnits: { name: string; needsPresales: boolean }[] }[] = [
  {
    name: "IT Infrastructure",
    code: "ITI",
    colourToken: "bu-iti",
    subBusinessUnits: [
      { name: "Server", needsPresales: true },
      { name: "Storage", needsPresales: true },
      { name: "Laptop", needsPresales: false },
      { name: "Desktop", needsPresales: false },
      { name: "Workstation", needsPresales: false },
      { name: "Licence", needsPresales: false },
      { name: "Networking", needsPresales: true },
      { name: "Others", needsPresales: false },
    ],
  },
  {
    name: "Cloud",
    code: "CLD",
    colourToken: "bu-cloud",
    subBusinessUnits: [
      { name: "Hosting", needsPresales: true },
      { name: "Managed Hosting", needsPresales: true },
      { name: "DRaaS", needsPresales: true },
      { name: "Colo", needsPresales: true },
      { name: "Public Cloud", needsPresales: true },
      { name: "Licence", needsPresales: false },
    ],
  },
  {
    name: "Services",
    code: "SVC",
    colourToken: "bu-services",
    subBusinessUnits: [
      { name: "FMS", needsPresales: true },
      { name: "NOC", needsPresales: true },
      { name: "AMC", needsPresales: true },
      { name: "Professional Services", needsPresales: true },
      { name: "Backup as a Service", needsPresales: true },
    ],
  },
  {
    name: "Cybersecurity",
    code: "CYB",
    colourToken: "bu-cyber",
    subBusinessUnits: [
      { name: "SOC", needsPresales: true },
      { name: "Licence", needsPresales: false },
      { name: "Compliance", needsPresales: true },
    ],
  },
];

/** Own IP: Progression and Neon Cloud. */
export const OEMS: { name: string; isOwnIp: boolean }[] = [
  { name: "Progression", isOwnIp: true },
  { name: "Neon Cloud", isOwnIp: true },
  ...[
    "AWS", "Azure", "HPE", "HPI", "Lenovo", "Dell", "Acer", "VMware", "Nutanix", "Cisco", "Fortinet", "Zscaler",
    "Crowdstrike", "Forcepoint", "Cato", "Seclore", "Seqrite", "GISPL", "Holm", "Veeam", "Acronis", "Commvault",
  ].map((name) => ({ name, isOwnIp: false })),
];

export const LEAD_SOURCES = ["OEM Referral", "Distributor Referral", "Existing Customer", "Inbound", "Outbound", "Tender", "Event"];

export const SEGMENTS = ["Enterprise", "Mid-market", "SMB", "Government/PSU"];

export const INDUSTRIES = [
  "BFSI", "Manufacturing", "Pharma & Life Sciences", "Retail & E-commerce", "IT / ITES", "Government / PSU",
  "Healthcare", "Education", "Logistics", "Media & Entertainment", "Energy & Utilities", "Telecom",
];

export const LOSS_REASONS: { name: string; appliesTo: "LOST" | "DROPPED" | "BOTH" }[] = [
  { name: "Price", appliesTo: "LOST" },
  { name: "Lost to competitor", appliesTo: "LOST" },
  { name: "Technical fit", appliesTo: "LOST" },
  { name: "OEM preferred another partner", appliesTo: "LOST" },
  { name: "Relationship", appliesTo: "LOST" },
  { name: "Budget cut / frozen", appliesTo: "BOTH" },
  { name: "No decision", appliesTo: "BOTH" },
  { name: "Project deferred", appliesTo: "BOTH" },
  { name: "Disqualified", appliesTo: "DROPPED" },
  { name: "Duplicate", appliesTo: "DROPPED" },
];

export const DOCUMENT_KINDS: { name: string; restrictedToSales: boolean; requiredAtWon: boolean }[] = [
  { name: "Customer RFP", restrictedToSales: false, requiredAtWon: false },
  { name: "SoW", restrictedToSales: false, requiredAtWon: false },
  { name: "Solution document", restrictedToSales: false, requiredAtWon: false },
  { name: "Supplier quote", restrictedToSales: false, requiredAtWon: false },
  { name: "Proposal", restrictedToSales: true, requiredAtWon: false },
  { name: "Customer PO", restrictedToSales: true, requiredAtWon: true },
  { name: "Other", restrictedToSales: false, requiredAtWon: false },
];

export const SALES_METHODS = ["B2B", "MoQ", "Stock"];
