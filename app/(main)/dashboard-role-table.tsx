"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

type DashboardRole = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

type RoleFilters = {
  role: string[];
  jobs: string[];
};

const INITIAL_FILTERS: RoleFilters = {
  role: [],
  jobs: [],
};

function matchesSelected(value: string | number, selectedValues: string[]) {
  return selectedValues.length === 0 || selectedValues.includes(String(value));
}

export function DashboardRoleTable({ roles }: { roles: DashboardRole[] }) {
  const [filters, setFilters] = useState<RoleFilters>(INITIAL_FILTERS);
  const roleOptions = useMemo(
    () => makeFacetedOptions(roles, (role) => role.name.replace(/_/g, " ")),
    [roles],
  );
  const jobOptions = useMemo(
    () => makeFacetedOptions(roles, (role) => role.count),
    [roles],
  );

  const filteredRoles = useMemo(
    () =>
      roles.filter((role) => {
        const roleName = role.name.replace(/_/g, " ");

        return (
          matchesSelected(roleName, filters.role) &&
          matchesSelected(role.count, filters.jobs)
        );
      }),
    [roles, filters],
  );

  const updateFilter = (key: keyof RoleFilters, value: string[]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <Table>
        <TableHeader className="bg-zinc-100 text-xs uppercase text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <TableRow>
            <TableHead className="py-3 px-4">Role</TableHead>
            <TableHead className="py-3 px-4 text-right">Jobs</TableHead>
            <TableHead className="py-3 px-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
          <TableRow className="bg-background">
            <TableHead className="py-2 px-4">
              <TableFacetedFilter
                label="Role"
                className="min-w-40"
                options={roleOptions}
                selectedValues={filters.role}
                onSelectedValuesChange={(values) => updateFilter("role", values)}
              />
            </TableHead>
            <TableHead className="py-2 px-4">
              <TableFacetedFilter
                label="Jobs"
                className="ml-auto min-w-28"
                options={jobOptions}
                selectedValues={filters.jobs}
                onSelectedValuesChange={(values) => updateFilter("jobs", values)}
              />
            </TableHead>
            <TableHead className="py-2 px-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRoles.length ? (
            filteredRoles.map((role) => (
              <TableRow
                key={role.id}
                className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <TableCell className="py-3 px-4 font-medium capitalize">
                  {role.name.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400">
                  {role.count}
                </TableCell>
                <TableCell className="py-3 px-4 text-right">
                  <Link
                    href={`/jobs?role=${role.slug}`}
                    className="text-xs text-zinc-500 hover:text-black dark:hover:text-white"
                  >
                    View →
                  </Link>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-zinc-500">
                {roles.length ? "No roles match filters." : "No roles found."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
