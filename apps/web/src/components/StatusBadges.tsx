import React from "react";
import {
  CaseLifecycleStatus,
  DeadlineStatus,
  NotificationState,
  MeetingSyncStatus,
  IntegrationMode,
  QueueOverflowStatus,
} from "@learntrack/contracts";

export const LifecycleStatusBadge: React.FC<{ status: CaseLifecycleStatus }> = ({
  status,
}) => {
  const styles: Record<CaseLifecycleStatus, string> = {
    NEEDS_REVIEW: "bg-amber-100 text-amber-900 border-amber-300",
    ASSIGNED: "bg-blue-100 text-blue-900 border-blue-300",
    SCHEDULED: "bg-indigo-100 text-indigo-900 border-indigo-300",
    IN_PROGRESS: "bg-sky-100 text-sky-900 border-sky-300",
    ACTION_COMPLETED: "bg-teal-100 text-teal-900 border-teal-300",
    OUTCOME_REVIEWED: "bg-emerald-100 text-emerald-900 border-emerald-300",
    CLOSED: "bg-slate-200 text-slate-800 border-slate-400",
    DEFERRED: "bg-purple-100 text-purple-900 border-purple-300",
    DECLINED: "bg-slate-100 text-slate-700 border-slate-300",
    CANCELLED: "bg-slate-100 text-slate-600 border-slate-300",
    REOPENED: "bg-orange-100 text-orange-900 border-orange-300",
  };

  return (
    <span
      role="status"
      aria-label={`Case lifecycle status: ${status}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      {status}
    </span>
  );
};

export const DeadlineBadge: React.FC<{ status: DeadlineStatus }> = ({
  status,
}) => {
  const config: Record<
    DeadlineStatus,
    { label: string; className: string; icon: string }
  > = {
    ON_TIME: {
      label: "On time",
      className: "bg-emerald-50 text-emerald-800 border-emerald-300",
      icon: "●",
    },
    DUE_SOON: {
      label: "Due soon",
      className: "bg-amber-50 text-amber-800 border-amber-300",
      icon: "▲",
    },
    OVERDUE: {
      label: "Overdue",
      className: "bg-rose-50 text-rose-800 border-rose-300",
      icon: "◆",
    },
  };

  const item = config[status];
  return (
    <span
      role="status"
      aria-label={`Deadline status: ${item.label}`}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.className}`}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </span>
  );
};

export const RoutingBadge: React.FC<{ status: QueueOverflowStatus }> = ({
  status,
}) => {
  if (status === "QUEUED") {
    return (
      <span
        role="status"
        aria-label="Queue routing status: Queued"
        className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300"
      >
        Queued
      </span>
    );
  }
  if (status === "ROUTED_TO_MENTOR_PEER") {
    return (
      <span
        role="status"
        aria-label="Queue routing status: Routed to mentor/peer support"
        className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-900 border border-indigo-300"
      >
        Routed to mentor/peer support
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-label="Queue routing status: Assigned slot"
      className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-100 text-emerald-900 border border-emerald-300"
    >
      Assigned slot
    </span>
  );
};

export const NotificationStateBadge: React.FC<{ state: NotificationState }> = ({
  state,
}) => {
  // Spec: Say "Sent to provider", not "Delivered"
  const labelMap: Record<NotificationState, string> = {
    PENDING: "Pending",
    SENT: "Sent to provider",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  };
  const styleMap: Record<NotificationState, string> = {
    PENDING: "bg-amber-100 text-amber-900 border-amber-300",
    SENT: "bg-blue-100 text-blue-900 border-blue-300",
    FAILED: "bg-rose-100 text-rose-900 border-rose-300",
    CANCELLED: "bg-slate-100 text-slate-700 border-slate-300",
  };

  return (
    <span
      role="status"
      aria-label={`Notification state: ${labelMap[state]}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styleMap[state]}`}
    >
      {labelMap[state]}
    </span>
  );
};

export const SyncStatusBadge: React.FC<{
  syncStatus: MeetingSyncStatus;
  integrationMode: IntegrationMode;
}> = ({ syncStatus, integrationMode }) => {
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        role="status"
        aria-label={`Sync status: ${syncStatus}`}
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
          syncStatus === "SYNCED"
            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
            : syncStatus === "PENDING"
            ? "bg-amber-50 text-amber-800 border-amber-300"
            : "bg-rose-50 text-rose-800 border-rose-300"
        }`}
      >
        Sync: {syncStatus}
      </span>
      <span
        role="status"
        aria-label={`Integration mode: ${integrationMode}`}
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300"
      >
        Mode: {integrationMode}
      </span>
      {integrationMode === "MOCK" && (
        <span
          role="status"
          aria-label="Mock integration warning: Mock, not actually sent"
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-400"
        >
          Mock, not actually sent
        </span>
      )}
    </div>
  );
};

