import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { isRestrictedField, TrendPoint } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import {
  LoadingSkeleton,
  PanelErrorState,
  RestrictedFieldBox,
  NoObservationsBox,
} from "../components/StateViews";
import { formatLocalDate, formatLocalDateTime } from "../utils/date";

const TrendChartCard: React.FC<{
  title: string;
  data: unknown;
  color?: string;
}> = ({ title, data, color = "#2563eb" }) => {
  if (isRestrictedField(data)) {
    return (
      <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {title}
        </h3>
        <RestrictedFieldBox label={title} />
      </div>
    );
  }

  const points = Array.isArray(data) ? (data as TrendPoint[]) : [];

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {title}
        </h3>
        {points.length > 0 && (
          <span className="text-xs font-semibold text-slate-800">
            Latest: {points[points.length - 1]?.value ?? "—"}%
          </span>
        )}
      </div>

      {points.length === 0 ? (
        <NoObservationsBox label={title} />
      ) : (
        <div
          role="img"
          aria-label={`${title} trend chart showing ${points.length} observations`}
          className="h-40 w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const Student360Page: React.FC = () => {
  const { id = "S-104" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [manualReviewNote, setManualReviewNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [assessmentNotice, setAssessmentNotice] = useState<string | null>(null);

  const studentQuery = useQuery({
    queryKey: ["student360", id],
    queryFn: () => api.students.get360(id),
  });

  const historyQuery = useQuery({
    queryKey: ["studentHistory", id],
    queryFn: () => api.students.getHistory(id),
  });

  const assessmentQuery = useQuery({
    queryKey: ["studentAssessment", id],
    queryFn: () => api.students.getLatestAssessment(id),
  });

  const runAssessmentMutation = useMutation({
    mutationFn: () => api.students.runAssessment(id),
    onSuccess: (updated) => {
      setActionError(null);
      setAssessmentNotice(
        `Assessment updated (${updated.sourceMode}) — ${updated.attentionSummary}`
      );
      queryClient.setQueryData(["studentAssessment", id], updated);
      void studentQuery.refetch();
      void historyQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["priorityQueue"] });
    },
    onError: (err) => {
      setAssessmentNotice(null);
      setActionError(
        err instanceof Error ? err.message : "Failed to run assessment"
      );
    },
  });

  const createManualCaseMutation = useMutation({
    mutationFn: (reason: string) =>
      api.cases.create({
        studentId: id,
        recommendedIntervention: "MENTOR",
        plainLanguageReason: reason,
      }),
    onSuccess: (created) => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["student360", id] });
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["priorityQueue"] });
      navigate(`/cases/${created.id}`);
    },
    onError: (err) => {
      setActionError(
        err instanceof Error ? err.message : "Failed to create support case"
      );
      void studentQuery.refetch();
    },
  });

  if (studentQuery.isLoading) {
    return <LoadingSkeleton lines={6} label="Loading Student 360 profile..." />;
  }

  if (studentQuery.error || !studentQuery.data) {
    return (
      <PanelErrorState
        error={studentQuery.error}
        onRetry={() => void studentQuery.refetch()}
        panelName="Student 360"
      />
    );
  }

  const student = studentQuery.data;
  const assessment = assessmentQuery.data;

  const handleManualReview = () => {
    setActionError(null);
    const trimmed = manualReviewNote.trim();
    if (trimmed.length > 0 && trimmed.length < 5) {
      setActionError("Manual review reason must be at least 5 characters.");
      return;
    }
    createManualCaseMutation.mutate(
      trimmed || `Manual human review initiated for ${student.name}.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 border border-slate-300">
              {student.id}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Cohort: <strong>{student.cohort}</strong> • Department:{" "}
            <strong>{student.department}</strong> • Semester {student.semester}
            {student.mentorName ? ` • Mentor: ${student.mentorName}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {student.activeCaseId ? (
            <Link
              to={`/cases/${student.activeCaseId}`}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              Open Active Case ({student.activeCaseId})
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                createManualCaseMutation.mutate(
                  `Manual support review opened for ${student.name} (${student.id}).`
                );
              }}
              disabled={createManualCaseMutation.isPending}
              className="px-3 py-1.5 rounded-md border border-blue-600 text-blue-700 text-xs font-semibold hover:bg-blue-50 disabled:opacity-50"
            >
              {createManualCaseMutation.isPending
                ? "Opening case..."
                : "Open Support Case"}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-800"
        >
          {actionError}
        </div>
      )}

      {assessmentNotice && (
        <div
          role="status"
          className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
        >
          {assessmentNotice}
        </div>
      )}

      {/* Missing data banner for S-107 or students without recent observations */}
      {!student.hasRecentObservations && (
        <div
          role="region"
          aria-label="Missing data notice"
          className="p-4 rounded-lg bg-slate-100 border border-slate-300 text-sm text-slate-800"
        >
          <strong>No recent observations</strong> — This student record has no recent attendance, marks, or check-in observations for the current term. Values are never fabricated or imputed.
        </div>
      )}

      {/* Stage 2.4: Risk Panel with the 4 Evidence Groups */}
      <section
        aria-label="Risk and Attention Indicator Panel"
        className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                Attention Indicator & Evidence Review
              </h2>
              {assessment && (
                <span
                  role="status"
                  aria-label={
                    assessment.sourceMode === "ML"
                      ? "Assessment source: ML"
                      : "Assessment source: Fallback (not a model result)"
                  }
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    assessment.sourceMode === "ML"
                      ? "bg-indigo-50 text-indigo-900 border-indigo-300"
                      : "bg-amber-100 text-amber-950 border-amber-400"
                  }`}
                >
                  {assessment.sourceMode === "ML"
                    ? "ML"
                    : "Fallback (not a model result)"}
                </span>
              )}
            </div>
            {/* Mandatory non-negotiable copy */}
            <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 inline-block px-2.5 py-1 rounded">
              Indicator, not a diagnosis. A human decides.
            </p>
          </div>

          <button
            type="button"
            onClick={() => runAssessmentMutation.mutate()}
            disabled={runAssessmentMutation.isPending}
            className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {runAssessmentMutation.isPending
              ? "Running assessment..."
              : "Run Assessment"}
          </button>
        </div>

        {assessmentQuery.isLoading ? (
          <LoadingSkeleton lines={4} label="Loading attention indicator..." />
        ) : assessmentQuery.error ? (
          <PanelErrorState
            error={assessmentQuery.error}
            onRetry={() => void assessmentQuery.refetch()}
            panelName="Risk assessment panel"
          />
        ) : !assessment || assessment.sourceMode === "UNAVAILABLE" ? (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-300 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                ML Assessment Unavailable — {assessment?.attentionSummary ?? "No recent observations"}
              </span>
              <span className="text-xs text-slate-500">
                Model version: {assessment?.modelVersion ?? "N/A"}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              {assessment?.limitations ??
                "Automated indicator is unavailable due to insufficient recent observations. Staff may initiate a manual support review below."}
            </p>
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Manual review note"
                value={manualReviewNote}
                onChange={(e) => setManualReviewNote(e.target.value)}
                placeholder="Enter reason for manual review (min 5 chars)..."
                className="flex-1 min-w-[240px] rounded border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleManualReview}
                disabled={createManualCaseMutation.isPending}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {createManualCaseMutation.isPending
                  ? "Opening..."
                  : "Initiate Manual Review"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Score shown strictly as "needs attention", never a probability or verdict */}
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs uppercase font-semibold text-slate-500 block">
                  Indicator Status
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {assessment.needsAttention
                    ? `Needs attention — ${assessment.attentionSummary}`
                    : "Routine observation — no immediate attention flag"}
                </span>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>Model Version: {assessment.modelVersion}</div>
                <div>Evaluated: {formatLocalDateTime(assessment.createdAt)}</div>
              </div>
            </div>

            {/* Four labelled evidence groups */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Group 1: Observed changes in data */}
              <div className="p-3.5 rounded-lg border border-slate-200 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. Observed changes in data
                </h3>
                {assessment.evidenceGroups.observedChanges.length === 0 ? (
                  <NoObservationsBox />
                ) : (
                  <ul className="space-y-2 text-xs">
                    {assessment.evidenceGroups.observedChanges.map((item) => (
                      <li key={item.id} className="p-2 rounded bg-slate-50">
                        <div className="font-semibold text-slate-900">
                          {item.label}
                        </div>
                        <div className="text-slate-600">{item.detail}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Group 2: Model explanation */}
              <div className="p-3.5 rounded-lg border border-slate-200 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Model explanation
                </h3>
                {assessment.evidenceGroups.modelExplanation.length === 0 ? (
                  <NoObservationsBox />
                ) : (
                  <ul className="space-y-2 text-xs">
                    {assessment.evidenceGroups.modelExplanation.map((item) => (
                      <li key={item.id} className="p-2 rounded bg-slate-50">
                        <div className="font-semibold text-slate-900">
                          {item.label}
                        </div>
                        <div className="text-slate-600">{item.detail}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Group 3: Hypothesised causes (clearly marked as hypotheses) */}
              <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    3. Hypothesised causes
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                    Unverified Hypotheses
                  </span>
                </div>
                {assessment.evidenceGroups.hypothesisedCauses.length === 0 ? (
                  <NoObservationsBox />
                ) : (
                  <ul className="space-y-2 text-xs">
                    {assessment.evidenceGroups.hypothesisedCauses.map((item) => (
                      <li
                        key={item.id}
                        className="p-2 rounded bg-white border border-amber-200"
                      >
                        <div className="font-semibold text-amber-950">
                          {item.label}
                        </div>
                        <div className="text-slate-700">{item.detail}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Group 4: Student-confirmed context */}
              <div className="p-3.5 rounded-lg border border-slate-200 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  4. Student-confirmed context
                </h3>
                {isRestrictedField(
                  assessment.evidenceGroups.studentConfirmedContext
                ) ? (
                  <RestrictedFieldBox label="Student-confirmed context" />
                ) : !assessment.evidenceGroups.studentConfirmedContext ||
                  assessment.evidenceGroups.studentConfirmedContext.length ===
                    0 ? (
                  <NoObservationsBox />
                ) : (
                  <ul className="space-y-2 text-xs">
                    {assessment.evidenceGroups.studentConfirmedContext.map(
                      (item) => (
                        <li
                          key={item.id}
                          className="p-2 rounded bg-emerald-50 border border-emerald-200"
                        >
                          <div className="font-semibold text-emerald-950">
                            {item.label}
                          </div>
                          <div className="text-emerald-900">{item.detail}</div>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Limitations text */}
            <div className="p-3 rounded bg-slate-100 text-xs text-slate-700">
              <strong>Model Limitations:</strong> {assessment.limitations}
            </div>
          </div>
        )}
      </section>

      {/* Trend Charts Grid: Attendance, Marks, Participation, Skills */}
      <section aria-label="Student trend charts" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendChartCard
          title="Attendance (%)"
          data={student.attendance}
          color="#2563eb"
        />
        <TrendChartCard
          title="Assessment Marks (%)"
          data={student.marks}
          color="#0d9488"
        />
        <TrendChartCard
          title="Lab & Class Participation (%)"
          data={student.participation}
          color="#7c3aed"
        />
        <TrendChartCard
          title="Skills & Competency Progress (%)"
          data={student.skills}
          color="#ea580c"
        />
      </section>

      {/* Fees, Counselling, Faculty Feedback */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Fees */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Fee & Installment Status
          </h3>
          {isRestrictedField(student.fees) ? (
            <RestrictedFieldBox label="Fees" />
          ) : !student.fees ? (
            <NoObservationsBox label="Fees" />
          ) : (
            <div className="text-xs space-y-1.5">
              <div className="font-semibold text-slate-900">
                Status: {student.fees.status}
              </div>
              {student.fees.dueDate && (
                <div className="text-slate-600">
                  Due Date: {formatLocalDate(student.fees.dueDate)}
                </div>
              )}
              {student.fees.note && (
                <p className="text-slate-700 bg-slate-50 p-2 rounded">
                  {student.fees.note}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Counselling Referral Status */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Counselling Referral
          </h3>
          {isRestrictedField(student.counselling) ? (
            <RestrictedFieldBox label="Counselling referral" />
          ) : !student.counselling ? (
            <NoObservationsBox label="Counselling referral" />
          ) : (
            <div className="text-xs space-y-1.5">
              <div className="font-semibold text-slate-900">
                Referral Status: {student.counselling.referralStatus}
              </div>
              {student.counselling.summaryNote && (
                <p className="text-slate-700 bg-slate-50 p-2 rounded">
                  {student.counselling.summaryNote}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Student-Confirmed Context */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Recent Student Check-in
          </h3>
          {isRestrictedField(student.studentContext) ? (
            <RestrictedFieldBox label="Student check-in" />
          ) : !student.studentContext || !student.studentContext.summary ? (
            <NoObservationsBox label="Student check-in" />
          ) : (
            <div className="text-xs space-y-1.5">
              <p className="text-slate-800 bg-slate-50 p-2 rounded">
                {student.studentContext.summary}
              </p>
              {student.studentContext.requestedSupport && (
                <div className="text-slate-600">
                  Requested:{" "}
                  <strong className="text-slate-900">
                    {student.studentContext.requestedSupport}
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Faculty Feedback & Observation History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Faculty Feedback Observations
          </h3>
          {isRestrictedField(student.facultyFeedback) ? (
            <RestrictedFieldBox label="Faculty feedback" />
          ) : !student.facultyFeedback || student.facultyFeedback.length === 0 ? (
            <NoObservationsBox label="Faculty feedback" />
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {student.facultyFeedback.map((fb) => (
                <li key={fb.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>{fb.subject}</span>
                    <span className="text-slate-500 font-normal">
                      {formatLocalDate(fb.date)}
                    </span>
                  </div>
                  <p className="text-slate-700">{fb.observation}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Observation & Support History
          </h3>
          {historyQuery.isLoading ? (
            <LoadingSkeleton lines={3} />
          ) : !historyQuery.data || historyQuery.data.events.length === 0 ? (
            <NoObservationsBox label="History" />
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {historyQuery.data.events.map((ev) => (
                <li key={ev.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {ev.title}
                    </span>
                    <span className="text-slate-500">
                      {formatLocalDateTime(ev.timestamp)}
                    </span>
                  </div>
                  <p className="text-slate-600">{ev.description}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

