"use client";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** The one form field: label, control, hint, error. */
export function Field({ label, htmlFor, error, hint, required, children, className }: { label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{message}</p>;
}

/** A select over {id, name} options with an optional "none" row. */
export function OptionSelect({ id, value, onChange, options, placeholder = "Choose", none, disabled, invalid, label }: { id?: string; value: string | null | undefined; onChange: (v: string | null) => void; options: { id: string; name: string }[]; placeholder?: string; none?: string; disabled?: boolean; invalid?: boolean; label?: string }) {
  return (
    <Select value={value ?? (none !== undefined ? "__none" : "")} onValueChange={(v) => onChange(v === "__none" ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} aria-invalid={invalid} aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {none !== undefined && <SelectItem value="__none">{none}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border pt-4", className)}>{children}</div>;
}
