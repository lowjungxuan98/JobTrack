"use client";

import { Fragment } from "react";
import { ListChecksIcon, ScrollTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RunSummary } from "./actions";
import { duration, type ExpandTab, shortId, timeAgo } from "./format";
import { ExpandedRun } from "./run-panels";
import { StatusBadge } from "./status-badge";

interface RunTableProps {
  runs: RunSummary[];
  expanded: { id: string; tab: ExpandTab } | null;
  onExpandedChange: (expanded: { id: string; tab: ExpandTab } | null) => void;
}

export function RunTable({ runs, expanded, onExpandedChange }: RunTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Batches</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Run</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                No runs yet.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                expanded={expanded}
                onExpandedChange={onExpandedChange}
              />
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function RunRow({
  run,
  expanded,
  onExpandedChange,
}: {
  run: RunSummary;
  expanded: RunTableProps["expanded"];
  onExpandedChange: RunTableProps["onExpandedChange"];
}) {
  const isOpen = expanded?.id === run.id;
  const tab = isOpen ? expanded.tab : null;
  const batchProgress =
    run.total_batches != null ? `${run.current_batch ?? 0} / ${run.total_batches}` : "—";

  const open = (next: ExpandTab) => {
    onExpandedChange(isOpen && tab === next ? null : { id: run.id, tab: next });
  };

  return (
    <Fragment>
      <TableRow>
        <TableCell className="text-xs">{timeAgo(run.started_at)}</TableCell>
        <TableCell className="font-mono text-xs">{run.kind}</TableCell>
        <TableCell>
          <StatusBadge status={run.status} />
        </TableCell>
        <TableCell className="font-mono text-xs">{batchProgress}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {run.status === "running" ? "in flight" : ""}
        </TableCell>
        <TableCell className="font-mono text-xs">{duration(run.started_at, run.finished_at)}</TableCell>
        <TableCell className="font-mono text-xs">{shortId(run.id)}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant={isOpen && tab === "batches" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => open("batches")}
            >
              <ListChecksIcon />
              Batches
            </Button>
            <Button
              variant={isOpen && tab === "logs" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => open("logs")}
            >
              <ScrollTextIcon />
              Logs
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isOpen && tab ? (
        <TableRow>
          <TableCell colSpan={8} className="p-0">
            <ExpandedRun runId={run.id} tab={tab} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}
