"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/validation";

export async function saveView(page: string, name: string, query: string): Promise<ActionResult> {
  const user = await requireUser();
  const v = z.object({ page: z.string().max(40), name: z.string().trim().min(1).max(60), query: z.string().max(2000) }).safeParse({ page, name, query });
  if (!v.success) return { ok: false, error: "Give the view a name." };
  await db.savedView.create({ data: { userId: user.id, ...v.data } });
  revalidatePath(page);
  return { ok: true };
}

export async function deleteView(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.savedView.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/opportunities");
  return { ok: true };
}
