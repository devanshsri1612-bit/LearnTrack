import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConsentGrant } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDateTime } from "../utils/date";

export const ConsentPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [revokedNoticeVisible, setRevokedNoticeVisible] = useState(false);
  const [grantedNotice, setGrantedNotice] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["consent"],
    queryFn: () => api.studentApp.getConsent(),
  });

  const patchConsentMutation = useMutation({
    mutationFn: (payload: {
      scope: ConsentGrant["scope"];
      recipientRole: ConsentGrant["recipientRole"];
      granted: boolean;
    }) => api.studentApp.patchConsent(payload),
    onSuccess: (updated, variables) => {
      setConsentError(null);
      queryClient.setQueryData(["consent"], updated);
      if (!variables.granted) {
        setGrantedNotice(null);
        setRevokedNoticeVisible(true);
      } else {
        setRevokedNoticeVisible(false);
        setGrantedNotice(
          `Sharing granted for ${variables.scope} with ${variables.recipientRole}.`
        );
      }
    },
    onError: (err) => {
      setConsentError(
        err instanceof Error ? err.message : "Failed to update consent setting"
      );
    },
  });

  if (isLoading) {
    return <LoadingSkeleton lines={5} label="Loading consent settings..." />;
  }

  if (error || !data) {
    return (
      <PanelErrorState
        error={error}
        onRetry={() => void refetch()}
        panelName="Consent & Sharing"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <h1 className="text-xl font-bold text-slate-900">
          Consent & Data Sharing Controls
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          Control which scopes of your check-in and support data are visible to each role. Changes take effect immediately for future views.
        </p>
      </div>

      {consentError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-800"
        >
          {consentError}
        </div>
      )}

      {grantedNotice && (
        <div
          role="status"
          className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold flex items-center justify-between"
        >
          <span>{grantedNotice}</span>
          <button
            type="button"
            onClick={() => setGrantedNotice(null)}
            className="text-emerald-900 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mandatory exact copy on revoke */}
      {revokedNoticeVisible && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs font-semibold flex items-center justify-between"
        >
          <span>Future sharing stops. Emails already sent cannot be recalled.</span>
          <button
            type="button"
            onClick={() => setRevokedNoticeVisible(false)}
            className="text-amber-900 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table
          aria-label="Consent grants per scope and recipient role"
          className="w-full text-left border-collapse text-xs"
        >
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
              <th className="py-3 px-4">Data Scope</th>
              <th className="py-3 px-4">Recipient Role</th>
              <th className="py-3 px-4">Last Updated</th>
              <th className="py-3 px-4">Status & Toggle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.grants.map((grant) => (
              <tr key={grant.id} className="hover:bg-slate-50">
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-900">
                    {grant.scopeLabel}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {grant.scope}
                  </div>
                </td>
                <td className="py-3 px-4 font-semibold text-slate-800">
                  {grant.recipientRole}
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {formatLocalDateTime(grant.updatedAt)}
                </td>
                <td className="py-3 px-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={grant.granted}
                    aria-label={`Toggle ${grant.scopeLabel} for ${grant.recipientRole}`}
                    disabled={patchConsentMutation.isPending}
                    onClick={() =>
                      patchConsentMutation.mutate({
                        scope: grant.scope,
                        recipientRole: grant.recipientRole,
                        granted: !grant.granted,
                      })
                    }
                    className={`px-3 py-1 rounded-full font-semibold border transition-colors ${
                      grant.granted
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {grant.granted ? "Granted (Revoke)" : "Revoked (Grant)"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

