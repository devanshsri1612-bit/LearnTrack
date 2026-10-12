import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { LifecycleStatusBadge } from "../components/StatusBadges";
import { LoadingSkeleton, PanelErrorState, EmptyState } from "../components/StateViews";
import { formatLocalDateTime } from "../utils/date";

export const MySupportPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mySupport"],
    queryFn: () => api.studentApp.getMySupport(),
  });

  if (isLoading) {
    return <LoadingSkeleton lines={4} label="Loading your support cases..." />;
  }

  if (error) {
    return (
      <PanelErrorState
        error={error}
        onRetry={() => void refetch()}
        panelName="My Support"
      />
    );
  }

  const cases = data?.cases ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Support</h1>
          <p className="text-xs text-slate-600 mt-1">
            View active academic and wellbeing support options in plain language, or request help at any time.
          </p>
        </div>

        <Link
          to="/check-in"
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
        >
          Request help
        </Link>
      </div>

      {cases.length === 0 ? (
        <EmptyState
          title="No active support cases"
          description="You can submit a check-in or request help whenever you would like academic or advising support."
          action={
            <Link
              to="/check-in"
              className="inline-block px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold"
            >
              Request help
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {cases.map((c) => (
            <div
              key={c.id}
              className="bg-white p-5 rounded-xl border border-slate-200 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    Support Case {c.id}
                  </span>
                  <LifecycleStatusBadge status={c.status} />
                </div>
                <span className="text-xs text-slate-500">
                  Updated: {formatLocalDateTime(c.updatedAt)}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 space-y-1">
                <div className="text-xs font-bold text-blue-950">
                  Why we reached out (Plain-language summary):
                </div>
                <p className="text-xs text-slate-800">
                  {c.plainLanguageReason}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">
                    Suggested Support Option
                  </span>
                  <strong className="text-slate-900">
                    {c.supportType ?? "Mentor Check-in"}
                  </strong>
                </div>
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Point of Contact</span>
                  <strong className="text-slate-900">
                    {c.ownerName ?? "Faculty Mentor"} ({c.ownerRole ?? "MENTOR"})
                  </strong>
                </div>
              </div>

              <p className="text-xs text-slate-600">{c.nextStepSummary}</p>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  Optional support is always collaborative. You can share context, defer, or decline optional support via Check-in.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/check-in?decision=DEFER"
                    className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Update Context / Decline or Defer Optional Support
                  </Link>
                  <Link
                    to="/consent"
                    className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Manage Sharing & Consent
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

