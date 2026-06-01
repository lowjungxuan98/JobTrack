"use client";

import { useCallback, useState } from "react";
import { PlayIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchRecentRuns } from "./actions";
import { type ExpandTab, POLL_MS, shortId } from "./format";
import { RunTable } from "./run-table";
import { usePolling } from "./use-polling";

export default function JobOpsPage() {
  const [expanded, setExpanded] = useState<{ id: string; tab: ExpandTab } | null>(null);
  const [triggering, setTriggering] = useState<"run" | "retry" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const loadRuns = useCallback(() => fetchRecentRuns(), []);
  const { data: runs, error, refresh } = usePolling(loadRuns, POLL_MS, []);

  const trigger = useCallback(
    async (kind: "run" | "retry") => {
      setTriggering(kind);
      setFlash(null);
      try {
        const res = await fetch(`/api/jobops/${kind}`, { method: "POST" });
        const body = (await res.json()) as { ok: boolean; run_id?: string; error?: string };
        setFlash(
          body.ok && body.run_id
            ? `Started ${kind} → ${shortId(body.run_id)}`
            : `Failed to start: ${body.error ?? "unknown error"}`,
        );
        if (body.ok) await refresh();
      } catch (e) {
        setFlash(`Failed: ${(e as Error).message}`);
      } finally {
        setTriggering(null);
      }
    },
    [refresh],
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="w-full min-w-0">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">JobOps</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Trigger pipelines and watch progress in real time.
            </p>
          </div>
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                onClick={() => trigger("run")}
                disabled={triggering !== null}
              >
                <PlayIcon />
                {triggering === "run" ? "Starting..." : "Run full pipeline"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => trigger("retry")}
                disabled={triggering !== null}
              >
                <RotateCcwIcon />
                {triggering === "retry" ? "Starting..." : "Retry failed"}
              </Button>
            </div>
            {flash ? <div className="text-xs text-muted-foreground">{flash}</div> : null}
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <RunTable runs={runs} expanded={expanded} onExpandedChange={setExpanded} />

        <footer className="mt-4 text-xs text-muted-foreground">
          Polls every {POLL_MS / 1000}s.
        </footer>
      </div>
    </div>
  );
}
