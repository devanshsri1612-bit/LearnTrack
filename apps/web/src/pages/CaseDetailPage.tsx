import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  InterventionType,
  CaseActionType,
  PatchCaseRequestSchema,
  CreateEvidenceRequestSchema,
  CreateOutcomeRequestSchema,
  OutcomeClassification,
} from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { ApiClientError } from "../api/client";
import { LifecycleStatusBadge, DeadlineBadge } from "../components/StatusBadges";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDateTime, formatLocalDate } from "../utils/date";

const INTERVENTION_OPTIONS: InterventionType[] = [
  "PEER_TUTOR",
  "MENTOR",
  "REMEDIAL",
  "FEE_SUPPORT",
  "COUNSELLING_REFERRAL",
  "PLACEMENT_READINESS",
  "PARENT_MEETING",
];

const ALL_CASE_ACTIONS: CaseActionType[] = [
  "APPROVE",
  "OVERRIDE",
  "DEFER",
  "DECLINE",
  "START_PROGRESS",
  "COMPLETE_ACTION",
  "CLOSE",
  "REOPEN",
];

const STAFF_OWNERS = [
  { id: "STAFF-MENTOR-1", name: "Dr. Priya Nair (MENTOR)" },
  { id: "STAFF-COUNSELLOR-1", name: "Ananya Sen (COUNSELLOR)" },
  { id: "STAFF-FINANCE-1", name: "Karthik Menon (FINANCE)" },
  { id: "STAFF-HOD-1", name: "Prof. Rajesh Iyer (HOD)" },
];

const OBSERVED_MEASURES_OPTIONS = [
  "Lab attendance records over 2 weeks",
  "Coursework / quiz submission completion",
  "Tutoring session completion notes",
  "Student self-reported check-in update",
  "Fee installment verification",
];

