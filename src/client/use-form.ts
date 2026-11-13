"use client";
import { useCallback, useState } from "react";
import type { ZodType } from "zod";
import { toast } from "sonner";
import { isApiError } from "./api";

/**
 * Small form state: values, field errors (from zod on the client, then from the server), a pending flag and a
 * submit wrapper that turns both kinds of failure into messages next to the fields.
 */
export function useForm<T extends Record<string, unknown>>(initial: T, schema?: ZodType<unknown>) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!(key as string in e)) return e;
      const { [key as string]: _drop, ...rest } = e;
      return rest;
    });
  }, []);

  const submit = useCallback(
    async (action: (parsed: T) => Promise<void>) => {
      setFormError(null);
      let parsed = values;
      if (schema) {
        const r = schema.safeParse(values);
        if (!r.success) {
          const fe: Record<string, string> = {};
          for (const i of r.error.issues) {
            const k = i.path.map(String).join(".") || "_";
            if (!fe[k]) fe[k] = i.message;
          }
          setErrors(fe);
          return false;
        }
        parsed = r.data as T;
      }
      setPending(true);
      try {
        await action(parsed);
        return true;
      } catch (e) {
        if (isApiError(e)) {
          if (Object.keys(e.fields).length) setErrors(e.fields);
          setFormError(e.message);
          if (!Object.keys(e.fields).length) toast.error(e.message);
        } else {
          setFormError("Something went wrong. Please try again.");
          toast.error("Something went wrong. Please try again.");
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [values, schema],
  );

  return { values, set, setValues, errors, setErrors, pending, formError, submit };
}
