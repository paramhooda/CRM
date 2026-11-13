"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#5f5e7a", marginTop: "0.5rem" }}>{error.digest ? `Reference ${error.digest}.` : ""} Try again, and tell an administrator if it keeps happening.</p>
        <button onClick={reset} style={{ marginTop: "1.5rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "#5b5bd6", color: "white", border: 0, cursor: "pointer" }}>Try again</button>
      </body>
    </html>
  );
}
