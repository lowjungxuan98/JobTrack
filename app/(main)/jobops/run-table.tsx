"use client";

import { Fragment, useMemo, useState } from "react";
import { ListChecksIcon, ScrollTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  makeFacetedOptions,
  TableFacetedFilter,
} from "@/components/table-faceted-filter";
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

type RunFilters = {
  started: string[];
  kind: string[];
  status: string[];
  batches: string[];
  stage: string[];
  duration: string[];
  run: string[];
};

const INITIAL_FILTERS: RunFilters = {
  started: [],
  kind: [],
  status: [],
  batches: [],
  stage: [],
  duration: [],
  run: [],
};

function matchesSelected(value: string, selectedValues: string[]) {
  return selectedValues.length === 0 || selectedValues.includes(value);
}

function batchProgress(run: RunSummary) {
  return run.total_batches != null ? `${run.current_batch ?? 0} / ${run.total_batches}` : "—";
}

function stageLabel(run: RunSummary) {
  return run.status === "running" ? "in flight" : "";
}

export function RunTable({ runs, expanded, onExpandedChange }: RunTableProps) {
  const [filters, setFilters] = useState<RunFilters>(INITIAL_FILTERS);
  const filterOptions = useMemo(
    () => ({
      started: makeFacetedOptions(runs, (run) => timeAgo(run.started_at)),
      kind: makeFacetedOptions(runs, (run) => run.kind),
      status: makeFacetedOptions(runs, (run) => run.status),
      batches: makeFacetedOptions(runs, (run) => batchProgress(run)),
      stage: makeFacetedOptions(runs, (run) => stageLabel(run)),
      duration: makeFacetedOptions(runs, (run) => duration(run.started_at, run.finished_at)),
      run: makeFacetedOptions(runs, (run) => shortId(run.id)),
    }),
    [runs],
  );

  const filteredRuns = useMemo(
    () =>
      runs.filter((run) =>
        matchesSelected(timeAgo(run.started_at), filters.started) &&
        matchesSelected(run.kind, filters.kind) &&
        matchesSelected(run.status, filters.status) &&
        matchesSelected(batchProgress(run), filters.batches) &&
        matchesSelected(stageLabel(run), filters.stage) &&
        matchesSelected(duration(run.started_at, run.finished_at), filters.duration) &&
        matchesSelected(shortId(run.id), filters.run),
      ),
    [runs, filters],
  );

  const updateFilter = (key: keyof RunFilters, value: string[]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-lg border bg-card">
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
          <TableRow className="bg-background">
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Started"
                className="min-w-28"
                options={filterOptions.started}
                selectedValues={filters.started}
                onSelectedValuesChange={(values) => updateFilter("started", values)}
              />
            </TableHead>
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Kind"
                className="min-w-24"
                options={filterOptions.kind}
                selectedValues={filters.kind}
                onSelectedValuesChange={(values) => updateFilter("kind", values)}
              />
            </TableHead>
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Status"
                className="min-w-28"
                options={filterOptions.status}
                selectedValues={filters.status}
                onSelectedValuesChange={(values) => updateFilter("status", values)}
              />
            </TableHead>
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Batches"
                className="min-w-28"
                options={filterOptions.batches}
                selectedValues={filters.batches}
                onSelectedValuesChange={(values) => updateFilter("batches", values)}
              />
            </TableHead>
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Stage"
                className="min-w-28"
                options={filterOptions.stage}
                selectedValues={filters.stage}
                onSelectedValuesChange={(values) => updateFilter("stage", values)}
              />
            </TableHead>
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Duration"
                className="min-w-28"
                options={filterOptions.duration}
                selectedValues={filters.duration}
                onSelectedValuesChange={(values) => updateFilter("duration", values)}
              />
            </TableHead>
            <TableHead className="py-2">
              <TableFacetedFilter
                label="Run"
                className="min-w-28"
                options={filterOptions.run}
                selectedValues={filters.run}
                onSelectedValuesChange={(values) => updateFilter("run", values)}
              />
            </TableHead>
            <TableHead className="py-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRuns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                {runs.length ? "No runs match filters." : "No runs yet."}
              </TableCell>
            </TableRow>
          ) : (
            filteredRuns.map((run) => (
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
        <TableCell className="font-mono text-xs">{batchProgress(run)}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {stageLabel(run)}
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
