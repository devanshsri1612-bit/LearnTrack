import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { STAFF_ROLES } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { NotificationStateBadge } from "./StatusBadges";
import { formatLocalDateTime } from "../utils/date";
import { PanelErrorState, LoadingSkeleton, EmptyState } from "./StateViews";

export const NotificationsBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { activeRole } = useAuth();
  const isStaff = Boolean(activeRole && STAFF_ROLES.includes(activeRole));

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.list(),
  });

  const items = data?.items ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications (${items.length})`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <span aria-hidden="true">🔔</span>
        <span>Notifications</span>
        {items.length > 0 && (
          <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-slate-200 z-50 p-3 space-y-2"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Outbound & System Notifications
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isFetching}
                onClick={() => void refetch()}
                className="text-xs text-blue-700 font-semibold hover:underline disabled:opacity-50"
              >
                {isFetching ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
          </div>

          {isLoading ? (
            <LoadingSkeleton lines={2} label="Loading notifications" />
          ) : error ? (
            <PanelErrorState
              error={error}
              onRetry={() => void refetch()}
              panelName="Notifications"
            />
          ) : items.length === 0 ? (
            <EmptyState title="No notifications" />
          ) : (
            <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {items.map((n) => {
                const caseMatch = /\b(C-\d+)\b/.exec(
                  `${n.title} ${n.summary}`
                );
                const matchedCaseId = caseMatch?.[1];
                return (
                  <li key={n.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {n.title}
                      </span>
                      <NotificationStateBadge state={n.state} />
                    </div>
                    <p className="text-slate-600">{n.summary}</p>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Channel: {n.channel}</span>
                      <div className="flex items-center gap-2">
                        {isStaff && matchedCaseId && (
                          <Link
                            to={`/cases/${matchedCaseId}`}
                            onClick={() => setOpen(false)}
                            className="text-blue-700 font-semibold hover:underline"
                          >
                            Open {matchedCaseId}
                          </Link>
                        )}
                        <span>{formatLocalDateTime(n.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

