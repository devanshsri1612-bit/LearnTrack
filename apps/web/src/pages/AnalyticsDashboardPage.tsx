import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { SharedBarrierCluster } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";

export const AnalyticsDashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    "CLUST-DSA-CS2024A"
  );
  const [createdTaskNotice, setCreatedTaskNotice] = useState<string | null>(
    null
  );
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const cohortsQuery = useQuery({
    queryKey: ["analyticsCohorts"],
    queryFn: () => api.analytics.getCohorts(),
  });

  const outcomesQuery = useQuery({
    queryKey: ["analyticsOutcomes"],
    queryFn: () => api.analytics.getOutcomes(),
  });

  const impactQuery = useQuery({
    queryKey: ["analyticsImpact"],
    queryFn: () => api.analytics.getImpact(),
  });

  const fairnessQuery = useQuery({
    queryKey: ["analyticsFairness"],
    queryFn: () => api.analytics.getFairness(),
  });

  const clustersQuery = useQuery({
    queryKey: ["analyticsClusters"],
    queryFn: () => api.analytics.getClusters(),
  });

  const createReviewTaskMutation = useMutation({
    mutationFn: (cluster: SharedBarrierCluster) =>
      api.cases.create({
        cohort: cluster.cohort,
        subject: cluster.subject,
        clusterId: cluster.id,
        taskType: "FACULTY_REVIEW_TASK",
        recommendedIntervention: "REMEDIAL",
        plainLanguageReason: `Curriculum & schedule review task for ${cluster.subject} (${cluster.cohort}): investigate shared cohort pattern without student identifiers.`,
      }),
    onSuccess: (created, cluster) => {
      setTaskError(null);
      setCreatedTaskId(created.id);
      setCreatedTaskNotice(
        `Faculty review task ${created.id} created for ${cluster.subject} / ${cluster.cohort} (no student identifiers included).`
      );
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["analyticsCohorts"] });
    },
    onError: (err) => {
      setCreatedTaskNotice(null);
      setTaskError(
        err instanceof Error ? err.message : "Failed to create review task"
      );
    },
  });

  if (cohortsQuery.isLoading) {
    return (
      <LoadingSkeleton
        lines={6}
        label="Loading leadership analytics dashboard..."
      />
    );
  }

  if (cohortsQuery.error || !cohortsQuery.data) {
    return (
      <PanelErrorState
        error={cohortsQuery.error}
        onRetry={() => void cohortsQuery.refetch()}
        panelName="Impact & Leadership Dashboard"
      />
    );
  }

  const cohorts = cohortsQuery.data;
  const clusters = clustersQuery.data?.clusters ?? [];

  const uniqueSubjects = Array.from(new Set(clusters.map((c) => c.subject)));
  const uniqueCohorts = Array.from(new Set(clusters.map((c) => c.cohort)));

  const selectedCluster =
    clusters.find((c) => c.id === selectedClusterId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Impact & Leadership Dashboard (Aggregate View)
          </h1>
          <p className="text-xs text-slate-600">
            Departmental and institutional aggregates only. No individual student records appear on this dashboard.
          </p>
        </div>
        <span className="px-3 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold">
          Synthetic and observational, not proof of cause.
        </span>
      </div>

      {/* Aggregate KPI Cards */}
      <section
        aria-label="Case Lifecycle Aggregate Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            Open Cases
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {cohorts.openCasesCount}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            Completed Cases
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {cohorts.completedCasesCount}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            Overdue Follow-ups
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {cohorts.overdueCasesCount}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            Time to First Action
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {cohorts.medianHoursToFirstAction}h
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            Outcome-Review Rate
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {cohorts.outcomeReviewRatePercent}%
          </div>
        </div>
      </section>

      {/* Shared Barriers Section (GET /api/analytics/clusters) */}
      <section
        aria-label="Shared Barriers"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Shared Barriers
            </h2>
            <p className="text-xs text-slate-600">
              Subject-by-cohort cluster analysis for structural schedule, lab pacing, or curriculum barriers. No individual student or faculty member is singled out.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold">
              Pattern to investigate, not a proven cause.
            </span>
            <span className="px-2.5 py-1 rounded bg-amber-100 border border-amber-300 text-amber-950 text-xs font-semibold">
              Synthetic data
            </span>
          </div>
        </div>

        {taskError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-800"
          >
            {taskError}
          </div>
        )}

        {createdTaskNotice && (
          <div
            role="status"
            className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 font-semibold flex flex-wrap items-center justify-between gap-2"
          >
            <span>{createdTaskNotice}</span>
            <div className="flex items-center gap-3">
              {createdTaskId && (
                <Link
                  to={`/cases/${createdTaskId}`}
                  className="px-2.5 py-1 rounded bg-emerald-800 text-white text-xs font-semibold hover:bg-emerald-900"
                >
                  Open Task ({createdTaskId})
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setCreatedTaskNotice(null);
                  setCreatedTaskId(null);
                }}
                className="text-emerald-900 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {clustersQuery.isLoading ? (
          <LoadingSkeleton lines={4} label="Loading shared barriers clusters..." />
        ) : clustersQuery.error ? (
          <PanelErrorState
            error={clustersQuery.error}
            onRetry={() => void clustersQuery.refetch()}
            panelName="Shared Barriers"
          />
        ) : (
          <div className="space-y-6">
            {/* Subject-by-Cohort Heatmap (number plus colour, with aria labels) */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Subject-by-Cohort Heatmap (Rate % & Count)
              </h3>
              <div className="overflow-x-auto">
                <table
                  aria-label="Subject-by-cohort shared barriers heatmap"
                  className="w-full text-left border-collapse text-xs border border-slate-200"
                >
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-2.5 px-3 border-r border-slate-200">
                        Subject \ Cohort
                      </th>
                      {uniqueCohorts.map((coh) => (
                        <th
                          key={coh}
                          scope="col"
                          className="py-2.5 px-3 border-r border-slate-200"
                        >
                          {coh}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {uniqueSubjects.map((subj) => (
                      <tr key={subj}>
                        <th
                          scope="row"
                          className="py-2.5 px-3 font-bold text-slate-900 bg-slate-50 border-r border-slate-200"
                        >
                          {subj}
                        </th>
                        {uniqueCohorts.map((coh) => {
                          const cell = clusters.find(
                            (c) => c.subject === subj && c.cohort === coh
                          );
                          if (!cell) {
                            return (
                              <td
                                key={coh}
                                aria-label={`${subj} in ${coh}: Not offered in this cohort`}
                                className="py-2.5 px-3 text-slate-400 bg-slate-50/40 border-r border-slate-200"
                              >
                                —
                              </td>
                            );
                          }

                          const isBelowMin =
                            cell.insufficientData ||
                            cell.groupSize < cell.minGroupSize;

                          if (isBelowMin) {
                            return (
                              <td
                                key={coh}
                                className="p-2 border-r border-slate-200 bg-slate-100"
                              >
                                <button
                                  type="button"
                                  aria-label={`Heatmap cell ${cell.subject} ${cell.cohort}: Insufficient data (group size ${cell.groupSize} below minimum ${cell.minGroupSize})`}
                                  onClick={() => setSelectedClusterId(cell.id)}
                                  className="w-full text-left p-2 rounded border border-slate-300 bg-white hover:bg-slate-50"
                                >
                                  <div className="font-semibold text-slate-700">
                                    Insufficient data
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    n={cell.groupSize} (min {cell.minGroupSize})
                                  </div>
                                </button>
                              </td>
                            );
                          }

                          const cellColor = cell.flagged
                            ? "bg-amber-100 text-amber-950 border-amber-400 hover:bg-amber-200/70"
                            : "bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100/70";

                          return (
                            <td
                              key={coh}
                              className="p-2 border-r border-slate-200"
                            >
                              <button
                                type="button"
                                aria-label={`Heatmap cell ${cell.subject} ${cell.cohort}: ${cell.rate}% rate (${cell.affectedCount} of ${cell.groupSize} students), baseline ${cell.baselineRate}%, status ${
                                  cell.flagged
                                    ? "Pattern to investigate"
                                    : "Within baseline"
                                }`}
                                onClick={() => setSelectedClusterId(cell.id)}
                                className={`w-full text-left p-2 rounded border transition-colors ${cellColor}`}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span>{cell.rate}%</span>
                                  <span className="text-[11px]">
                                    ({cell.affectedCount}/{cell.groupSize})
                                  </span>
                                </div>
                                <div className="text-[11px] mt-0.5">
                                  Baseline: {cell.baselineRate}% •{" "}
                                  {cell.flagged
                                    ? "Investigate"
                                    : "Within baseline"}
                                </div>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pattern Cards Grid + Detail Drawer */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Pattern Cards */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                {clusters.map((cluster) => {
                  const isBelowMin =
                    cluster.insufficientData ||
                    cluster.groupSize < cluster.minGroupSize;
                  const isSelected = cluster.id === selectedClusterId;

                  return (
                    <div
                      key={cluster.id}
                      aria-label={`Shared barrier card ${cluster.subject} ${cluster.cohort}`}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                        isSelected
                          ? "border-blue-600 ring-1 ring-blue-600 bg-blue-50/20"
                          : "border-slate-200 bg-slate-50/70"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">
                              {cluster.subject} • {cluster.cohort}
                            </h4>
                            <span className="text-[11px] text-slate-500">
                              Cohort size: n={cluster.groupSize} (min{" "}
                              {cluster.minGroupSize})
                            </span>
                          </div>
                          {isBelowMin ? (
                            <span
                              role="status"
                              className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold"
                            >
                              Insufficient data
                            </span>
                          ) : cluster.flagged ? (
                            <span
                              role="status"
                              className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 text-xs font-semibold"
                            >
                              Pattern to investigate
                            </span>
                          ) : (
                            <span
                              role="status"
                              className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-semibold"
                            >
                              Within baseline
                            </span>
                          )}
                        </div>

                        {isBelowMin ? (
                          <p className="text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                            Insufficient data — group size ({cluster.groupSize}) is below the minimum threshold ({cluster.minGroupSize}).
                          </p>
                        ) : (
                          <>
                            <div className="p-2.5 rounded bg-white border border-slate-200 text-xs flex items-center justify-between">
                              <span>
                                Affected:{" "}
                                <strong>
                                  {cluster.affectedCount} of {cluster.groupSize}
                                </strong>
                              </span>
                              <span>
                                Rate: <strong>{cluster.rate}%</strong> vs
                                Baseline:{" "}
                                <strong>{cluster.baselineRate}%</strong>
                              </span>
                            </div>

                            {cluster.signals.length > 0 && (
                              <div className="text-xs space-y-1">
                                <div className="font-semibold text-slate-700">
                                  Observed Signals:
                                </div>
                                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                  {cluster.signals.map((sig, i) => (
                                    <li key={i}>{sig}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {cluster.suggestedChecks.length > 0 && (
                              <div className="text-xs space-y-1">
                                <div className="font-semibold text-slate-700">
                                  Suggested Checks:
                                </div>
                                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                                  {cluster.suggestedChecks.map((chk, i) => (
                                    <li key={i}>{chk}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedClusterId(cluster.id)}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          Open detail drawer
                        </button>
                        {!isBelowMin && (
                          <button
                            type="button"
                            disabled={createReviewTaskMutation.isPending}
                            onClick={() =>
                              createReviewTaskMutation.mutate(cluster)
                            }
                            className="px-2.5 py-1 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                          >
                            Create faculty review task
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detail Drawer with Recharts Trend Chart */}
              <aside
                aria-label="Shared barrier cluster detail drawer"
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-4"
              >
                {selectedCluster ? (
                  <>
                    <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                      <div>
                        <span className="text-[11px] font-bold uppercase text-blue-700">
                          Cluster Detail Drawer
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">
                          {selectedCluster.subject} ({selectedCluster.cohort})
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold">
                        Synthetic data
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-indigo-950 bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded">
                      Pattern to investigate, not a proven cause.
                    </p>

                    {selectedCluster.insufficientData ||
                    selectedCluster.groupSize < selectedCluster.minGroupSize ? (
                      <div className="p-3 rounded bg-white border border-slate-200 text-xs text-slate-700">
                        <strong>Insufficient data</strong> — Trend chart and aggregate rates are not displayed when cohort size ({selectedCluster.groupSize}) is below the minimum threshold ({selectedCluster.minGroupSize}).
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <div className="text-xs font-semibold text-slate-700">
                            Cohort Barrier Rate vs Baseline Trend (%)
                          </div>
                          <div
                            role="img"
                            aria-label={`Trend chart for ${selectedCluster.subject} in ${selectedCluster.cohort} comparing observed rate against baseline rate`}
                            className="h-44 w-full bg-white p-2 rounded border border-slate-200"
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={selectedCluster.trend}>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#e2e8f0"
                                />
                                <XAxis
                                  dataKey="period"
                                  tick={{ fontSize: 11 }}
                                />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Line
                                  type="monotone"
                                  dataKey="rate"
                                  name="Observed Rate (%)"
                                  stroke="#d97706"
                                  strokeWidth={2}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="baselineRate"
                                  name="Baseline Rate (%)"
                                  stroke="#64748b"
                                  strokeDasharray="4 4"
                                  strokeWidth={2}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="font-semibold text-slate-800">
                            Suggested Curriculum & Schedule Checks:
                          </div>
                          <ul className="list-disc list-inside text-slate-600 space-y-1">
                            {selectedCluster.suggestedChecks.map((chk, idx) => (
                              <li key={idx}>{chk}</li>
                            ))}
                          </ul>
                        </div>

                        <button
                          type="button"
                          disabled={createReviewTaskMutation.isPending}
                          onClick={() =>
                            createReviewTaskMutation.mutate(selectedCluster)
                          }
                          className="w-full py-2 px-3 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                        >
                          {createReviewTaskMutation.isPending
                            ? "Creating review task..."
                            : "Create faculty review task"}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-600">
                    Select a subject-cohort cell or pattern card to inspect its trend and suggested checks.
                  </p>
                )}
              </aside>
            </div>
          </div>
        )}
      </section>

      {/* Shared-Decline Patterns by Subject & Cohort */}
      <section
        aria-label="Shared-decline patterns by subject and cohort"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Shared-Decline Patterns by Subject & Cohort
            </h2>
            <p className="text-xs text-slate-600">
              Aggregate course-level shifts to help HODs review scheduling or curriculum pacing.
            </p>
          </div>
          {/* Mandatory exact copy */}
          <span className="px-2.5 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold">
            Patterns to investigate, not proven causes.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cohorts.sharedDeclinePatterns.map((pat) => (
            <div
              key={pat.id}
              className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  {pat.cohort} • {pat.subject}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-xs font-semibold">
                  {pat.affectedStudentsCount} students in cohort
                </span>
              </div>
              <div className="text-xs font-medium text-slate-700">
                Observed Metric: {pat.metric}
              </div>
              <p className="text-xs text-slate-600">{pat.changeSummary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Impact & Outcomes Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-label="Observational Impact Chart"
          className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Attendance Trend Delta (Aggregate)
            </h2>
            {/* Mandatory exact copy */}
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold">
              Synthetic and observational, not proof of cause.
            </span>
          </div>

          {impactQuery.isLoading ? (
            <LoadingSkeleton lines={4} />
          ) : impactQuery.error ? (
            <PanelErrorState
              error={impactQuery.error}
              onRetry={() => void impactQuery.refetch()}
              panelName="Impact chart"
            />
          ) : (
            <div
              role="img"
              aria-label="Observational impact bar chart comparing attendance delta"
              className="h-56 w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={impactQuery.data?.series ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="withSupportAttendanceDelta"
                    name="Supported Cohort Delta (%)"
                    fill="#2563eb"
                  />
                  <Bar
                    dataKey="comparisonGroupAttendanceDelta"
                    name="Comparison Baseline Delta (%)"
                    fill="#94a3b8"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section
          aria-label="Outcomes by Intervention Type"
          className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Outcome Reviews by Intervention Type
            </h2>
            <p className="text-xs text-slate-600">
              Includes IMPROVEMENT, NO_CHANGE, and UNKNOWN classifications.
            </p>
          </div>

          {outcomesQuery.isLoading ? (
            <LoadingSkeleton lines={4} />
          ) : outcomesQuery.error ? (
            <PanelErrorState
              error={outcomesQuery.error}
              onRetry={() => void outcomesQuery.refetch()}
              panelName="Outcomes breakdown"
            />
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label="Outcome classifications by intervention type"
                className="w-full text-left border-collapse text-xs"
              >
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">Intervention</th>
                    <th className="py-2 px-3">Improvement</th>
                    <th className="py-2 px-3">No Change</th>
                    <th className="py-2 px-3">Unknown</th>
                    <th className="py-2 px-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(outcomesQuery.data?.byIntervention ?? []).map((row) => (
                    <tr key={row.interventionType}>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {row.interventionType}
                      </td>
                      <td className="py-2 px-3 text-emerald-700 font-medium">
                        {row.improvementCount}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {row.noChangeCount}
                      </td>
                      <td className="py-2 px-3 text-amber-800">
                        {row.unknownCount}
                      </td>
                      <td className="py-2 px-3 font-semibold">
                        {row.totalReviewed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Fairness & Alert Rate Panel */}
      <section
        aria-label="Fairness and Subgroup Alert Rates"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Fairness & Subgroup Alert Rate Monitoring
          </h2>
          <p className="text-xs text-slate-600">
            Monitors group counts and alert rates across cohorts and entry pathways. Small groups or zero denominators explicitly report insufficient data.
          </p>
        </div>

        {fairnessQuery.isLoading ? (
          <LoadingSkeleton lines={3} />
        ) : fairnessQuery.error ? (
          <PanelErrorState
            error={fairnessQuery.error}
            onRetry={() => void fairnessQuery.refetch()}
            panelName="Fairness panel"
          />
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label="Subgroup alert rate fairness table"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-2.5 px-4">Dimension</th>
                  <th className="py-2.5 px-4">Group</th>
                  <th className="py-2.5 px-4">Group Count (n)</th>
                  <th className="py-2.5 px-4">Flagged Count</th>
                  <th className="py-2.5 px-4">Alert Rate / Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(fairnessQuery.data?.groups ?? []).map((grp, idx) => {
                  const isSmallOrZero =
                    grp.insufficientData ||
                    grp.groupCount === 0 ||
                    grp.groupCount < grp.minGroupSizeThreshold;

                  return (
                    <tr key={`${grp.groupLabel}-${idx}`}>
                      <td className="py-2.5 px-4 text-slate-600">
                        {grp.groupDimension}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        {grp.groupLabel}
                      </td>
                      <td className="py-2.5 px-4">{grp.groupCount}</td>
                      <td className="py-2.5 px-4">{grp.flaggedCount}</td>
                      <td className="py-2.5 px-4">
                        {isSmallOrZero ? (
                          <span
                            role="status"
                            className="px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold"
                          >
                            Insufficient data for reliable fairness assessment
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-900">
                            {grp.alertRatePercent}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
