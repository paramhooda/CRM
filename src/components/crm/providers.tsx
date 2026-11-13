"use client";
import { createContext, useContext, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Lookups } from "@/server/services/lookups";
import type { Actor } from "@/server/auth/actor";

const LookupsContext = createContext<Lookups | null>(null);
const ActorContext = createContext<Actor | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      <Toaster position="top-center" closeButton />
    </ThemeProvider>
  );
}

export function AppDataProvider({ lookups, actor, children }: { lookups: Lookups; actor: Actor; children: ReactNode }) {
  return (
    <ActorContext.Provider value={actor}>
      <LookupsContext.Provider value={lookups}>{children}</LookupsContext.Provider>
    </ActorContext.Provider>
  );
}

export function useLookups(): Lookups {
  const v = useContext(LookupsContext);
  if (!v) throw new Error("useLookups outside AppDataProvider");
  return v;
}

export function useActor(): Actor {
  const v = useContext(ActorContext);
  if (!v) throw new Error("useActor outside AppDataProvider");
  return v;
}
