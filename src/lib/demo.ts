/** Password the demo data gives every user. Only shown on the sign-in page when DEMO_LOGINS=true. */
export const DEMO_PASSWORD = "Progression@123";

export const demoLoginsOn = () => (process.env.DEMO_LOGINS ?? "false").toLowerCase() === "true";
