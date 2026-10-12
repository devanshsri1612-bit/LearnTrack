import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateCheckInRequestSchema, CheckInRecord } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { formatLocalDateTime } from "../utils/date";

export const CheckInPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialDecisionParam = searchParams.get("decision");
  const initialDecision: "ACCEPT" | "DEFER" | "DECLINE" =
    initialDecisionParam === "DEFER" || initialDecisionParam === "DECLINE"
      ? initialDecisionParam
      : "ACCEPT";

  const [contextNote, setContextNote] = useState("");
  const [supportRequested, setSupportRequested] = useState<
    CheckInRecord["supportRequested"]
  >("ACADEMIC_TUTORING");
  const [optionalSupportDecision, setOptionalSupportDecision] = useState<
    "ACCEPT" | "DEFER" | "DECLINE"
  >(initialDecision);
  const [sharingOptions, setSharingOptions] = useState<
    CheckInRecord["sharingOptions"]
  >([
    { recipientRole: "MENTOR", allowed: true },
    { recipientRole: "FACULTY", allowed: true },
    { recipientRole: "COUNSELLOR", allowed: false },
    { recipientRole: "FINANCE", allowed: false },
  ]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<CheckInRecord | null>(
    null
  );

  const canFetchDefaultCheckIn = !user?.studentId || user.studentId === "S-104";
  const recentCheckInQuery = useQuery({
    queryKey: ["checkIn", "CHK-101", user?.studentId ?? "S-104"],
    queryFn: () => api.studentApp.getCheckIn("CHK-101"),
    enabled: canFetchDefaultCheckIn,
  });

  const createCheckInMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.studentApp.createCheckIn>[0]) =>
      api.studentApp.createCheckIn(payload),
    onSuccess: (created) => {
      setSubmittedRecord(created);
      setContextNote("");
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ["mySupport"] });
    },
    onError: (err) => {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to submit check-in"
      );
    },
  });

  const toggleRoleSharing = (
    role: "MENTOR" | "FACULTY" | "COUNSELLOR" | "FINANCE"
  ) => {
    setSharingOptions((prev) =>
      prev.map((opt) =>
        opt.recipientRole === role ? { ...opt, allowed: !opt.allowed } : opt
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = CreateCheckInRequestSchema.safeParse({
      contextNote,
      supportRequested,
      optionalSupportDecision,
      sharingOptions,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }

    createCheckInMutation.mutate(parsed.data);
  };

  const latestCheckIn = submittedRecord ?? recentCheckInQuery.data;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <h1 className="text-xl font-bold text-slate-900">
          Student Check-in & Support Request
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          Share your own context in your own words, request support, or decline/defer optional support. Choose which staff roles can view this check-in.
        </p>
      </div>

      {submittedRecord && (
        <div
          role="status"
          className="p-4 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 space-y-1"
        >
          <div className="font-bold">
            Check-in submitted ({submittedRecord.id})
          </div>
          <p>
            Decision: <strong>{submittedRecord.optionalSupportDecision}</strong>{" "}
            • Requested: <strong>{submittedRecord.supportRequested}</strong>
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded bg-rose-50 border border-rose-300 text-xs text-rose-800"
          >
            {errorMsg}
          </div>
        )}

        <div>
          <label
            htmlFor="checkin-context"
            className="block text-xs font-semibold text-slate-700"
          >
            Your Context (Free-text)
          </label>
          <textarea
            id="checkin-context"
            rows={3}
            value={contextNote}
            onChange={(e) => setContextNote(e.target.value)}
            placeholder="Share anything affecting your classes, commute, or schedule..."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="support-request-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Support Request
            </label>
            <select
              id="support-request-select"
              value={supportRequested}
              onChange={(e) =>
                setSupportRequested(
                  e.target.value as CheckInRecord["supportRequested"]
                )
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white"
            >
              <option value="ACADEMIC_TUTORING">
                Peer Tutoring (ACADEMIC_TUTORING)
              </option>
              <option value="MENTOR_CHECKIN">
                Faculty Mentor Check-in (MENTOR_CHECKIN)
              </option>
              <option value="COUNSELLING_REFERRAL">
                Voluntary Counselling Referral (COUNSELLING_REFERRAL)
              </option>
              <option value="FEE_GUIDANCE">
                Fee Installment Guidance (FEE_GUIDANCE)
              </option>
              <option value="NONE">No additional support needed (NONE)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="optional-decision-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Optional Support Preference
            </label>
            <select
              id="optional-decision-select"
              value={optionalSupportDecision}
              onChange={(e) =>
                setOptionalSupportDecision(
                  e.target.value as "ACCEPT" | "DEFER" | "DECLINE"
                )
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white"
            >
              <option value="ACCEPT">Accept optional support</option>
              <option value="DEFER">Defer optional support for now</option>
              <option value="DECLINE">Decline optional support</option>
            </select>
          </div>
        </div>

        <div>
          <span className="block text-xs font-semibold text-slate-700 mb-1.5">
            Sharing Options (Who can see this check-in note?)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sharingOptions.map((opt) => (
              <label
                key={opt.recipientRole}
                className="flex items-center gap-2 p-2.5 rounded border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
              >
                <input
                  type="checkbox"
                  checked={opt.allowed}
                  onChange={() => toggleRoleSharing(opt.recipientRole)}
                />
                <span>{opt.recipientRole}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={createCheckInMutation.isPending}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {createCheckInMutation.isPending
              ? "Submitting..."
              : "Submit Check-in"}
          </button>
        </div>
      </form>

      {latestCheckIn && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-slate-700">
            <span>Last Recorded Check-in ({latestCheckIn.id})</span>
            <span>{formatLocalDateTime(latestCheckIn.createdAt)}</span>
          </div>
          <p className="text-slate-700">{latestCheckIn.contextNote}</p>
        </div>
      )}
    </div>
  );
};

