import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StudentSummary } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { PaginatedTable, ColumnDef } from "../components/PaginatedTable";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDate } from "../utils/date";

export const StudentsListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [cohort, setCohort] = useState(searchParams.get("cohort") ?? "");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["students", { search, cohort, page, pageSize }],
    queryFn: () => api.students.list({ search, cohort, page, pageSize }),
  });

  const columns: ColumnDef<StudentSummary>[] = [
    {
      key: "student",
      header: "Student",
      render: (s) => (
        <div>
          <Link
            to={`/students/${s.id}`}
            className="font-semibold text-blue-700 hover:underline"
          >
            {s.name}
          </Link>
          <div className="text-xs text-slate-500">{s.id}</div>
        </div>
      ),
    },
    {
      key: "cohort",
      header: "Cohort & Dept",
      render: (s) => (
        <div>
          <div className="font-medium text-slate-800">{s.cohort}</div>
          <div className="text-xs text-slate-500">
            {s.department} • Sem {s.semester}
          </div>
        </div>
      ),
    },
    {
      key: "attention",
      header: "Indicator Status",
      render: (s) =>
        s.needsAttention ? (
          <span
            role="status"
            aria-label="Indicator status: Needs attention"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300"
          >
            Needs attention
          </span>
        ) : (
          <span
            role="status"
            aria-label="Indicator status: No active flag"
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300"
          >
            Routine / No recent flag
          </span>
        ),
    },
    {
      key: "lastObs",
      header: "Last Observation",
      render: (s) =>
        s.lastObservationAt ? (
          <span className="text-xs text-slate-700">
            {formatLocalDate(s.lastObservationAt)}
          </span>
        ) : (
          <span className="text-xs text-slate-500 italic">
            No recent observations
          </span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (s) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/students/${s.id}`}
            className="px-2.5 py-1 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Open 360
          </Link>
          {s.activeCaseId && (
            <Link
              to={`/cases/${s.activeCaseId}`}
              className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Case {s.activeCaseId}
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Students Directory</h1>
          <p className="text-xs text-slate-600">
            Search students, filter by cohort, and review Student 360 profiles.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <label
            htmlFor="student-search"
            className="block text-xs font-semibold text-slate-700"
          >
            Search by name or ID
          </label>
          <input
            id="student-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. Aarav or S-104"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="w-52">
          <label
            htmlFor="cohort-filter"
            className="block text-xs font-semibold text-slate-700"
          >
            Filter by Cohort
          </label>
          <select
            id="cohort-filter"
            value={cohort}
            onChange={(e) => {
              setCohort(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All cohorts</option>
            <option value="CS-2024-A">CS-2024-A</option>
            <option value="ECE-2024-B">ECE-2024-B</option>
            <option value="ME-2025-A">ME-2025-A</option>
          </select>
        </div>

        {(search || cohort) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCohort("");
              setPage(1);
              setSearchParams({});
            }}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton lines={5} label="Loading students list..." />
      ) : error ? (
        <PanelErrorState
          error={error}
          onRetry={() => void refetch()}
          panelName="Students list"
        />
      ) : (
        <PaginatedTable
          caption="Students directory table"
          columns={columns}
          items={data?.items ?? []}
          getRowKey={(s) => s.id}
          page={data?.page ?? page}
          pageSize={data?.pageSize ?? pageSize}
          total={data?.total ?? 0}
          onPageChange={setPage}
        />
      )}
    </div>
  );
};

