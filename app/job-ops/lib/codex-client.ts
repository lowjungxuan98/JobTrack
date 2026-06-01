// Codex CLI client (headless). Replaces the original codewhale-based
// deepseek_client. Shells out to `codex exec --json` for non-interactive
// completions and extracts the assistant's final text reply.
import { spawn } from "node:child_process";
import { cfgInt, cfgNumber, cfgString } from "./config";

export class CodexError extends Error {}

interface RunOptions {
  model?: string;
  timeoutMs?: number;
}

function bin(): string {
  return cfgString("codex.bin", "codex");
}

function defaultModel(): string {
  return cfgString("codex.model", "");
}

function timeoutMs(): number {
  return cfgInt("codex.timeout", 600) * 1000;
}

function retries(): number {
  return Math.max(1, cfgInt("codex.retries", 3));
}

function retryBackoff(): number {
  return cfgNumber("codex.retry_backoff", 4.0);
}

function buildArgs(prompt: string, model: string | undefined): string[] {
  // --search is a TOP-LEVEL flag (before the `exec` subcommand). It enables the
  // native Responses `web_search` tool so the model can ground answers in live
  // pages instead of hallucinating. Always on — the pipeline's prompts assume
  // live web access.
  const args = ["--search", "exec", "--json", "--skip-git-repo-check"];
  const m = model ?? defaultModel();
  if (m) args.push("-m", m);
  args.push(prompt);
  return args;
}

const ANSI_RE = /\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

// Codex `exec --json` emits NDJSON events (one JSON object per line).
// As of codex 0.135, the assistant reply lands in an event shaped like
//   {"type":"item.completed","item":{"id":"...","type":"agent_message","text":"..."}}
// We also tolerate alternative shapes (assistant_message, top-level text/
// message/content, and streaming deltas) so the parser survives codex
// version drift.
function isAssistantType(type: string): boolean {
  return /assistant|agent|message|final|response|completion/i.test(type);
}

function pickText(node: Record<string, unknown>): string | null {
  for (const key of ["text", "message", "content", "output"] as const) {
    if (typeof node[key] === "string") return node[key] as string;
  }
  return null;
}

function extractAssistantText(stdout: string): string {
  const lines = stdout.split(/\r?\n/);
  let lastText = "";
  let lastDelta: string[] = [];
  let plainBuffer = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith("{") && !line.startsWith("[")) {
      plainBuffer += (plainBuffer ? "\n" : "") + line;
      continue;
    }
    let evt: unknown;
    try {
      evt = JSON.parse(line);
    } catch {
      plainBuffer += (plainBuffer ? "\n" : "") + line;
      continue;
    }
    if (!evt || typeof evt !== "object" || Array.isArray(evt)) continue;
    const e = evt as Record<string, unknown>;
    const type = String(e.type ?? e.event ?? "");

    // Nested codex shape: {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
    const item = e.item;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const inner = item as Record<string, unknown>;
      const innerType = String(inner.type ?? "");
      const innerText = pickText(inner);
      if (innerText && isAssistantType(innerType)) {
        lastText = innerText;
        lastDelta = [];
        continue;
      }
    }

    // Top-level full-message events.
    const fullText = pickText(e);
    if (
      fullText &&
      (isAssistantType(type) ||
        type === "" ||
        (e.role && String(e.role) === "assistant"))
    ) {
      lastText = fullText;
      lastDelta = [];
      continue;
    }

    // Streaming delta events: collect until a full message arrives.
    if (/delta|chunk|token/i.test(type)) {
      const delta =
        typeof e.delta === "string"
          ? (e.delta as string)
          : pickText(e) ?? "";
      if (delta) lastDelta.push(delta);
    }
  }
  if (lastText) return lastText;
  if (lastDelta.length) return lastDelta.join("");
  return plainBuffer;
}

function runOnce(prompt: string, opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = buildArgs(prompt, opts.model);
    let proc;
    try {
      proc = spawn(bin(), args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    } catch {
      reject(new CodexError(`codex binary not found: ${bin()}`));
      return;
    }
    let stdout = "";
    let stderr = "";
    const to = opts.timeoutMs ?? timeoutMs();
    const timer = setTimeout(() => {
      try {
        proc!.kill("SIGKILL");
      } catch {}
      reject(new CodexError(`codex timed out after ${to / 1000}s`));
    }, to);
    proc.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    proc.once("error", (err: Error) => {
      clearTimeout(timer);
      reject(new CodexError(`codex spawn failed: ${err.message}`));
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = stripAnsi((stderr || stdout).trim()).slice(-300);
        reject(new CodexError(`codex exit ${code}: ${tail}`));
        return;
      }
      const cleaned = stripAnsi(stdout);
      const text = extractAssistantText(cleaned);
      resolve(text.trim() || cleaned.trim());
    });
  });
}

async function run(prompt: string, opts: RunOptions = {}): Promise<string> {
  let last: CodexError | null = null;
  const attempts = retries();
  for (let i = 1; i <= attempts; i++) {
    try {
      return await runOnce(prompt, opts);
    } catch (e) {
      last = e instanceof CodexError ? e : new CodexError(String(e));
      if (i < attempts) {
        const delay = retryBackoff() * i * 1000;
        process.stderr.write(
          `codex: transient failure (${last.message}); retry ${i}/${attempts - 1} in ${(
            delay / 1000
          ).toFixed(0)}s\n`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new CodexError(`all ${attempts} attempts failed: ${last?.message}`);
}

export async function chat(prompt: string, model?: string): Promise<string> {
  return run(prompt, { model });
}

// Retained for call-site clarity. All codex calls now go through `--search`,
// so this is identical to `chat()`.
export async function chatWebsearch(prompt: string, model?: string): Promise<string> {
  return run(prompt, { model });
}

export const _internal = { extractAssistantText, stripAnsi };
