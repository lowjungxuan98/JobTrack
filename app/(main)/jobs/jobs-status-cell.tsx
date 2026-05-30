"use client";

import { useTransition } from "react";
import type { JobsStatus } from "@/app/generated/prisma/enums";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateJobsStatus } from "@/app/actions/update-jobs-status";
import {
  JOBS_STATUS_LABELS,
  JOBS_STATUS_VALUES,
} from "./jobs-status";

export function JobsStatusCell({
  id,
  value,
}: {
  id: string;
  value: JobsStatus;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(() => updateJobsStatus(id, next as JobsStatus))
      }
    >
      <SelectTrigger className="h-8 w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JOBS_STATUS_VALUES.map((s) => (
          <SelectItem key={s} value={s}>
            {JOBS_STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
