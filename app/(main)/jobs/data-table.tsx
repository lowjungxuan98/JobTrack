"use client";

import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  Row,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  FacetedFilterOption,
  normalizeFacetValue,
  TableFacetedFilter,
} from "@/components/table-faceted-filter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

const selectedValuesFilter: FilterFn<unknown> = (
  row: Row<unknown>,
  columnId: string,
  filterValue: unknown,
) => {
  const selectedValues = Array.isArray(filterValue) ? filterValue : [];

  if (!selectedValues.length) {
    return true;
  }

  return selectedValues.includes(normalizeFacetValue(row.getValue(columnId)));
};

selectedValuesFilter.autoRemove = (value) =>
  !Array.isArray(value) || value.length === 0;

function getHeaderLabel(header: unknown, fallback: string) {
  return typeof header === "string" ? header : fallback;
}

function getFacetedOptions<TData, TValue>(
  column: Column<TData, TValue>,
): FacetedFilterOption[] {
  return Array.from(column.getFacetedUniqueValues().entries())
    .map(([value, count]) => {
      const normalized = normalizeFacetValue(value);

      return {
        value: normalized,
        label: normalized || "Blank",
        count,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    initialState: { pagination: { pageSize: 10 } },
    autoResetPageIndex: false,
    defaultColumn: { filterFn: selectedValuesFilter as FilterFn<TData> },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  });

  const headerGroups = table.getHeaderGroups();
  const filterHeaders = headerGroups[headerGroups.length - 1]?.headers ?? [];

  return (
    <div className="w-full space-y-3">
      {columnFilters.length ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setColumnFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : null}

      <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <Table>
          <TableHeader>
            {headerGroups.map((hg) => (
              <TableRow key={hg.id} className="bg-zinc-100 dark:bg-zinc-900">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-zinc-600 dark:text-zinc-400 uppercase text-xs py-3 px-4 cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" && " ↑"}
                    {header.column.getIsSorted() === "desc" && " ↓"}
                  </TableHead>
                ))}
              </TableRow>
            ))}
            <TableRow className="bg-background">
              {filterHeaders.map((header) => (
                <TableHead key={`${header.id}-filter`} className="py-2 px-4">
                  {!header.isPlaceholder && header.column.getCanFilter() ? (
                    <TableFacetedFilter
                      label={getHeaderLabel(header.column.columnDef.header, header.id)}
                      options={getFacetedOptions(header.column)}
                      selectedValues={
                        (header.column.getFilterValue() as string[] | undefined) ?? []
                      }
                      onSelectedValuesChange={(values) =>
                        header.column.setFilterValue(values)
                      }
                    />
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 px-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-zinc-500">
                  No jobs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-500">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-zinc-500">
            <span>Show</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={String(pageSize)}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>entries</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ← Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
