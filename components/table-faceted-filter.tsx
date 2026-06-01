"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FacetedFilterOption = {
  value: string;
  label: string;
  count: number;
};

interface TableFacetedFilterProps {
  label: string;
  options: FacetedFilterOption[];
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
  className?: string;
}

export function makeFacetedOptions<T>(
  rows: T[],
  getValue: (row: T) => string | number | null | undefined,
): FacetedFilterOption[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = normalizeFacetValue(getValue(row));
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts, ([value, count]) => ({
    value,
    label: value || "Blank",
    count,
  })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function normalizeFacetValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

export function TableFacetedFilter({
  label,
  options,
  selectedValues,
  onSelectedValuesChange,
  className,
}: TableFacetedFilterProps) {
  const [search, setSearch] = useState("");
  const selectedSet = new Set(selectedValues);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return options;
    }

    return options.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [options, search]);
  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);
  const triggerText =
    selectedLabels.length === 0
      ? label
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} selected`;

  const toggleValue = (value: string) => {
    const next = new Set(selectedValues);

    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }

    onSelectedValuesChange(Array.from(next));
  };

  return (
    <DropdownMenuPrimitive.Root onOpenChange={(open) => !open && setSearch("")}>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-7 min-w-32 justify-between px-2 text-xs font-normal", className)}
          disabled={options.length === 0}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronDownIcon className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          className="z-50 max-h-80 min-w-56 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <DropdownMenuPrimitive.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {label}
          </DropdownMenuPrimitive.Label>
          <div className="px-1 pb-1">
            <Input
              aria-label={`Search ${label}`}
              className="h-7"
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
          <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
          {filteredOptions.map((option) => (
            <DropdownMenuPrimitive.CheckboxItem
              key={option.value || "__blank__"}
              checked={selectedSet.has(option.value)}
              onCheckedChange={() => toggleValue(option.value)}
              onSelect={(event) => event.preventDefault()}
              className="group relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground"
            >
              <span className="absolute left-2 flex size-4 items-center justify-center rounded-sm border border-input bg-background text-primary group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground">
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon className="size-4" />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="ml-3 text-xs text-muted-foreground">{option.count}</span>
            </DropdownMenuPrimitive.CheckboxItem>
          ))}
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              No values found.
            </div>
          ) : null}
          {selectedValues.length ? (
            <>
              <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
              <DropdownMenuPrimitive.Item
                onSelect={(event) => {
                  event.preventDefault();
                  onSelectedValuesChange([]);
                }}
                className="cursor-default rounded-md px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground"
              >
                Clear
              </DropdownMenuPrimitive.Item>
            </>
          ) : null}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
