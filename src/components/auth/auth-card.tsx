import { Logo } from "@/components/crm/logo";

/** The centred card used by sign-in, password change and password reset */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo height={36} />
          <p className="text-[13px] text-ink-3">CRM · Systems integration and managed services</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-ink-3">Protected system. Access is logged and audited.</p>
      </div>
    </main>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "ok"; children: React.ReactNode }) {
  const style = tone === "error" ? { background: "var(--t-red-bg)", color: "var(--t-red)" } : { background: "var(--t-green-bg)", color: "var(--t-green)" };
  return <p role={tone === "error" ? "alert" : "status"} className="rounded-md px-2.5 py-1.5 text-xs" style={style}>{children}</p>;
}