export const CaseDetailPage: React.FC = () => {
  const { id = "C-104" } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // Review & transition form state
  const [selectedAction, setSelectedAction] =
    useState<CaseActionType>("APPROVE");
  const [selectedIntervention, setSelectedIntervention] =
    useState<InterventionType>("PEER_TUTOR");
  const [overrideReason, setOverrideReason] = useState("");
  const [ownerId, setOwnerId] = useState("STAFF-MENTOR-1");
  const [deadline, setDeadline] = useState("2026-10-20");
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionSuccess, setTransitionSuccess] = useState<string | null>(null);
  const [conflictDetected, setConflictDetected] = useState(false);
  const [proposedFallbackStaff, setProposedFallbackStaff] = useState<{
    staffId: string;
    name: string;
    role: string;
  } | null>(null);

  // Evidence form state
  const [evidenceType, setEvidenceType] = useState<
    | "MEETING_NOTES"
    | "ATTENDANCE_VERIFICATION"
    | "TUTORING_SUMMARY"
    | "FEE_PLAN_AGREEMENT"
    | "FOLLOW_UP_OBSERVATION"
  >("MEETING_NOTES");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceDate, setEvidenceDate] = useState("2026-10-12");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceSuccess, setEvidenceSuccess] = useState<string | null>(null);

  // Outcome form state
  const [outcomeClassification, setOutcomeClassification] =
    useState<OutcomeClassification>("UNKNOWN");
  const [observedMeasures, setObservedMeasures] = useState<string[]>([
    "Lab attendance records over 2 weeks",
  ]);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [outcomeSuccess, setOutcomeSuccess] = useState<string | null>(null);

  const caseQuery = useQuery({
    queryKey: ["case", id],
    queryFn: () => api.cases.get(id),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["caseRecommendations", id],
    queryFn: () => api.cases.getRecommendations(id),
  });

  const timelineQuery = useQuery({
    queryKey: ["caseTimeline", id],
    queryFn: () => api.cases.getTimeline(id),
  });

  useEffect(() => {
    const data = caseQuery.data;
    if (!data) return;

    if (data.selectedIntervention) {
      setSelectedIntervention(data.selectedIntervention);
    } else if (data.recommendedIntervention) {
      setSelectedIntervention(data.recommendedIntervention);
    }

    if (data.ownerId && STAFF_OWNERS.some((s) => s.id === data.ownerId)) {
      setOwnerId(data.ownerId);
    }

    if (data.deadline && data.deadline.length >= 10) {
      setDeadline(data.deadline.slice(0, 10));
    }

    setSelectedAction((prev) => {
      const currentAllowed = data.allowedTransitions.find(
        (t) => t.action === prev && t.allowed
      );
      if (currentAllowed) return prev;
      const firstAllowed = ALL_CASE_ACTIONS.find((act) =>
        data.allowedTransitions.some((t) => t.action === act && t.allowed)
      );
      return firstAllowed ?? prev;
    });
  }, [caseQuery.data]);

  const patchCaseMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.cases.patch>[1]) =>
      api.cases.patch(id, payload),
    onSuccess: (updated, variables) => {
      setConflictDetected(false);
      setProposedFallbackStaff(null);
      setTransitionError(null);
      setTransitionSuccess(
        `Decision recorded (${variables.action}) — Case is now ${updated.status}.`
      );
      setOverrideReason("");
      queryClient.setQueryData(["case", id], updated);
      void timelineQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["priorityQueue"] });
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      setTransitionSuccess(null);
      if (err instanceof ApiClientError && err.status === 409) {
        if (err.code === "STAFF_CAPACITY_FULL") {
          setTransitionError(err.message);
          const proposed = (
            err.details as {
              proposedStaff?: { staffId: string; name: string; role: string };
            }
          )?.proposedStaff;
          if (proposed) {
            setProposedFallbackStaff(proposed);
          }
        } else {
          setConflictDetected(true);
        }
      } else {
        setTransitionError(
          err instanceof Error ? err.message : "Failed to update case"
        );
      }
    },
  });

  const addEvidenceMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.cases.addEvidence>[1]) =>
      api.cases.addEvidence(id, payload),
    onSuccess: (record) => {
      setEvidenceNote("");
      setEvidenceError(null);
      setEvidenceSuccess(`Logged ${record.type} evidence (${record.date}).`);
      void caseQuery.refetch();
      void timelineQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (err) => {
      setEvidenceSuccess(null);
      setEvidenceError(
        err instanceof Error ? err.message : "Failed to log evidence"
      );
    },
  });

  const recordOutcomeMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.cases.recordOutcome>[1]) =>
      api.cases.recordOutcome(id, payload),
    onSuccess: (outcome) => {
      setOutcomeNote("");
      setOutcomeError(null);
      setOutcomeSuccess(
        `Outcome review recorded as ${outcome.classification}. Case is now OUTCOME_REVIEWED.`
      );
      void caseQuery.refetch();
      void timelineQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["priorityQueue"] });
      void queryClient.invalidateQueries({ queryKey: ["analyticsCohorts"] });
      void queryClient.invalidateQueries({ queryKey: ["analyticsOutcomes"] });
    },
    onError: (err) => {
      setOutcomeSuccess(null);
      setOutcomeError(
        err instanceof Error ? err.message : "Failed to record outcome review"
      );
    },
  });

  if (caseQuery.isLoading) {
    return <LoadingSkeleton lines={6} label="Loading case details..." />;
  }

  if (caseQuery.error || !caseQuery.data) {
    return (
      <PanelErrorState
        error={caseQuery.error}
        onRetry={() => void caseQuery.refetch()}
        panelName="Case detail"
      />
    );
  }

  const caseData = caseQuery.data;

  const isActionAllowed = (action: CaseActionType): {
    allowed: boolean;
    reason?: string;
  } => {
    const found = caseData.allowedTransitions.find((t) => t.action === action);
    if (!found) {
      return {
        allowed: false,
        reason: "Transition not permitted for current role or state.",
      };
    }
    return { allowed: found.allowed, reason: found.reasonIfDisabled };
  };

  const handleTransitionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTransitionError(null);
    setTransitionSuccess(null);
    setProposedFallbackStaff(null);

    const check = isActionAllowed(selectedAction);
    if (!check.allowed) {
      setTransitionError(
        check.reason ?? `Action ${selectedAction} is not allowed in status ${caseData.status}.`
      );
      return;
    }

    const parsedDeadline = deadline ? new Date(deadline) : null;
    if (parsedDeadline && Number.isNaN(parsedDeadline.getTime())) {
      setTransitionError("Please enter a valid follow-up deadline date.");
      return;
    }

    const payload = {
      action: selectedAction,
      version: caseData.version,
      updatedAt: caseData.updatedAt,
      selectedIntervention,
      overrideReason:
        selectedAction === "OVERRIDE" ? overrideReason : undefined,
      ownerId,
      deadline: parsedDeadline ? parsedDeadline.toISOString() : undefined,
    };

    const parsed = PatchCaseRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setTransitionError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }

    patchCaseMutation.mutate(parsed.data);
  };

  const handleEvidenceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEvidenceError(null);
    setEvidenceSuccess(null);
    const parsed = CreateEvidenceRequestSchema.safeParse({
      type: evidenceType,
      note: evidenceNote,
      date: evidenceDate,
    });
    if (!parsed.success) {
      setEvidenceError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    addEvidenceMutation.mutate(parsed.data);
  };

  const handleOutcomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOutcomeError(null);
    setOutcomeSuccess(null);
    const parsed = CreateOutcomeRequestSchema.safeParse({
      classification: outcomeClassification,
      observedMeasures,
      note: outcomeNote,
    });
    if (!parsed.success) {
      setOutcomeError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    recordOutcomeMutation.mutate(parsed.data);
  };

  const toggleMeasure = (m: string) => {
    setObservedMeasures((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  const isCohortTask = caseData.studentId.startsWith("COHORT-REVIEW:");

  return (
    <div className="space-y-6">
      {/* 409 Optimistic Concurrency Banner */}
      {conflictDetected && (
        <div
          role="alert"
          className="p-4 bg-amber-50 border-2 border-amber-500 rounded-lg text-amber-950 flex items-center justify-between gap-4"
        >
          <div>
            <p className="font-bold text-sm">
              This case was changed by someone else
            </p>
            <p className="text-xs text-amber-900 mt-0.5">
              Reload the latest version of this case before submitting changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setConflictDetected(false);
              void caseQuery.refetch();
              void timelineQuery.refetch();
            }}
            className="px-3 py-1.5 rounded bg-amber-900 text-white text-xs font-semibold hover:bg-amber-950"
          >
            Reload
          </button>
        </div>
      )}

      {/* Case Header with SEPARATE Lifecycle Status and Deadline Badge */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">
              Case {caseData.id} — {caseData.studentName}
            </h1>
            <LifecycleStatusBadge status={caseData.status} />
            <DeadlineBadge status={caseData.deadlineStatus} />
          </div>
          <p className="text-xs text-slate-700">{caseData.plainLanguageReason}</p>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-4">
            <span>
              {isCohortTask ? "Cohort: " : "Student: "}
              <Link
                to={
                  isCohortTask
                    ? `/students?cohort=${encodeURIComponent(caseData.cohort)}`
                    : `/students/${caseData.studentId}`
                }
                className="font-semibold text-blue-700 hover:underline"
              >
                {caseData.studentId}
              </Link>
            </span>
            <span>Owner: {caseData.ownerName ?? "Unassigned"}</span>
            <span>Deadline: {formatLocalDate(caseData.deadline)}</span>
            <span>Version: v{caseData.version}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={
              isCohortTask
                ? `/tutors?subject=${encodeURIComponent("Data Structures")}&caseId=${caseData.id}`
                : `/tutors?subject=${encodeURIComponent("Data Structures")}&studentId=${caseData.studentId}&caseId=${caseData.id}`
            }
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Assign Verified Tutor
          </Link>
          <Link
            to={
              isCohortTask
                ? `/meetings?caseId=${caseData.id}`
                : `/meetings?studentId=${caseData.studentId}&caseId=${caseData.id}`
            }
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Schedule Meeting
          </Link>
        </div>
      </div>

      {/* Stage 3.5: Ranked Recommendations Panel (No Auto-Assign button) */}
      <section
        aria-label="Intervention Recommendations"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Ranked Support Recommendations
            </h2>
            <p className="text-xs text-slate-600">
              Every recommendation requires an explicit human review decision below. Counselling is only ever a voluntary referral.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 text-xs font-semibold">
            Indicator, not a diagnosis. A human decides.
          </span>
        </div>

        {recommendationsQuery.isLoading ? (
          <LoadingSkeleton lines={3} />
        ) : recommendationsQuery.error ? (
          <PanelErrorState
            error={recommendationsQuery.error}
            onRetry={() => void recommendationsQuery.refetch()}
            panelName="Recommendations"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(recommendationsQuery.data?.items ?? []).map((rec) => {
              const isBelowThreshold =
                rec.sampleSize < rec.minSampleThreshold ||
                rec.confidenceState !== "STANDARD";
              const isSelectedCard =
                selectedIntervention === rec.interventionType;

              return (
                <div
                  key={rec.id}
                  className={`p-3.5 rounded-lg border flex flex-col justify-between gap-2 transition-colors ${
                    isSelectedCard
                      ? "border-blue-500 bg-blue-50/40"
                      : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        #{rec.rank} • {rec.title} ({rec.interventionType})
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isSelectedCard && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-900 border border-blue-300">
                            Selected
                          </span>
                        )}
                        {rec.confidenceState === "INSUFFICIENT_DATA" ? (
                          <span
                            role="status"
                            className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300"
                          >
                            Insufficient data
                          </span>
                        ) : isBelowThreshold ? (
                          <span
                            role="status"
                            className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300"
                          >
                            Low confidence
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">{rec.rationale}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600">
                    <span>
                      <strong>
                        {rec.improvedCount} of {rec.sampleSize} similar past cases improved (synthetic)
                      </strong>{" "}
                      (n={rec.sampleSize}, threshold={rec.minSampleThreshold})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIntervention(rec.interventionType);
                        setTransitionError(null);
                        setTransitionSuccess(null);
                        const approveCheck = isActionAllowed("APPROVE");
                        const overrideCheck = isActionAllowed("OVERRIDE");
                        if (
                          rec.interventionType ===
                            caseData.recommendedIntervention &&
                          approveCheck.allowed
                        ) {
                          setSelectedAction("APPROVE");
                        } else if (overrideCheck.allowed) {
                          setSelectedAction("OVERRIDE");
                        }
                      }}
                      className="text-blue-700 font-semibold hover:underline"
                    >
                      {isSelectedCard ? "Selected for review" : "Select for human review"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Stage 3.6: Human Decision & Case Review Form */}
      <section
        aria-label="Case Human Decision and Assignment"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">
          Human Decision & Assignment
        </h2>

        {/* Action selector buttons with disabled tooltips for disallowed transitions */}
        <div
          role="group"
          aria-label="Case transition actions"
          className="flex flex-wrap gap-2"
        >
          {ALL_CASE_ACTIONS.map((action) => {
            const check = isActionAllowed(action);
            const active = selectedAction === action;
            return (
              <button
                key={action}
                type="button"
                disabled={!check.allowed}
                title={!check.allowed ? check.reason : `Select ${action}`}
                aria-label={`Action ${action}${!check.allowed && check.reason ? ` (${check.reason})` : ""}`}
                onClick={() => {
                  setSelectedAction(action);
                  setTransitionError(null);
                  setTransitionSuccess(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                  !check.allowed
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {action}
              </button>
            );
          })}
        </div>

        {transitionError && (
          <div
            role="alert"
            className="p-3 rounded-md bg-rose-50 border border-rose-300 text-xs text-rose-800 flex flex-wrap items-center justify-between gap-2"
          >
            <span>{transitionError}</span>
            {proposedFallbackStaff && (
              <button
                type="button"
                onClick={() => {
                  setOwnerId(proposedFallbackStaff.staffId);
                  setProposedFallbackStaff(null);
                  setTransitionError(null);
                }}
                className="px-2.5 py-1 rounded bg-rose-800 text-white text-xs font-semibold hover:bg-rose-900"
              >
                Switch to {proposedFallbackStaff.name} ({proposedFallbackStaff.role})
              </button>
            )}
          </div>
        )}

        {transitionSuccess && (
          <div
            role="status"
            className="p-3 rounded-md bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
          >
            {transitionSuccess}
          </div>
        )}

        <form
          onSubmit={handleTransitionSubmit}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2"
        >
          <div>
            <label
              htmlFor="intervention-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Intervention Type
            </label>
            <select
              id="intervention-select"
              value={selectedIntervention}
              onChange={(e) =>
                setSelectedIntervention(e.target.value as InterventionType)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white"
            >
              {INTERVENTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="owner-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Assign Owner
            </label>
            <select
              id="owner-select"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white"
            >
              {STAFF_OWNERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="deadline-picker"
              className="block text-xs font-semibold text-slate-700"
            >
              Follow-up Deadline
            </label>
            <input
              id="deadline-picker"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs bg-white"
            />
          </div>

          {selectedAction === "OVERRIDE" && (
            <div className="md:col-span-3">
              <label
                htmlFor="override-reason"
                className="block text-xs font-semibold text-slate-700"
              >
                Override Reason (Required, minimum 10 characters)
              </label>
              <textarea
                id="override-reason"
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why a different support option is better suited..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
          )}

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={patchCaseMutation.isPending || !isActionAllowed(selectedAction).allowed}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {patchCaseMutation.isPending
                ? "Recording Decision..."
                : `Confirm ${selectedAction} Decision`}
            </button>
          </div>
        </form>
      </section>

      {/* Stage 3.8 & 3.9: Evidence Logging & Outcome Review */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Evidence Panel */}
        <section
          aria-label="Case Evidence Logging"
          className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Structured Evidence Log
            </h2>
            {/* Mandatory exact copy from spec */}
            <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded mt-1 inline-block">
              A sent email does not prove a meeting occurred.
            </p>
          </div>

          {evidenceError && (
            <div
              role="alert"
              className="p-2.5 rounded bg-rose-50 border border-rose-300 text-xs text-rose-800"
            >
              {evidenceError}
            </div>
          )}

          {evidenceSuccess && (
            <div
              role="status"
              className="p-2.5 rounded bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
            >
              {evidenceSuccess}
            </div>
          )}

          <form onSubmit={handleEvidenceSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="evidence-type"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Evidence Type
                </label>
                <select
                  id="evidence-type"
                  value={evidenceType}
                  onChange={(e) =>
                    setEvidenceType(e.target.value as typeof evidenceType)
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value="MEETING_NOTES">MEETING_NOTES</option>
                  <option value="ATTENDANCE_VERIFICATION">
                    ATTENDANCE_VERIFICATION
                  </option>
                  <option value="TUTORING_SUMMARY">TUTORING_SUMMARY</option>
                  <option value="FEE_PLAN_AGREEMENT">FEE_PLAN_AGREEMENT</option>
                  <option value="FOLLOW_UP_OBSERVATION">
                    FOLLOW_UP_OBSERVATION
                  </option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="evidence-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Observation Date
                </label>
                <input
                  id="evidence-date"
                  type="date"
                  value={evidenceDate}
                  onChange={(e) => setEvidenceDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="evidence-note"
                className="block text-xs font-semibold text-slate-700"
              >
                Structured Evidence Note
              </label>
              <textarea
                id="evidence-note"
                rows={2}
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Document what was discussed or verified during the interaction..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={addEvidenceMutation.isPending}
              className="px-3.5 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {addEvidenceMutation.isPending
                ? "Logging Evidence..."
                : "Log Evidence"}
            </button>
          </form>

          {/* Existing Evidence List */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recorded Evidence ({(caseData.evidence ?? []).length})
            </h3>
            {(caseData.evidence ?? []).map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs space-y-1"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>{ev.type}</span>
                  <span className="text-slate-500">{ev.date}</span>
                </div>
                <p className="text-slate-700">{ev.note}</p>
                <div className="text-[11px] text-slate-400">
                  By {ev.authorName} ({ev.authorRole})
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Outcome Review Panel */}
        <section
          aria-label="Case Outcome Review"
          className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Outcome Review
            </h2>
            <p className="text-xs text-slate-600">
              Record observed outcomes honestly. UNKNOWN is a first-class choice; an improved result is never required to close a case.
            </p>
          </div>

          {outcomeError && (
            <div
              role="alert"
              className="p-2.5 rounded bg-rose-50 border border-rose-300 text-xs text-rose-800"
            >
              {outcomeError}
            </div>
          )}

          {outcomeSuccess && (
            <div
              role="status"
              className="p-2.5 rounded bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
            >
              {outcomeSuccess}
            </div>
          )}

          <form onSubmit={handleOutcomeSubmit} className="space-y-3">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                Outcome Classification
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  ["IMPROVEMENT", "NO_CHANGE", "UNKNOWN"] as OutcomeClassification[]
                ).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setOutcomeClassification(cls)}
                    className={`py-2 px-2 rounded border text-xs font-bold ${
                      outcomeClassification === cls
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                Observed Measures
              </span>
              <div className="space-y-1">
                {OBSERVED_MEASURES_OPTIONS.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 text-xs text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={observedMeasures.includes(m)}
                      onChange={() => toggleMeasure(m)}
                    />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="outcome-note"
                className="block text-xs font-semibold text-slate-700"
              >
                Outcome Review Note
              </label>
              <textarea
                id="outcome-note"
                rows={2}
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                placeholder="Summarize observed measures or why outcome remains UNKNOWN..."
                className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={recordOutcomeMutation.isPending}
              className="px-3.5 py-1.5 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
            >
              {recordOutcomeMutation.isPending
                ? "Saving Outcome..."
                : "Record Outcome Review"}
            </button>
          </form>

          {caseData.outcome && (
            <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs space-y-1">
              <div className="font-bold text-emerald-950">
                Recorded Outcome: {caseData.outcome.classification}
              </div>
              <p className="text-emerald-900">{caseData.outcome.note}</p>
            </div>
          )}
        </section>
      </div>

      {/* Stage 3.7: Case Timeline */}
      <section
        aria-label="Case Lifecycle Timeline"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Case Audit & Escalation Timeline
          </h2>
          <div className="flex items-center gap-2">
            <LifecycleStatusBadge status={caseData.status} />
            <DeadlineBadge status={caseData.deadlineStatus} />
          </div>
        </div>

        {timelineQuery.isLoading ? (
          <LoadingSkeleton lines={3} />
        ) : (
          <ul className="divide-y divide-slate-200 text-xs">
            {(timelineQuery.data?.entries ?? []).map((entry) => (
              <li key={entry.id} className="py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    {entry.eventType === "ESCALATED"
                      ? "Escalated to HOD for staff follow-up"
                      : entry.summary}
                  </span>
                  <span className="text-slate-500">
                    {formatLocalDateTime(entry.timestamp)}
                  </span>
                </div>
                {entry.detail && (
                  <p className="text-slate-600">{entry.detail}</p>
                )}
                <div className="text-[11px] text-slate-400">
                  Actor: {entry.actorName} ({entry.actorRole})
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

