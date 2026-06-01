import { spawn, type ChildProcess } from "node:child_process";

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const URL_RE = /https?:\/\/[^\s\x1b]+/;
const CODE_RE = /\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/;

export const stripAnsi = (s: string) => s.replace(ANSI_RE, "");

export type RunResult = { exitCode: number; stdout: string; stderr: string };

export const spawnCodex = (args: string[]): ChildProcess =>
  spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });

export function runCodex(args: string[], timeoutMs = 10_000): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawnCodex(args);
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c) => (stdout += c.toString()));
    proc.stderr?.on("data", (c) => (stderr += c.toString()));
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, timeoutMs);
    const done = (exitCode: number) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    };
    proc.once("exit", (c) => done(c ?? 1));
    proc.once("error", () => done(127));
  });
}

export function loginStatus(r: RunResult) {
  const output = stripAnsi(r.stdout + r.stderr).trim();
  const loggedIn = r.exitCode === 0 && !/not\s+(?:signed|logged)\s+in/i.test(output);
  return { loggedIn, exitCode: r.exitCode, output };
}

export function captureDeviceAuth(
  proc: ChildProcess,
  timeoutMs = 20_000,
): Promise<{ url: string; code: string }> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += stripAnsi(chunk.toString());
      const url = buf.match(URL_RE)?.[0];
      const code = buf.match(CODE_RE)?.[0];
      if (url && code) resolve({ url, code });
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.once("error", reject);
    proc.once("exit", (c) =>
      reject(new Error(`codex exited (${c}) before device code: ${buf.slice(-200)}`)),
    );
    setTimeout(() => reject(new Error("timed out waiting for device code")), timeoutMs);
  });
}

