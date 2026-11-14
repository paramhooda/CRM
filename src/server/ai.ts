import "server-only";
import { AppError } from "./errors";
import type { Prompt } from "@/domain/ai-prompts";
import { getSetting } from "./services/settings";

/** The key and model: Admin → Settings → Assistant first, then the environment. */
export async function aiConfig(): Promise<{ apiKey: string; model: string } | null> {
  const s = await getSetting("ai");
  const apiKey = s.apiKey || process.env.OPENAI_API_KEY || "";
  return apiKey ? { apiKey, model: s.model || process.env.AI_MODEL || "gpt-4o-mini" } : null;
}

/** The assistant is on only when a key is set; nothing in the UI shows otherwise. */
export const aiEnabled = async () => !!(await aiConfig());
const TIMEOUT_MS = 20_000;

/** One chat completion against OpenAI. Deal text goes to OpenAI; the owner opted in by setting the key. */
export async function complete(p: Prompt): Promise<string> {
  const cfg = await aiConfig();
  if (!cfg) throw new AppError(404, "AI_OFF", "The assistant is not set up. An administrator adds an OpenAI key under Settings.");
  const key = cfg.apiKey;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.model, temperature: 0.4, max_tokens: p.maxTokens, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error("[ai] openai", res.status, detail);
      throw new AppError(502, "AI_UNAVAILABLE", res.status === 401 ? "The assistant's key was refused; check OPENAI_API_KEY." : res.status === 429 ? "The assistant is busy; try again in a minute." : "The assistant did not answer.");
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new AppError(502, "AI_UNAVAILABLE", "The assistant returned nothing.");
    return text;
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error("[ai] request failed", e instanceof Error ? e.message : e);
    throw new AppError(502, "AI_UNAVAILABLE", "The assistant could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

/** Proves the key and model: a one-word answer. */
export async function testAssistant() {
  const text = await complete({ system: "Answer in one word.", user: "Say OK.", maxTokens: 5 });
  return { ok: true, text };
}

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "file"; file: { filename: string; file_data: string } };

/** One completion with documents in the message and a JSON object back. Used by the document readers. */
export async function completeJson(system: string, parts: ContentPart[], maxTokens = 2500): Promise<unknown> {
  const cfg = await aiConfig();
  if (!cfg) throw new AppError(404, "AI_OFF", "The assistant is not set up. An administrator adds an OpenAI key under Settings.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.model, temperature: 0, max_tokens: maxTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: parts }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("[ai] openai", res.status, detail);
      throw new AppError(502, "AI_UNAVAILABLE", res.status === 401 ? "The assistant's key was refused; check it under Settings." : res.status === 429 ? "The assistant is busy; try again in a minute." : res.status === 400 ? "The assistant could not read one of the files (unsupported for this model)." : "The assistant did not answer.");
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new AppError(502, "AI_UNAVAILABLE", "The assistant returned nothing.");
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError(502, "AI_UNAVAILABLE", "The assistant's answer was not readable; try again.");
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error("[ai] request failed", e instanceof Error ? e.message : e);
    throw new AppError(502, "AI_UNAVAILABLE", "The assistant could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
