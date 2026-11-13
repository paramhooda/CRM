// Catalogue templates: one row per Sub BU item, expanded once per plausible OEM.
// Prices are per unit in INR; `annualPrice` is the yearly price of an ARR item; `costRatio` × price = standard cost
// (only own-IP products get a standard cost).

export type ProductTemplate = {
  businessUnit: string;
  subBusinessUnit: string;
  name: string;
  unit: string;
  revenueModel: "ONE_TIME" | "ARR";
  termMonths?: number;
  price: number;
  costRatio: number;
  hsnSac: string;
  /** Services only Progression sells; other OEMs in the same Sub BU skip them */
  ownIpOnly?: boolean;
};

const t = (
  businessUnit: string,
  subBusinessUnit: string,
  name: string,
  unit: string,
  revenueModel: "ONE_TIME" | "ARR",
  price: number,
  costRatio: number,
  hsnSac: string,
  extra: Partial<ProductTemplate> = {},
): ProductTemplate => ({ businessUnit, subBusinessUnit, name, unit, revenueModel, price, costRatio, hsnSac, ...extra });

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  t("IT Infrastructure", "Server", "2U Rack Server, 2x Xeon Gold, 512 GB", "Nos", "ONE_TIME", 1_150_000, 0.88, "84715000"),
  t("IT Infrastructure", "Server", "1U Rack Server, 1x Xeon Silver, 128 GB", "Nos", "ONE_TIME", 420_000, 0.88, "84715000"),
  t("IT Infrastructure", "Server", "3-year 24x7 4-hour onsite support", "Nos", "ONE_TIME", 145_000, 0.8, "998713"),
  t("IT Infrastructure", "Server", "64 GB DDR5 memory module", "Nos", "ONE_TIME", 38_000, 0.85, "84733020"),
  t("IT Infrastructure", "Server", "1.92 TB NVMe SSD", "Nos", "ONE_TIME", 72_000, 0.86, "84717020"),
  t("IT Infrastructure", "Storage", "All-flash array, 100 TB usable, dual controller", "Nos", "ONE_TIME", 6_800_000, 0.86, "84717020"),
  t("IT Infrastructure", "Storage", "32G SAN switch, 24 ports", "Nos", "ONE_TIME", 780_000, 0.87, "85176290"),
  t("IT Infrastructure", "Laptop", "Business laptop, Core i5, 16 GB, 512 GB SSD", "Nos", "ONE_TIME", 78_000, 0.91, "84713010"),
  t("IT Infrastructure", "Laptop", "Business laptop, Core i7, 32 GB, 1 TB SSD", "Nos", "ONE_TIME", 118_000, 0.91, "84713010"),
  t("IT Infrastructure", "Desktop", 'Desktop, Core i5, 16 GB, 512 GB SSD, 24" monitor', "Nos", "ONE_TIME", 62_000, 0.9, "84714190"),
  t("IT Infrastructure", "Workstation", "Tower workstation, Xeon W, 64 GB, RTX A4000", "Nos", "ONE_TIME", 385_000, 0.89, "84714190"),
  t("IT Infrastructure", "Licence", "Virtualisation subscription, per core, 3 years", "Cores", "ONE_TIME", 26_000, 0.9, "997331"),
  t("IT Infrastructure", "Networking", "Core switch, 48x 25G + 8x 100G", "Nos", "ONE_TIME", 1_650_000, 0.85, "85176290"),
  t("IT Infrastructure", "Networking", "Access switch, 48-port PoE+", "Nos", "ONE_TIME", 245_000, 0.86, "85176290"),
  t("IT Infrastructure", "Networking", "Wi-Fi 6E access point", "Nos", "ONE_TIME", 68_000, 0.86, "85176290"),
  t("IT Infrastructure", "Others", "Online UPS 10 kVA with batteries", "Nos", "ONE_TIME", 310_000, 0.88, "85044090"),
  t("Cloud", "Hosting", "Virtual compute pool, 64 vCPU / 256 GB", "Pool", "ARR", 185_000 * 12, 0.72, "998315", { termMonths: 12 }),
  t("Cloud", "Hosting", "Block storage, per TB", "TB", "ARR", 6_500 * 12, 0.7, "998315", { termMonths: 12 }),
  t("Cloud", "Managed Hosting", "Managed private cloud with OS and DB management", "Month", "ARR", 640_000 * 12, 0.7, "998316", { termMonths: 36 }),
  t("Cloud", "Managed Hosting", "Cloud migration and cutover", "Lot", "ONE_TIME", 450_000, 0.6, "998313"),
  t("Cloud", "DRaaS", "DR replication, per protected VM", "VMs", "ARR", 4_200 * 12, 0.68, "998315", { termMonths: 36 }),
  t("Cloud", "DRaaS", "DR drill and runbook service", "Drill", "ARR", 95_000 * 4, 0.6, "998316", { termMonths: 36 }),
  t("Cloud", "Colo", "Rack space 42U with 6 kW power", "Racks", "ARR", 115_000 * 12, 0.74, "998315", { termMonths: 36 }),
  t("Cloud", "Colo", "Cross-connect and remote hands", "Month", "ARR", 28_000 * 12, 0.6, "998316", { termMonths: 36 }),
  t("Cloud", "Public Cloud", "Public cloud consumption commitment", "Month", "ARR", 850_000 * 12, 0.9, "998315", { termMonths: 12 }),
  t("Cloud", "Public Cloud", "Managed cloud operations", "Month", "ARR", 120_000 * 12, 0.62, "998316", { termMonths: 12 }),
  t("Cloud", "Licence", "Productivity suite, per user", "Users", "ARR", 9_800, 0.88, "997331", { termMonths: 12 }),
  t("Services", "FMS", "Onsite L1/L2 engineer (FMS)", "Resources", "ARR", 62_000 * 12, 0.72, "998316", { termMonths: 12, ownIpOnly: true }),
  t("Services", "NOC", "24x7 NOC monitoring, per device", "Devices", "ARR", 1_450 * 12, 0.6, "998316", { termMonths: 36, ownIpOnly: true }),
  t("Services", "NOC", "NOC onboarding and runbooks", "Lot", "ONE_TIME", 280_000, 0.55, "998313", { ownIpOnly: true }),
  t("Services", "AMC", "Comprehensive AMC, servers and storage", "Year", "ARR", 1_400_000, 0.75, "998713", { termMonths: 12 }),
  t("Services", "AMC", "Comprehensive AMC, network devices", "Year", "ARR", 520_000, 0.75, "998713", { termMonths: 12 }),
  t("Services", "Professional Services", "Solution architect, per day", "Days", "ONE_TIME", 28_000, 0.55, "998313", { ownIpOnly: true }),
  t("Services", "Professional Services", "Implementation engineer, per day", "Days", "ONE_TIME", 16_000, 0.55, "998313", { ownIpOnly: true }),
  t("Services", "Backup as a Service", "Managed backup, per TB protected", "TB", "ARR", 3_900 * 12, 0.66, "998315", { termMonths: 36 }),
  t("Cybersecurity", "SOC", "24x7 managed SOC (MDR), per EPS tier", "Month", "ARR", 420_000 * 12, 0.62, "998316", { termMonths: 36, ownIpOnly: true }),
  t("Cybersecurity", "SOC", "SOC onboarding and use-case tuning", "Lot", "ONE_TIME", 350_000, 0.55, "998313", { ownIpOnly: true }),
  t("Cybersecurity", "Licence", "Security subscription, per user, annual", "Users", "ARR", 4_800, 0.86, "997331", { termMonths: 36 }),
  t("Cybersecurity", "Licence", "Next-gen firewall appliance", "Nos", "ONE_TIME", 920_000, 0.86, "85176290"),
  t("Cybersecurity", "Compliance", "Compliance consultant, per day", "Days", "ONE_TIME", 24_000, 0.55, "998313"),
  t("Cybersecurity", "Compliance", "Data classification licence, per user", "Users", "ONE_TIME", 3_200, 0.85, "997331"),
];

/** Which OEMs plausibly sell each Sub BU (first is the most common). */
export const SUB_BU_OEMS: Record<string, string[]> = {
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
