"use client";
import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";

/** The deal's tabs follow `?tab=` so an "Open lines" link lands on the right tab, and still switch instantly on click. */
export function DealTabs({ tab, children }: { tab: string; children: ReactNode }) {
  const [value, setValue] = useState(tab);
  const [seen, setSeen] = useState(tab);
  if (seen !== tab) {
    // The URL changed (a link to another tab): follow it
    setSeen(tab);
    setValue(tab);
  }
  return <Tabs value={value} onValueChange={setValue} className="mt-6">{children}</Tabs>;
}
