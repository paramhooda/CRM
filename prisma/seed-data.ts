// Reference data for the seed: picklists from the Progression CRM field sheet plus demo customers.

export const BUSINESS_UNITS: { name: string; code: string; categories: string[] }[] = [
  {
    name: "IT Infrastructure",
    code: "ITI",
    categories: ["Server", "Storage", "Laptop", "Desktop", "Workstation", "Licence", "Networking", "Others"],
  },
  { name: "Cloud", code: "CLD", categories: ["Hosting", "Managed Hosting", "DRaaS", "Colo", "Public Cloud", "Licence"] },
  { name: "Services", code: "SVC", categories: ["FMS", "NOC", "AMC", "Professional Services", "Backup as a Service"] },
  { name: "Cybersecurity", code: "CYB", categories: ["SOC", "Licence", "Compliance"] },
];

export const OEMS = [
  "Progression", "Neon Cloud", "AWS", "Azure", "HPE", "HPI", "Lenovo", "Dell", "Acer", "VMware", "Nutanix", "Cisco",
  "Fortinet", "Zscaler", "Crowdstrike", "Forcepoint", "Cato", "Seclore", "Seqrite", "GISPL", "Holm", "Veeam",
  "Acronis", "Commvault",
];

export const SALES_PEOPLE = [
  "Rakesh Pawar", "Naresh Kumar", "Bhushan Khadage", "Bansi Dhar", "Sajjan Kumar", "Chirag Kapoor", "Rishabh Tyagi",
  "Shefali Rana", "Abhijeet Tripathi", "Jitender Deshwal", "Kamal Thakur", "Nitin Singh", "Susanta Praharaj",
  "Praduman Yadav", "Suman Choudhary", "Girija Sharma", "Kishan Singh Rathor", "Joydeep Choudhury",
];

export const PRESALES_PEOPLE = ["Rakesh Yadav", "Amit Rampal", "Ramraj Yadav", "Pabitra Mohapatra", "Sunil Kumar"];
export const PURCHASE_PEOPLE = ["Meera Iyer", "Deepak Verma"];
export const SALES_HEAD = "Vivek Malhotra";
export const ADMIN_NAME = "System Administrator";

export const PICKLISTS: Record<string, string[]> = {
  INDUSTRY: [
    "BFSI", "Manufacturing", "Pharma & Life Sciences", "Retail & E-commerce", "IT / ITES", "Government / PSU",
    "Healthcare", "Education", "Logistics", "Media & Entertainment", "Energy & Utilities", "Telecom",
  ],
  LEAD_SOURCE: [
    "Existing customer", "Referral", "OEM referral", "Distributor", "Inbound website", "Event / Webinar",
    "Outbound prospecting", "Tender portal", "Partner",
  ],
  LOSS_REASON: [
    "Price", "Lost to competitor", "Budget cut / frozen", "No decision", "Project deferred", "Technical fit",
    "OEM preferred another partner", "Relationship", "Disqualified",
  ],
  COMPETITOR: ["National SI", "Regional SI", "OEM direct", "Hyperscaler direct", "Distributor-led bid", "Telco", "Incumbent MSP"],
  DISTRIBUTOR: ["Redington", "Ingram Micro", "iValue", "Savex", "Rashi Peripherals", "Arrow", "OEM direct"],
};

