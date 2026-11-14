import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { publicSetting } from "@/server/services/settings";
import { PageHeader } from "@/components/crm/page-header";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const [company, mail, alerts, ai] = await Promise.all([publicSetting(actor, "company"), publicSetting(actor, "mail"), publicSetting(actor, "alerts"), publicSetting(actor, "ai")]);
  return (
    <>
      <PageHeader title="Settings" description="Your company on quotes, the mail server the portal sends through, the alerts the team sees, and the assistant." />
      <SettingsForms company={company} mail={mail} alerts={alerts} ai={ai} adminEmail={actor.email} />
    </>
  );
}
