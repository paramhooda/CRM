"use client";

// The root error page renders without the stylesheet, so it is the one place that carries inline values.
// They mirror the tokens in globals.css (muted text, brand-600 button, 8px radius).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Geist, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", fontSize: 14, padding: "4rem 1.5rem", textAlign: "center", background: "#fafafa", color: "#09090b" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.01em" }}>Something went wrong</h1>
        <p style={{ color: "#71717a", marginTop: "0.5rem" }}>{error.digest ? `Reference ${error.digest}.` : ""} Try again, and tell an administrator if it keeps happening.</p>
        <button onClick={reset} style={{ marginTop: "1.5rem", height: 36, padding: "0 1rem", borderRadius: 8, background: "#2563eb", color: "#ffffff", border: 0, cursor: "pointer", fontWeight: 500 }}>Try again</button>
      </body>
    </html>
  );
}
