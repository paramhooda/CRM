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