/** Plausible OEMs per category (keys are "BU|Category"). */
export const CATEGORY_OEMS: Record<string, string[]> = {
  "IT Infrastructure|Server": ["HPE", "Dell", "Lenovo"],
  "IT Infrastructure|Storage": ["HPE", "Dell", "Nutanix"],
  "IT Infrastructure|Laptop": ["HPI", "Lenovo", "Dell", "Acer"],
  "IT Infrastructure|Desktop": ["HPI", "Lenovo", "Dell", "Acer"],
  "IT Infrastructure|Workstation": ["HPI", "Dell", "Lenovo"],
  "IT Infrastructure|Licence": ["VMware", "Nutanix"],
  "IT Infrastructure|Networking": ["Cisco", "Fortinet"],
  "IT Infrastructure|Others": ["Dell", "HPE"],
  "Cloud|Hosting": ["Neon Cloud", "Progression"],
  "Cloud|Managed Hosting": ["Progression", "Neon Cloud"],
  "Cloud|DRaaS": ["Neon Cloud", "Veeam", "Commvault"],
  "Cloud|Colo": ["Progression"],
  "Cloud|Public Cloud": ["AWS", "Azure"],
  "Cloud|Licence": ["Azure", "AWS"],
  "Services|FMS": ["Progression"],
  "Services|NOC": ["Progression"],
  "Services|AMC": ["Progression", "HPE", "Dell"],
  "Services|Professional Services": ["Progression"],
  "Services|Backup as a Service": ["Veeam", "Acronis", "Commvault"],
  "Cybersecurity|SOC": ["Progression"],
  "Cybersecurity|Licence": ["Fortinet", "Zscaler", "Crowdstrike", "Forcepoint", "Cato", "Seqrite", "Seclore"],
  "Cybersecurity|Compliance": ["Progression", "Seclore", "GISPL", "Holm"],
};

/** [min, max] TCV in INR, recurring model, typical deal names */
export const CATEGORY_PROFILE: Record<
  string,
  { min: number; max: number; arr: boolean; names: string[]; lines: { d: string; unit: string; w: number; recurring?: boolean }[] }
