// The people in the demo data. Names come from the owner's field sheet; the second Sales Head is invented so a
// manager with a smaller team can be seen.

export type SeedPerson = {
  fullName: string;
  role: "ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE";
  title: string;
  /** Full name of the manager, if any */
  manager?: string;
  email?: string;
};

export const DEMO_PASSWORD = "Progression@123";

const SALES_HEAD = "Vivek Malhotra";
const REGIONAL_HEAD = "Anita Deshmukh";

const sales = (fullName: string, manager: string, title = "Account Manager"): SeedPerson => ({ fullName, role: "SALES", title, manager });

export const PEOPLE: SeedPerson[] = [
  { fullName: "System Administrator", role: "ADMIN", title: "CRM Administrator", email: "admin@progression.com" },
  { fullName: SALES_HEAD, role: "SALES_HEAD", title: "Vice President - Sales" },
  { fullName: REGIONAL_HEAD, role: "SALES_HEAD", title: "Regional Sales Head - West", manager: SALES_HEAD },
  sales("Rakesh Pawar", SALES_HEAD, "Key Account Manager"),
  sales("Naresh Kumar", SALES_HEAD, "Senior Account Manager"),
  sales("Bhushan Khadage", REGIONAL_HEAD),
  sales("Bansi Dhar", SALES_HEAD),
  sales("Sajjan Kumar", SALES_HEAD, "Senior Account Manager"),
  sales("Chirag Kapoor", REGIONAL_HEAD),
  sales("Rishabh Tyagi", SALES_HEAD),
  sales("Shefali Rana", REGIONAL_HEAD, "Key Account Manager"),
  sales("Abhijeet Tripathi", SALES_HEAD),
  sales("Jitender Deshwal", SALES_HEAD, "Senior Account Manager"),
  sales("Kamal Thakur", REGIONAL_HEAD),
  sales("Nitin Singh", SALES_HEAD),
  sales("Susanta Praharaj", SALES_HEAD),
  sales("Praduman Yadav", REGIONAL_HEAD),
  sales("Suman Choudhary", SALES_HEAD),
  sales("Girija Sharma", SALES_HEAD, "Key Account Manager"),
  sales("Kishan Singh Rathor", REGIONAL_HEAD),
  sales("Joydeep Choudhury", SALES_HEAD),
  { fullName: "Rakesh Yadav", role: "PRESALES", title: "Senior Solution Architect" },
  { fullName: "Amit Rampal", role: "PRESALES", title: "Solution Architect" },
  { fullName: "Ramraj Yadav", role: "PRESALES", title: "Presales Consultant" },
  { fullName: "Pabitra Mohapatra", role: "PRESALES", title: "Presales Consultant" },
  { fullName: "Sunil Kumar", role: "PRESALES", title: "Solution Architect" },
  { fullName: "Meera Iyer", role: "PURCHASE", title: "Purchase Manager" },
  { fullName: "Deepak Verma", role: "PURCHASE", title: "Purchase Executive" },
];

export function emailOf(p: SeedPerson): string {
  return (
    p.email ??
    p.fullName
      .toLowerCase()
      .replace(/[^a-z ]/g, "")
      .trim()
      .split(/\s+/)
      .join(".") + "@progression.com"
  );
}
