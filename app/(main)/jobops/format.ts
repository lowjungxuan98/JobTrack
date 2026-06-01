export type ExpandTab = "batches" | "logs";

export const POLL_MS = 2000;

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function duration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—";
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const s = Math.max(0, Math.floor((end - new Date(startIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
