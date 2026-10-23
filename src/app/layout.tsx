import type { Metadata } from "next";
import "@fontsource-variable/inter/opsz.css";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Progression CRM", template: "%s · Progression CRM" },
  description: "Pipeline, presales and purchase workflow for Progression",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={GeistMono.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