> = {
  "IT Infrastructure|Server": {
    min: 2.5e6, max: 2.5e7, arr: false,
    names: ["DC Server Refresh", "Compute Expansion", "Core Banking Server Upgrade", "Virtualisation Host Refresh"],
    lines: [
      { d: "Rack server, 2x Xeon Gold, 512 GB RAM, 4x 1.92 TB SSD", unit: "Nos", w: 0.72 },
      { d: "3-year 24x7 OEM support with 4-hour response", unit: "Nos", w: 0.13 },
      { d: "Rack, PDU and cabling accessories", unit: "Lot", w: 0.05 },
      { d: "Installation, OS and hypervisor configuration", unit: "Lot", w: 0.1 },
    ],
  },
  "IT Infrastructure|Storage": {
    min: 3e6, max: 1.8e7, arr: false,
    names: ["Primary Storage Refresh", "All-Flash SAN", "Backup Target Storage", "HCI Cluster"],
    lines: [
      { d: "All-flash storage array, 200 TB usable, dual controller", unit: "Nos", w: 0.74 },
      { d: "SAN switch 32G, 24 ports licensed", unit: "Nos", w: 0.12 },
      { d: "3-year proactive care support", unit: "Nos", w: 0.08 },
      { d: "Data migration services", unit: "Lot", w: 0.06 },
    ],
  },
  "IT Infrastructure|Laptop": {
    min: 1.5e6, max: 1.2e7, arr: false,
    names: ["Employee Laptop Refresh", "Field Force Laptops", "Laptop Rollout Phase 2"],
    lines: [
      { d: "Business laptop, Core i5, 16 GB, 512 GB SSD, 14\"", unit: "Nos", w: 0.86 },
      { d: "3-year onsite warranty extension", unit: "Nos", w: 0.08 },
      { d: "Imaging and deployment services", unit: "Nos", w: 0.06 },
    ],
  },
  "IT Infrastructure|Desktop": {
    min: 1e6, max: 8e6, arr: false,
    names: ["Branch Desktop Refresh", "Contact Centre Desktops", "Desktop Standardisation"],
    lines: [
      { d: "Desktop, Core i5, 16 GB, 512 GB SSD with 24\" monitor", unit: "Nos", w: 0.9 },
      { d: "Deployment and old asset buyback handling", unit: "Nos", w: 0.1 },
    ],
  },
  "IT Infrastructure|Workstation": {
    min: 1.5e6, max: 6e6, arr: false,
    names: ["Engineering Workstations", "Design Studio Workstations"],
    lines: [
      { d: "Tower workstation, Xeon W, 64 GB, RTX A4000", unit: "Nos", w: 0.9 },
      { d: "3-year next-business-day onsite support", unit: "Nos", w: 0.1 },
    ],
  },
  "IT Infrastructure|Licence": {
    min: 1e6, max: 9e6, arr: false,
    names: ["Virtualisation Licence Renewal", "Hypervisor Subscription", "Licence True-up"],
    lines: [
      { d: "Virtualisation subscription, per core, 3 years", unit: "Cores", w: 0.92 },
      { d: "Licence migration and activation", unit: "Lot", w: 0.08 },
    ],
  },
  "IT Infrastructure|Networking": {
    min: 2e6, max: 1.5e7, arr: false,
    names: ["Campus LAN Refresh", "SD-WAN Rollout", "DC Core Switching", "Branch Network Upgrade"],
    lines: [
      { d: "Core switch, 48x 25G SFP28 + 8x 100G", unit: "Nos", w: 0.45 },
      { d: "Access switch, 48-port PoE+", unit: "Nos", w: 0.3 },
      { d: "Wireless access points, Wi-Fi 6E", unit: "Nos", w: 0.15 },
      { d: "Network design and implementation", unit: "Lot", w: 0.1 },
    ],
  },
  "IT Infrastructure|Others": {
    min: 5e5, max: 2.5e6, arr: false,
    names: ["UPS and Peripherals", "Conference Room AV", "Printers and Peripherals"],
    lines: [
      { d: "Peripherals and accessories bundle", unit: "Lot", w: 0.85 },
      { d: "Installation services", unit: "Lot", w: 0.15 },
    ],
  },
  "Cloud|Hosting": {
    min: 2e6, max: 1e7, arr: true,
    names: ["Application Hosting", "Web Portal Hosting", "ERP Hosting"],
    lines: [
      { d: "Virtual compute, 64 vCPU / 256 GB pool, monthly", unit: "Pool", w: 0.7, recurring: true },
      { d: "Block storage 20 TB, monthly", unit: "TB", w: 0.2, recurring: true },
      { d: "Onboarding and migration", unit: "Lot", w: 0.1 },
    ],
  },
  "Cloud|Managed Hosting": {
    min: 4e6, max: 2e7, arr: true,
    names: ["SAP Managed Hosting", "Managed Private Cloud", "Core App Managed Hosting"],
    lines: [
      { d: "Managed private cloud with OS and DB management, monthly", unit: "Month", w: 0.82, recurring: true },
      { d: "Managed backup and monitoring, monthly", unit: "Month", w: 0.12, recurring: true },
      { d: "Migration and cutover services", unit: "Lot", w: 0.06 },
    ],
  },
  "Cloud|DRaaS": {
    min: 2.5e6, max: 1.2e7, arr: true,
    names: ["DR as a Service", "DR Site Setup", "Ransomware Recovery DR"],
    lines: [
      { d: "DR replication, per protected VM, monthly", unit: "VMs", w: 0.75, recurring: true },
      { d: "Quarterly DR drill services", unit: "Drill", w: 0.15, recurring: true },
      { d: "DR runbook and setup", unit: "Lot", w: 0.1 },
    ],
  },
  "Cloud|Colo": {
    min: 3e6, max: 1.5e7, arr: true,
    names: ["DC Colocation", "Rack Space Expansion", "Tier-III Colo Migration"],
    lines: [
      { d: "Rack space 42U with 6 kW power, monthly", unit: "Racks", w: 0.85, recurring: true },
      { d: "Cross-connects and remote hands, monthly", unit: "Month", w: 0.15, recurring: true },
    ],
  },
  "Cloud|Public Cloud": {
    min: 3e6, max: 3e7, arr: true,
    names: ["Public Cloud Migration", "Cloud Landing Zone", "Managed Public Cloud"],
    lines: [
      { d: "Public cloud consumption commitment, monthly", unit: "Month", w: 0.85, recurring: true },
      { d: "Managed cloud operations, monthly", unit: "Month", w: 0.1, recurring: true },
      { d: "Landing zone and migration", unit: "Lot", w: 0.05 },
    ],
  },
  "Cloud|Licence": {
    min: 1e6, max: 8e6, arr: true,
    names: ["Productivity Suite Licences", "Cloud Licence Renewal"],
    lines: [{ d: "Productivity suite, per user per month", unit: "Users", w: 1, recurring: true }],
  },
  "Services|FMS": {
    min: 3e6, max: 1.5e7, arr: true,
    names: ["IT Facility Management", "Desktop FMS", "Onsite FMS Renewal"],
    lines: [
      { d: "Onsite L1/L2 engineers, per resource per month", unit: "Resources", w: 0.9, recurring: true },
      { d: "Service desk tooling, monthly", unit: "Month", w: 0.1, recurring: true },
    ],
  },
  "Services|NOC": {
    min: 4e6, max: 1.2e7, arr: true,
    names: ["24x7 NOC Services", "Network Monitoring NOC", "Managed NOC Renewal"],
    lines: [
      { d: "24x7 NOC monitoring, per device per month", unit: "Devices", w: 0.85, recurring: true },
      { d: "NOC onboarding and runbooks", unit: "Lot", w: 0.15 },
    ],
  },
  "Services|AMC": {
    min: 1e6, max: 6e6, arr: false,
    names: ["Infrastructure AMC", "Comprehensive AMC Renewal", "Multi-vendor AMC"],
    lines: [
      { d: "Comprehensive AMC, servers and storage, 1 year", unit: "Lot", w: 0.75 },
      { d: "Comprehensive AMC, network devices, 1 year", unit: "Lot", w: 0.25 },
    ],
  },
  "Services|Professional Services": {
    min: 8e5, max: 5e6, arr: false,
    names: ["Infra Assessment", "DC Migration Services", "Active Directory Consolidation"],
    lines: [
      { d: "Solution architect, person-days", unit: "Days", w: 0.4 },
      { d: "Implementation engineer, person-days", unit: "Days", w: 0.6 },
    ],
  },
  "Services|Backup as a Service": {
    min: 1.5e6, max: 7e6, arr: true,
    names: ["Backup as a Service", "M365 Backup", "Endpoint Backup Service"],
    lines: [
      { d: "Managed backup, per TB protected per month", unit: "TB", w: 0.85, recurring: true },
      { d: "Backup onboarding", unit: "Lot", w: 0.15 },
    ],
  },
  "Cybersecurity|SOC": {
    min: 5e6, max: 2e7, arr: true,
    names: ["Managed SOC 24x7", "SOC with SIEM and SOAR", "MDR Service"],
    lines: [
      { d: "24x7 managed SOC, per EPS tier per month", unit: "Month", w: 0.8, recurring: true },
      { d: "SIEM platform licence, monthly", unit: "Month", w: 0.15, recurring: true },
      { d: "SOC onboarding and use-case tuning", unit: "Lot", w: 0.05 },
    ],
  },
  "Cybersecurity|Licence": {
    min: 1.5e6, max: 1.2e7, arr: false,
    names: ["Next-Gen Firewall", "EDR Rollout", "SASE Deployment", "DLP Licences", "Zero Trust Access"],
    lines: [
      { d: "Security subscription, per user, 3 years", unit: "Users", w: 0.8 },
      { d: "Appliance / connector hardware", unit: "Nos", w: 0.12 },
      { d: "Deployment and policy configuration", unit: "Lot", w: 0.08 },
    ],
  },
  "Cybersecurity|Compliance": {
    min: 1e6, max: 6e6, arr: false,
    names: ["ISO 27001 Readiness", "VAPT Engagement", "DPDP Act Compliance", "RBI Cyber Audit Support"],
    lines: [
      { d: "Gap assessment and audit support, person-days", unit: "Days", w: 0.7 },
      { d: "Policy and control documentation", unit: "Lot", w: 0.3 },
    ],
  },
};

