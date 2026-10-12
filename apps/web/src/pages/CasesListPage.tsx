import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CaseDetail } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { PaginatedTable, ColumnDef } from "../components/PaginatedTable";
import { LifecycleStatusBadge, DeadlineBadge } from "../components/StatusBadges";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDate } from "../utils/date";

export const CasesListPage: React.FC = () => {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cases", { status, page, pageSize }],
    queryFn: () => api.cases.list({ status: status || undefined, page, pageSize }),
  });

  const columns: ColumnDef<CaseDetail>[] = [
    {
      key: "case",
      header: "Case & Student",
      render: (c) => {
        const isCohortTask = c.studentId.startsWith("COHORT-REVIEW:");
        return (
          <div>
            <Link
              to={`/cases/${c.id}`}
              className="font-semibold text-blue-700 hover:underline"
            >
              {c.id} — {c.studentName}
            </Link>
            <div className="text-xs text-slate-500">
              {isCohortTask ? "Cohort Task: " : "Student ID: "}
              <Link
                to={
                  isCohortTask
                    ? `/students?cohort=${encodeURIComponent(c.cohort)}`
                    : `/students/${c.studentId}`
                }
                className="font-medium text-slate-700 hover:underline"
              >
                {c.studentId}
              </Link>{" "}
              • Cohort: {c.cohort}
            </div>
          </div>
        );
      },
    },
    {
      key: "lifecycle",
      header: "Lifecycle Status",
      render: (c) => <LifecycleStatusBadge status={c.status} />,
    },
    {
      key: "deadline",
      header: "Deadline & Timeliness",
      render: (c) => (
        <div className="flex flex-col gap-1 items-start">
          <DeadlineBadge status={c.deadlineStatus} />
          <span className="text-xs text-slate-500">
            {formatLocalDate(c.deadline)}
          </span>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner & Intervention",
      render: (c) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900">
            {c.ownerName ?? "Unassigned"}
          </div>
          <div className="text-slate-600">
            {c.selectedIntervention ?? c.recommendedIntervention ?? "Pending decision"}
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (c) => (
        <Link
          to={`/cases/${c.id}`}
          className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
        >
          Review Case
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Support Cases</h1>
          <p className="text-xs text-slate-600">
            Human-reviewed support cases with separate lifecycle and deadline tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="case-status-filter"
            className="text-xs font-semibold text-slate-700"
          >
            Filter Status:
          </label>
          <select
            id="case-status-filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
          >
            <option value="">All statuses</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="ACTION_COMPLETED">ACTION_COMPLETED</option>
            <option value="OUTCOME_REVIEWED">OUTCOME_REVIEWED</option>
            <option value="CLOSED">CLOSED</option>
            <option value="DEFERRED">DEFERRED</option>
            <option value="DECLINED">DECLINED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="REOPENED">REOPENED</option>
          </select>
          {status && (
            <button
              type="button"
              onClick={() => {
                setStatus("");
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton lines={5} label="Loading cases..." />
      ) : error ? (
        <PanelErrorState
          error={error}
          onRetry={() => void refetch()}
          panelName="Cases list"
        />
      ) : (
        <PaginatedTable
          caption="Support cases table"
          columns={columns}
          items={data?.items ?? []}
          getRowKey={(c) => c.id}
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          onPageChange={setPage}
        />
      )}
    </div>
  );
};

