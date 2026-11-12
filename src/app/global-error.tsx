"use client";
// Last-resort error page when the root layout itself fails. Kept dependency-free: it replaces the whole document.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#f7f7f8", color: "#18181b" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Progression CRM is having trouble</h1>
          <p style={{ fontSize: 13, color: "#52525b" }}>
            Reload the page in a minute. If it keeps happening, tell your administrator{error.digest ? ` and quote reference ${error.digest}` : ""}.
          </p>
          <button onClick={reset} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 6, border: "1px solid #d4d4d8", background: "#fff", cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