// Fictional demo customers. Names, identifiers and addresses are invented.
export const ACCOUNTS = [
  { name: "Zenith Capital Finance Ltd", short: "Zenith", industry: "BFSI", segment: "ENTERPRISE", city: "Mumbai", state: "Maharashtra", stateCode: "27", pincode: "400051", address: "Plot C-62, G Block, Bandra Kurla Complex", revenueCr: 4200, employees: 6800, site: "zenithcapital.example", prospect: false },
  { name: "Shakti Steel Industries Ltd", short: "Shakti Steel", industry: "Manufacturing", segment: "ENTERPRISE", city: "Jamshedpur", state: "Jharkhand", stateCode: "20", pincode: "831001", address: "Works Road, Bistupur", revenueCr: 9800, employees: 14500, site: "shaktisteel.example", prospect: false },
  { name: "Medisure Pharmaceuticals Pvt Ltd", short: "Medisure", industry: "Pharma & Life Sciences", segment: "ENTERPRISE", city: "Ahmedabad", state: "Gujarat", stateCode: "24", pincode: "380015", address: "Medisure House, SG Highway, Thaltej", revenueCr: 3100, employees: 5200, site: "medisurepharma.example", prospect: false },
  { name: "UrbanKart Retail Pvt Ltd", short: "UrbanKart", industry: "Retail & E-commerce", segment: "ENTERPRISE", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560103", address: "Tower B, Outer Ring Road, Bellandur", revenueCr: 2600, employees: 9100, site: "urbankart.example", prospect: false },
  { name: "Infovista Technologies Ltd", short: "Infovista", industry: "IT / ITES", segment: "MID_MARKET", city: "Pune", state: "Maharashtra", stateCode: "27", pincode: "411057", address: "Phase 2, Rajiv Gandhi Infotech Park, Hinjewadi", revenueCr: 850, employees: 3400, site: "infovista.example", prospect: false },
  { name: "Rajya Vidyut Vitaran Nigam Ltd", short: "RVVNL", industry: "Government / PSU", segment: "GOVT_PSU", city: "Lucknow", state: "Uttar Pradesh", stateCode: "09", pincode: "226001", address: "Shakti Bhawan Annexe, Ashok Marg", revenueCr: 21000, employees: 22000, site: "rvvnl.example", prospect: false },
  { name: "CarePoint Hospitals Ltd", short: "CarePoint", industry: "Healthcare", segment: "ENTERPRISE", city: "Chennai", state: "Tamil Nadu", stateCode: "33", pincode: "600006", address: "No. 21, Greams Lane", revenueCr: 1900, employees: 7600, site: "carepointhospitals.example", prospect: false },
  { name: "Vidyapeeth Global University", short: "Vidyapeeth", industry: "Education", segment: "MID_MARKET", city: "Noida", state: "Uttar Pradesh", stateCode: "09", pincode: "201310", address: "Knowledge Park III, Greater Noida", revenueCr: 320, employees: 1800, site: "vidyapeeth.example", prospect: false },
  { name: "SwiftMove Logistics Pvt Ltd", short: "SwiftMove", industry: "Logistics", segment: "MID_MARKET", city: "Gurugram", state: "Haryana", stateCode: "06", pincode: "122002", address: "Unit 704, DLF Cyber City Phase 2", revenueCr: 640, employees: 2900, site: "swiftmove.example", prospect: true },
  { name: "Prism Media Networks Ltd", short: "Prism Media", industry: "Media & Entertainment", segment: "MID_MARKET", city: "Hyderabad", state: "Telangana", stateCode: "36", pincode: "500081", address: "Plot 12, HITEC City Road, Madhapur", revenueCr: 1100, employees: 2100, site: "prismmedia.example", prospect: true },
] as const;

export const CONTACT_TEMPLATES = [
  { title: "Chief Information Officer", dept: "IT", role: "DECISION_MAKER" },
  { title: "Head - IT Infrastructure", dept: "IT", role: "CHAMPION" },
  { title: "Chief Information Security Officer", dept: "Information Security", role: "DECISION_MAKER" },
  { title: "Manager - Procurement", dept: "Procurement", role: "PROCUREMENT" },
  { title: "Senior Manager - Data Centre", dept: "IT", role: "TECHNICAL_EVALUATOR" },
  { title: "Chief Financial Officer", dept: "Finance", role: "FINANCE" },
  { title: "IT Manager", dept: "IT", role: "INFLUENCER" },
] as const;

export const FIRST_NAMES = [
  "Arvind", "Priya", "Sanjay", "Kavita", "Rohit", "Neha", "Manoj", "Anjali", "Suresh", "Pooja", "Vikas", "Ritu",
  "Ajay", "Sneha", "Harish", "Lakshmi", "Gaurav", "Divya", "Prakash", "Swati", "Ramesh", "Nidhi", "Karthik", "Meenal",
  "Tarun", "Shalini", "Venkat", "Aparna", "Sameer", "Bhavna", "Imran", "Farah", "Devendra", "Rekha", "Ashok", "Komal",
];
export const LAST_NAMES = [
  "Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Kulkarni", "Banerjee", "Menon", "Joshi", "Patel", "Rao", "Saxena",
  "Bhatt", "Pillai", "Chatterjee", "Agarwal", "Deshpande", "Srinivasan", "Khan", "Mishra", "Sinha", "Krishnan",
];

// ───────────── Product catalogue ─────────────
// Templates per "BU|Category"; expanded across the plausible OEMs for that category.
// price = list price per unit (per billing period for recurring items); cost = standard cost as a share of list.
type ProductTpl = {
  name: string; unit: string; type: "HARDWARE" | "SOFTWARE_LICENCE" | "SUBSCRIPTION" | "SERVICE" | "SUPPORT_AMC";
  freq: "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "ANNUAL"; term?: number; hsn: string; price: number; cost: number;
};

export const PRODUCT_TEMPLATES: Record<string, ProductTpl[]> = {
  "IT Infrastructure|Server": [
    { name: "2U Rack Server, 2x Xeon Gold, 512 GB", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84715000", price: 1_150_000, cost: 0.88 },
    { name: "1U Rack Server, 1x Xeon Silver, 128 GB", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84715000", price: 420_000, cost: 0.88 },
    { name: "3-year 24x7 4-hour onsite support", unit: "Nos", type: "SUPPORT_AMC", freq: "ONE_TIME", hsn: "998713", price: 145_000, cost: 0.8 },
  ],
  "IT Infrastructure|Storage": [
    { name: "All-flash array, 100 TB usable, dual controller", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84717020", price: 6_800_000, cost: 0.86 },
    { name: "32G SAN switch, 24 ports", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "85176290", price: 780_000, cost: 0.87 },
  ],
  "IT Infrastructure|Laptop": [
    { name: "Business laptop, Core i5, 16 GB, 512 GB SSD", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84713010", price: 78_000, cost: 0.91 },
    { name: "Business laptop, Core i7, 32 GB, 1 TB SSD", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84713010", price: 118_000, cost: 0.91 },
  ],
  "IT Infrastructure|Desktop": [
    { name: "Desktop, Core i5, 16 GB, 512 GB SSD, 24\" monitor", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84714190", price: 62_000, cost: 0.9 },
  ],
  "IT Infrastructure|Workstation": [
    { name: "Tower workstation, Xeon W, 64 GB, RTX A4000", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "84714190", price: 385_000, cost: 0.89 },
  ],
  "IT Infrastructure|Licence": [
    { name: "Virtualisation subscription, per core, 3 years", unit: "Cores", type: "SOFTWARE_LICENCE", freq: "ONE_TIME", hsn: "997331", price: 26_000, cost: 0.9 },
  ],
  "IT Infrastructure|Networking": [
    { name: "Core switch, 48x 25G + 8x 100G", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "85176290", price: 1_650_000, cost: 0.85 },
    { name: "Access switch, 48-port PoE+", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "85176290", price: 245_000, cost: 0.86 },
    { name: "Wi-Fi 6E access point", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "85176290", price: 68_000, cost: 0.86 },
  ],
  "IT Infrastructure|Others": [
    { name: "Online UPS 10 kVA with batteries", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "85044090", price: 310_000, cost: 0.88 },
  ],
  "Cloud|Hosting": [
    { name: "Virtual compute pool, 64 vCPU / 256 GB", unit: "Pool", type: "SUBSCRIPTION", freq: "MONTHLY", term: 12, hsn: "998315", price: 185_000, cost: 0.72 },
    { name: "Block storage, per TB", unit: "TB", type: "SUBSCRIPTION", freq: "MONTHLY", term: 12, hsn: "998315", price: 6_500, cost: 0.7 },
  ],
  "Cloud|Managed Hosting": [
    { name: "Managed private cloud with OS and DB management", unit: "Month", type: "SERVICE", freq: "MONTHLY", term: 36, hsn: "998316", price: 640_000, cost: 0.7 },
    { name: "Cloud migration and cutover", unit: "Lot", type: "SERVICE", freq: "ONE_TIME", hsn: "998313", price: 450_000, cost: 0.6 },
  ],
  "Cloud|DRaaS": [
    { name: "DR replication, per protected VM", unit: "VMs", type: "SUBSCRIPTION", freq: "MONTHLY", term: 36, hsn: "998315", price: 4_200, cost: 0.68 },
    { name: "DR drill and runbook service", unit: "Drill", type: "SERVICE", freq: "QUARTERLY", term: 36, hsn: "998316", price: 95_000, cost: 0.6 },
  ],
  "Cloud|Colo": [
    { name: "Rack space 42U with 6 kW power", unit: "Racks", type: "SUBSCRIPTION", freq: "MONTHLY", term: 36, hsn: "998315", price: 115_000, cost: 0.74 },
    { name: "Cross-connect and remote hands", unit: "Month", type: "SERVICE", freq: "MONTHLY", term: 36, hsn: "998316", price: 28_000, cost: 0.6 },
  ],
  "Cloud|Public Cloud": [
    { name: "Public cloud consumption commitment", unit: "Month", type: "SUBSCRIPTION", freq: "MONTHLY", term: 12, hsn: "998315", price: 850_000, cost: 0.9 },
    { name: "Managed cloud operations", unit: "Month", type: "SERVICE", freq: "MONTHLY", term: 12, hsn: "998316", price: 120_000, cost: 0.62 },
  ],
  "Cloud|Licence": [
    { name: "Productivity suite, per user", unit: "Users", type: "SUBSCRIPTION", freq: "ANNUAL", term: 12, hsn: "997331", price: 9_800, cost: 0.88 },
  ],
  "Services|FMS": [
    { name: "Onsite L1/L2 engineer (FMS)", unit: "Resources", type: "SERVICE", freq: "MONTHLY", term: 12, hsn: "998316", price: 62_000, cost: 0.72 },
  ],
  "Services|NOC": [
    { name: "24x7 NOC monitoring, per device", unit: "Devices", type: "SERVICE", freq: "MONTHLY", term: 36, hsn: "998316", price: 1_450, cost: 0.6 },
    { name: "NOC onboarding and runbooks", unit: "Lot", type: "SERVICE", freq: "ONE_TIME", hsn: "998313", price: 280_000, cost: 0.55 },
  ],
  "Services|AMC": [
    { name: "Comprehensive AMC, servers and storage", unit: "Year", type: "SUPPORT_AMC", freq: "ANNUAL", term: 12, hsn: "998713", price: 1_400_000, cost: 0.75 },
    { name: "Comprehensive AMC, network devices", unit: "Year", type: "SUPPORT_AMC", freq: "ANNUAL", term: 12, hsn: "998713", price: 520_000, cost: 0.75 },
  ],
  "Services|Professional Services": [
    { name: "Solution architect, per day", unit: "Days", type: "SERVICE", freq: "ONE_TIME", hsn: "998313", price: 28_000, cost: 0.55 },
    { name: "Implementation engineer, per day", unit: "Days", type: "SERVICE", freq: "ONE_TIME", hsn: "998313", price: 16_000, cost: 0.55 },
  ],
  "Services|Backup as a Service": [
    { name: "Managed backup, per TB protected", unit: "TB", type: "SUBSCRIPTION", freq: "MONTHLY", term: 36, hsn: "998315", price: 3_900, cost: 0.66 },
  ],
  "Cybersecurity|SOC": [
    { name: "24x7 managed SOC (MDR), per EPS tier", unit: "Month", type: "SERVICE", freq: "MONTHLY", term: 36, hsn: "998316", price: 420_000, cost: 0.62 },
    { name: "SOC onboarding and use-case tuning", unit: "Lot", type: "SERVICE", freq: "ONE_TIME", hsn: "998313", price: 350_000, cost: 0.55 },
  ],
  "Cybersecurity|Licence": [
    { name: "Security subscription, per user, annual", unit: "Users", type: "SUBSCRIPTION", freq: "ANNUAL", term: 36, hsn: "997331", price: 4_800, cost: 0.86 },
    { name: "Next-gen firewall appliance", unit: "Nos", type: "HARDWARE", freq: "ONE_TIME", hsn: "85176290", price: 920_000, cost: 0.86 },
  ],
  "Cybersecurity|Compliance": [
    { name: "Compliance consultant, per day", unit: "Days", type: "SERVICE", freq: "ONE_TIME", hsn: "998313", price: 24_000, cost: 0.55 },
    { name: "Data classification licence, per user", unit: "Users", type: "SOFTWARE_LICENCE", freq: "ONE_TIME", hsn: "997331", price: 3_200, cost: 0.85 },
  ],
};

/** Typical add-ons that turn a deal into a multi-OEM, multi-BU solution. */
export const COMPLEMENTS: Record<string, string[]> = {
  "IT Infrastructure|Server": ["IT Infrastructure|Licence", "Services|Professional Services", "Services|Backup as a Service"],
  "IT Infrastructure|Storage": ["Services|Professional Services", "Services|Backup as a Service"],
  "IT Infrastructure|Laptop": ["Cybersecurity|Licence"],
  "IT Infrastructure|Desktop": ["Cybersecurity|Licence"],
  "IT Infrastructure|Networking": ["Cybersecurity|Licence", "Services|NOC"],
  "IT Infrastructure|Licence": ["Services|Professional Services"],
  "Cloud|Hosting": ["Services|Backup as a Service", "Cybersecurity|SOC"],
  "Cloud|Managed Hosting": ["Cloud|DRaaS", "Cybersecurity|SOC"],
  "Cloud|Public Cloud": ["Services|Professional Services", "Cybersecurity|Licence"],
  "Cloud|Colo": ["Services|NOC", "IT Infrastructure|Networking"],
  "Services|FMS": ["Services|AMC"],
  "Services|NOC": ["IT Infrastructure|Networking"],
  "Cybersecurity|SOC": ["Cybersecurity|Licence", "Cybersecurity|Compliance"],
  "Cybersecurity|Licence": ["Services|Professional Services"],
};

export const OEM_CODE: Record<string, string> = {
  Progression: "PRG", "Neon Cloud": "NEON", AWS: "AWS", Azure: "AZR", HPE: "HPE", HPI: "HPI", Lenovo: "LNV", Dell: "DELL",
  Acer: "ACR", VMware: "VMW", Nutanix: "NTNX", Cisco: "CSCO", Fortinet: "FTNT", Zscaler: "ZS", Crowdstrike: "CRWD",
  Forcepoint: "FP", Cato: "CATO", Seclore: "SCLR", Seqrite: "SQRT", GISPL: "GISPL", Holm: "HOLM", Veeam: "VEEAM",
  Acronis: "ACRN", Commvault: "CMVLT",
};
