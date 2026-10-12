import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UpdateCapacityRequestSchema } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { RoutingBadge } from "../components/StatusBadges";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDateTime } from "../utils/date";

export const PriorityQueuePage: React.FC = () => {
  const { activeRole, user } = useAuth();
  const queryClient = useQueryClient();

  const canEditCapacity =
    activeRole === "ADMIN" ||
    activeRole === "HOD" ||
    Boolean(user?.roles.some((r) => r === "ADMIN" || r === "HOD"));

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [slotsTotalInput, setSlotsTotalInput] = useState<string>("");
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [capacitySuccess, setCapacitySuccess] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["priorityQueue"],
    queryFn: () => api.queue.get(),
  });

  const updateCapacityMutation = useMutation({
    mutationFn: ({
      staffId,
      slotsTotal,
    }: {
      staffId: string;
      slotsTotal: number;
    }) => api.queue.updateStaffCapacity(staffId, { slotsTotal }),
    onSuccess: (updated) => {
      setEditingStaffId(null);
      setCapacityError(null);
      setCapacitySuccess(
        `Updated capacity for ${updated.name} (${updated.role}) to ${updated.slotsTotal} total slots.`
      );
      void queryClient.invalidateQueries({ queryKey: ["priorityQueue"] });
    },
    onError: (err) => {
      setCapacitySuccess(null);
      setCapacityError(
        err instanceof Error ? err.message : "Failed to update capacity"
      );
    },
  });

  if (isLoading) {
    return <LoadingSkeleton lines={6} label="Loading priority queue..." />;
  }

  if (error || !data) {
    return (
      <PanelErrorState
        error={error}
        onRetry={() => void refetch()}
        panelName="Priority Queue"
      />
    );
  }

  const handleSaveCapacity = (staffId: string) => {
    setCapacityError(null);
    setCapacitySuccess(null);
    const parsed = UpdateCapacityRequestSchema.safeParse({
      slotsTotal: Number(slotsTotalInput),
    });
    if (!parsed.success) {
      setCapacityError(parsed.error.issues[0]?.message ?? "Invalid slot count");
      return;
    }
    updateCapacityMutation.mutate({
      staffId,
      slotsTotal: parsed.data.slotsTotal,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Priority Support Queue & Staff Capacity
          </h1>
          <p className="text-xs text-slate-600">
            Students ranked by expected benefit from timely support, balanced against real staff slot capacity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
            Indicator, not a diagnosis. A human decides.
          </span>
          <button
            type="button"
            disabled={isFetching}
            onClick={() => void refetch()}
            className="px-3 py-1 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isFetching ? "Refreshing..." : "Refresh Queue"}
          </button>
        </div>
      </div>

      {/* Per-Staff Capacity Bars */}
      <section
        aria-label="Staff Capacity Allocation"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Per-Staff Active Support Capacity (Slots Used / Total)
          </h2>
          {canEditCapacity && (
            <span className="text-xs text-blue-700 font-medium">
              HOD / ADMIN capacity editing enabled
            </span>
          )}
        </div>

        {capacityError && (
          <div
            role="alert"
            className="p-2.5 rounded bg-rose-50 border border-rose-300 text-xs text-rose-800"
          >
            {capacityError}
          </div>
        )}

        {capacitySuccess && (
          <div
            role="status"
            className="p-2.5 rounded bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
          >
            {capacitySuccess}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.staffCapacities.map((staff) => {
            const pct =
              staff.slotsTotal > 0
                ? Math.min(
                    100,
                    Math.round((staff.slotsUsed / staff.slotsTotal) * 100)
                  )
                : 100;
            const isFull = staff.slotsUsed >= staff.slotsTotal;

            return (
              <div
                key={staff.staffId}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {staff.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {staff.role}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      isFull
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {staff.slotsUsed} / {staff.slotsTotal} slots
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-label={`${staff.name} capacity ${staff.slotsUsed} of ${staff.slotsTotal} slots`}
                  aria-valuenow={staff.slotsUsed}
                  aria-valuemin={0}
                  aria-valuemax={staff.slotsTotal}
                  className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"
                >
                  <div
                    className={`h-full ${
                      isFull ? "bg-amber-600" : "bg-blue-600"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {canEditCapacity && (
                  <div className="pt-1">
                    {editingStaffId === staff.staffId ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          aria-label={`Total slots for ${staff.name}`}
                          min={0}
                          max={100}
                          value={slotsTotalInput}
                          onChange={(e) => setSlotsTotalInput(e.target.value)}
                          className="w-16 rounded border border-slate-300 px-2 py-0.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveCapacity(staff.staffId)}
                          disabled={updateCapacityMutation.isPending}
                          className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStaffId(null);
                            setCapacityError(null);
                          }}
                          className="px-2 py-0.5 rounded border border-slate-300 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCapacityError(null);
                          setCapacitySuccess(null);
                          setEditingStaffId(staff.staffId);
                          setSlotsTotalInput(String(staff.slotsTotal));
                        }}
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        Edit capacity
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Ranked Priority Queue Table */}
      <section
        aria-label="Ranked Priority Queue"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            Students Ranked by Expected Benefit
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table
            aria-label="Priority queue ranked students"
            className="w-full text-left border-collapse"
          >
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student & Cohort</th>
                <th className="px-4 py-3">Expected Benefit & Context</th>
                <th className="px-4 py-3">Capacity Routing</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-800">
              {data.items.map((item) => (
                <tr key={item.studentId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    #{item.expectedBenefitRank}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/students/${item.studentId}`}
                      className="font-semibold text-blue-700 hover:underline text-sm"
                    >
                      {item.studentName}
                    </Link>
                    <div className="text-slate-500">
                      {item.studentId} • {item.cohort}
                    </div>
                  </td>
                  <td className="px-4 py-3 space-y-1">
                    <div className="font-semibold text-slate-900">
                      {item.expectedBenefitLabel}
                    </div>
                    <div className="text-slate-600">
                      {item.needsAttentionReason}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Updated: {formatLocalDateTime(item.updatedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 space-y-1">
                    <RoutingBadge status={item.routingStatus} />
                    {item.assignedStaffName && (
                      <div className="text-slate-600">
                        Owner: {item.assignedStaffName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/students/${item.studentId}`}
                        className="px-2.5 py-1 rounded border border-slate-300 font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Student 360
                      </Link>
                      {item.caseId && (
                        <Link
                          to={`/cases/${item.caseId}`}
                          className="px-2.5 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
                        >
                          Review {item.caseId}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

