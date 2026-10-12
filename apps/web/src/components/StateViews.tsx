import React from "react";
import { ApiClientError, ContractMismatchError, isMockModeEnabled } from "../api/client";

export const LoadingSkeleton: React.FC<{ lines?: number; label?: string }> = ({
  lines = 3,
  label = "Loading content...",
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      className="animate-pulse space-y-3 p-4 bg-white rounded-lg border border-slate-200"
    >
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className="h-4 bg-slate-200 rounded"
          style={{ width: `${Math.max(45, 95 - idx * 15)}%` }}
        />
      ))}
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => {
  return (
    <div className="p-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-slate-600">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};

export const RestrictedFieldBox: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <div
      role="note"
      aria-label={`${label ? `${label}: ` : ""}Restricted by role or consent`}
      className="p-3 rounded-md bg-slate-100 border border-slate-300 text-xs text-slate-700 flex items-center justify-between"
    >
      <span className="font-medium">Restricted by role or consent</span>
      <span className="text-[11px] text-slate-500">Protected scope</span>
    </div>
  );
};

export const NoObservationsBox: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <div
      role="note"
      aria-label={`${label ? `${label}: ` : ""}No recent observations`}
      className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600"
    >
      No recent observations
    </div>
  );
};

export const AccessDeniedScreen: React.FC<{ message?: string }> = ({
  message,
}) => {
  return (
    <div
      role="alert"
      className="p-6 bg-amber-50 border border-amber-300 rounded-lg text-amber-950"
    >
      <h2 className="text-base font-semibold">You do not have access</h2>
      <p className="mt-1 text-sm text-amber-900">
        {message ??
          "Your current role does not have permission to view or perform this action. Access is enforced by the server."}
      </p>
    </div>
  );
};

export const PanelErrorState: React.FC<{
  error: unknown;
  onRetry?: () => void;
  panelName?: string;
}> = ({ error, onRetry, panelName }) => {
  if (error instanceof ContractMismatchError) {
    return (
      <div
        role="alert"
        className="p-4 bg-rose-50 border-2 border-rose-400 rounded-lg text-rose-950"
      >
        <div className="font-bold text-sm">
          Contract mismatch ({error.endpoint})
        </div>
        <p className="text-xs mt-1">
          Response did not match the shared Zod schema in packages/contracts.
        </p>
      </div>
    );
  }

  if (error instanceof ApiClientError) {
    if (error.status === 403) {
      return <AccessDeniedScreen message={error.message} />;
    }

    if (
      (error.status === 404 || error.status === 501) &&
      !isMockModeEnabled()
    ) {
      return (
        <div
          role="status"
          className="p-4 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 text-sm"
        >
          <span className="font-semibold">Not available yet</span>
          {panelName ? ` — ${panelName}` : ""}
        </div>
      );
    }

    if (error.status === 404) {
      return (
        <div
          role="alert"
          className="p-4 bg-slate-100 border border-slate-300 rounded-lg text-slate-800 text-sm"
        >
          <span className="font-semibold">Not found:</span> {error.message}
        </div>
      );
    }

    if (error.status === 409) {
      return (
        <div
          role="alert"
          className="p-4 bg-amber-50 border border-amber-400 rounded-lg text-amber-950 text-sm flex items-center justify-between gap-4"
        >
          <div>
            <p className="font-semibold">{error.message}</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Refresh to load the latest record state before trying again.
            </p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 bg-amber-800 text-white rounded text-xs font-medium hover:bg-amber-900"
            >
              Reload
            </button>
          )}
        </div>
      );
    }
  }

  const errMsg =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  return (
    <div
      role="alert"
      className="p-4 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-sm flex items-center justify-between gap-4"
    >
      <div>
        <p className="font-semibold">Unable to load {panelName ?? "data"}</p>
        <p className="text-xs text-rose-700 mt-0.5">{errMsg}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 bg-rose-700 text-white rounded text-xs font-medium hover:bg-rose-800"
        >
          Retry
        </button>
      )}
    </div>
  );
};

