import { CodexError } from "./codex-client";
import { extractFirstJson } from "./json-extract";
import { log } from "./logging";

export async function llmJson(
  stage: string,
  label: string,
  prompt: string,
  chatFn: (p: string) => Promise<string>,
): Promise<Record<string, unknown> | null> {
  let reply: string;
  try {
    reply = await chatFn(prompt);
  } catch (e) {
    if (e instanceof CodexError) {
      log(stage, `LLM call failed for ${label} (${e.message}) - skipping`);
      return null;
    }
    throw e;
  }
  const data = extractFirstJson(reply);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    log(stage, `no JSON object in LLM reply for ${label} - skipping`);
    log(stage, `  raw reply: ${(reply || "").slice(0, 400)}`);
    return null;
  }
  return data as Record<string, unknown>;
}

export async function llmJsonArray(
  stage: string,
  label: string,
  prompt: string,
  chatFn: (p: string) => Promise<string>,
): Promise<Record<string, unknown>[] | null> {
  let reply: string;
  try {
    reply = await chatFn(prompt);
  } catch (e) {
    if (e instanceof CodexError) {
      log(stage, `LLM call failed for ${label} (${e.message}) - skipping`);
      return null;
    }
    throw e;
  }
  const data = extractFirstJson(reply);
  if (!Array.isArray(data)) {
    log(stage, `no JSON array in LLM reply for ${label} - skipping`);
    log(stage, `  raw reply: ${(reply || "").slice(0, 400)}`);
    return null;
  }
  return (data as unknown[]).filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<
    string,
    unknown
  >[];
}
