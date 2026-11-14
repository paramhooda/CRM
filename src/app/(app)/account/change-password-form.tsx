"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormActions, FormError } from "@/components/crm/form";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { changePasswordSchema } from "@/contracts/auth";
import { useActor } from "@/components/crm/providers";

export function ChangePasswordForm() {
  const router = useRouter();
  const actor = useActor();
  const f = useForm({ currentPassword: "", newPassword: "" }, changePasswordSchema);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>At least 10 characters, with a letter and a number. Other devices are signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void f.submit(async (v) => {
              await api.post("/auth/change-password", v);
              toast.success("Password changed");
              f.setValues({ currentPassword: "", newPassword: "" });
              router.replace(actor.mustChangePassword ? "/" : "/account");
              router.refresh();
            });
          }}
        >
          <Field label="Current password" htmlFor="currentPassword" error={f.errors.currentPassword} required>
            <Input id="currentPassword" type="password" autoComplete="current-password" value={f.values.currentPassword} onChange={(e) => f.set("currentPassword", e.target.value)} aria-invalid={!!f.errors.currentPassword} />
          </Field>
          <Field label="New password" htmlFor="newPassword" error={f.errors.newPassword} required>
            <Input id="newPassword" type="password" autoComplete="new-password" value={f.values.newPassword} onChange={(e) => f.set("newPassword", e.target.value)} aria-invalid={!!f.errors.newPassword} />
          </Field>
          <FormError message={f.formError} />
          <FormActions>
            <Button type="submit" disabled={f.pending}>Save new password</Button>
          </FormActions>
        </form>
      </CardContent>
    </Card>
  );
}
