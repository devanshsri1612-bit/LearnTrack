import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { LoadingSkeleton, PanelErrorState, EmptyState } from "../components/StateViews";
import { formatLocalDateTime } from "../utils/date";

export const RewardsAdminPage: React.FC = () => {
  const { user, activeRole } = useAuth();
  const queryClient = useQueryClient();

  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const userRoles = user?.roles ?? [];
  const effectiveRole = activeRole ?? userRoles[0];

  // HOD and ADMIN see totals, cohort table, and evaluate button
  const canViewLeadership = effectiveRole === "HOD" || effectiveRole === "ADMIN";

  // FINANCE sees only the redemptions queue; ADMIN also sees the queue
  const canManageRedemptions = effectiveRole === "FINANCE" || effectiveRole === "ADMIN";

  // Hide the evaluate button from anyone but HOD/ADMIN
  const canEvaluate = effectiveRole === "HOD" || effectiveRole === "ADMIN";

  // Summary query for HOD and ADMIN
  const summaryQuery = useQuery({
    queryKey: ["rewardsSummary"],
    queryFn: () => api.rewards.getSummary(),
    enabled: canViewLeadership,
  });

  // Redemptions query for FINANCE and ADMIN
  const redemptionsQuery = useQuery({
    queryKey: ["rewardsRedemptions"],
    queryFn: () => api.rewards.listRedemptions(),
    enabled: canManageRedemptions,
  });

  // Evaluation mutation
  const evaluateMutation = useMutation({
    mutationFn: () => api.rewards.evaluate(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["rewardsSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["rewardsRedemptions"] });
      setIsEvalModalOpen(false);
      setToast({
        type: "success",
        message: `Evaluation completed successfully: ${result.evaluatedStudents} students evaluated, ${result.newEntriesCount} new reward entries awarded.`,
      });
    },
    onError: (err: Error) => {
      setToast({
        type: "error",
        message: err.message || "Failed to execute weekly reward evaluation.",
      });
    },
  });

  // Redemption status mutation (Fulfil or Cancel)
  const patchRedemptionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "FULFILLED" | "CANCELLED" }) =>
      api.rewards.patchRedemption(id, { status }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["rewardsRedemptions"] });
      void queryClient.invalidateQueries({ queryKey: ["rewardsSummary"] });
      setToast({
        type: "success",
        message: `Redemption ${updated.id} marked as ${updated.status}. ${
          updated.status === "CANCELLED" ? "Item stock was automatically restored." : ""
        }`,
      });
    },
    onError: (err: Error) => {
      setToast({
        type: "error",
        message: err.message || "Failed to update redemption status.",
      });
    },
  });

  const isLoading = (canViewLeadership && summaryQuery.isLoading) || (canManageRedemptions && redemptionsQuery.isLoading);
  if (isLoading) {
    return <LoadingSkeleton lines={8} label="Loading rewards administration data..." />;
  }

  const error = (canViewLeadership && summaryQuery.error) || (canManageRedemptions && redemptionsQuery.error);
  if (error && !summaryQuery.data && !redemptionsQuery.data) {
    return (
      <PanelErrorState
        error={error}
        onRetry={() => {
          if (canViewLeadership) void summaryQuery.refetch();
          if (canManageRedemptions) void redemptionsQuery.refetch();
        }}
        panelName="Rewards Admin"
      />
    );
  }

  const summary = summaryQuery.data;
  const redemptions = redemptionsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rewards Administration & Oversight</h1>
          <p className="text-xs text-slate-600 mt-1">
            {canViewLeadership && canManageRedemptions
              ? "Institutional LearnCoins metrics, minimum group size (n >= 30) cohort totals, and campus redemption fulfilment."
              : canViewLeadership
              ? "Institutional LearnCoins metrics and minimum group size (n >= 30) cohort totals."
              : "Review and fulfil campus student redemption requests."}
          </p>
        </div>

        {canEvaluate && (
          <button
            type="button"
            onClick={() => setIsEvalModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm"
          >
            Run Weekly Evaluation
          </button>
        )}
      </div>

      {/* Toast Notification Banner */}
      {toast && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-900"
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs font-semibold underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Leadership Section: Institution Totals & Cohorts */}
      {canViewLeadership && summary && (
        <div className="space-y-6">
          {/* Institution Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                Total Points Issued
              </span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {summary.totalPointsIssued}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Issued server-side across all students
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                Total Redemptions
              </span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {summary.totalRedemptions}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                All requests submitted
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                Total Points Redeemed
              </span>
              <div className="text-2xl font-black text-blue-700 mt-1">
                {summary.totalPointsRedeemed}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Active & fulfilled points redeemed
              </span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
                Fulfilled Requests
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {summary.fulfilledRedemptions}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Completed campus rewards
              </span>
            </div>
          </div>

          {/* Privacy-Preserving Cohort Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <div>
              <h2 className="text-base font-bold text-slate-900">Cohort Rewards & Minimum Group Size Protection</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Cohort aggregate metrics are evaluated under minimum group size (n &ge; 30) privacy rules. Groups with size below threshold (n &lt; 30) are suppressed to protect student privacy.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Cohort
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-700">
                      Cohort Size (n)
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-700">
                      Points Issued
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-700">
                      Redemptions
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Privacy & Suppression Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {summary.cohorts.map((c) => (
                    <tr key={c.cohort} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {c.cohort}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-700">
                        {c.studentCount}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {c.pointsIssued !== null ? c.pointsIssued : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {c.redemptionsCount !== null ? c.redemptionsCount : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {c.insufficientData ? (
                          <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                            <span className="font-semibold block mb-0.5 text-amber-950">
                              Privacy Suppressed (n &lt; 30)
                            </span>
                            <span>{c.note}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            Sufficient group size (n &ge; 30)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Redemptions Management Section: FINANCE and ADMIN */}
      {canManageRedemptions && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">Redemptions Management Queue</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Review and process student reward claims. Cancelling a request automatically returns the reward item stock.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
              {redemptions.length} total request{redemptions.length === 1 ? "" : "s"}
            </span>
          </div>

          {redemptions.length === 0 ? (
            <EmptyState
              title="No redemptions in queue"
              description="No students have submitted reward redemptions yet."
            />
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      ID
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Student
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Reward Item
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-700">
                      Cost
                    </th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-700">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Requested At
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {redemptions.map((r) => {
                    const isPending = r.status === "PENDING";
                    let statusBadgeClass = "bg-slate-100 text-slate-700 border-slate-300";
                    if (r.status === "PENDING") {
                      statusBadgeClass = "bg-amber-100 text-amber-900 border-amber-300";
                    } else if (r.status === "FULFILLED") {
                      statusBadgeClass = "bg-emerald-100 text-emerald-900 border-emerald-300";
                    } else if (r.status === "CANCELLED") {
                      statusBadgeClass = "bg-slate-100 text-slate-500 border-slate-300 line-through";
                    }

                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-800">
                          {r.id}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {r.studentDisplayName}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          <span className="font-semibold block">{r.itemName}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">
                          {r.cost} pts
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${statusBadgeClass}`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-[11px]">
                          {formatLocalDateTime(r.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                disabled={patchRedemptionMutation.isPending}
                                onClick={() =>
                                  patchRedemptionMutation.mutate({ id: r.id, status: "FULFILLED" })
                                }
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Fulfil
                              </button>
                              <button
                                type="button"
                                disabled={patchRedemptionMutation.isPending}
                                onClick={() =>
                                  patchRedemptionMutation.mutate({ id: r.id, status: "CANCELLED" })
                                }
                                className="px-2.5 py-1 rounded border border-rose-300 bg-rose-50 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium italic">
                              Processed
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
        </div>
      )}

      {/* Confirmation Modal for Weekly Evaluation */}
      {isEvalModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="eval-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="space-y-1">
              <h3 id="eval-dialog-title" className="text-base font-bold text-slate-900">
                Run Weekly Reward Evaluation?
              </h3>
              <p className="text-xs text-slate-600">
                This process idempotently evaluates attendance comebacks, consistency targets, and completed tutoring sessions for all students.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
              <div className="font-semibold">Deterministic & Safe to Run:</div>
              <p className="text-[11px]">
                The evaluation engine enforces the 60-point weekly activity cap and checks for duplicate award keys before writing to the ledger.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEvalModalOpen(false)}
                disabled={evaluateMutation.isPending}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => evaluateMutation.mutate()}
                disabled={evaluateMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {evaluateMutation.isPending ? "Evaluating..." : "Confirm & Run Evaluation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
