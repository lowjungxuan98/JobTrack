"use client";

import { useCallback, useEffect, useRef } from "react";
import { ListChecksIcon, ScrollTextIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchRunDetail, fetchRunLog, type BatchSummary } from "./actions";
import { type ExpandTab, POLL_MS, duration } from "./format";
import { StatusBadge } from "./status-badge";
import { usePolling } from "./use-polling";

function BatchTable({ batches }: { batches: BatchSummary[] }) {
  if (!batches.length) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        No batches yet. The worker writes its first batch row when stage 01 begins.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Rows</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => (
          <TableRow key={batch.id}>
            <TableCell className="font-mono">{batch.batch_index}</TableCell>
            <TableCell className="font-mono text-xs">
              {batch.row_start}-{batch.row_end}
            </TableCell>
            <TableCell>
              <StatusBadge status={batch.status} />
            </TableCell>
            <TableCell className="font-mono text-xs">{batch.current_stage ?? "-"}</TableCell>
            <TableCell className="font-mono text-xs">
              {duration(batch.started_at, batch.finished_at)}
            </TableCell>
            <TableCell className="text-xs text-destructive">
              {batch.error ? batch.error.slice(0, 80) : ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BatchesPanel({ runId }: { runId: string }) {
  const loadBatches = useCallback(async () => (await fetchRunDetail(runId)).batches, [runId]);
  const { data: batches } = usePolling(loadBatches, POLL_MS, [] as BatchSummary[]);
  return <BatchTable batches={batches} />;
}

function LogsPanel({ runId }: { runId: string }) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const loadLog = useCallback(() => fetchRunLog(runId), [runId]);
  const { data: log, error } = usePolling<string | null>(loadLog, POLL_MS, null);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  if (error) {
    return <div className="px-4 py-3 text-sm text-destructive">failed to read log: {error}</div>;
  }
  if (log === null) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!log) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        No log output yet.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[480px] bg-zinc-950">
      <pre
        ref={preRef}
        className="min-w-max px-4 py-3 font-mono text-[11px] leading-relaxed text-zinc-200"
      >
        {log}
      </pre>
    </ScrollArea>
  );
}

export function ExpandedRun({ runId, tab }: { runId: string; tab: ExpandTab }) {
  return (
    <Tabs
      key={`${runId}-${tab}`}
      defaultValue={tab}
      className="gap-0 bg-muted/30"
    >
      <div className="border-b px-3 py-2">
        <TabsList>
          <TabsTrigger value="batches">
            <ListChecksIcon />
            Batches
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollTextIcon />
            Logs
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="batches" className="m-0">
        <BatchesPanel runId={runId} />
      </TabsContent>
      <TabsContent value="logs" className="m-0">
        <LogsPanel runId={runId} />
      </TabsContent>
    </Tabs>
  );
}
