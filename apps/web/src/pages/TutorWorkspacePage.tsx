import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SessionFeedbackRequestSchema } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDateTime, getUserLocalTimezone } from "../utils/date";

export const TutorWorkspacePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tutorId = user?.tutorId ?? "T-201";

  const [timezone, setTimezone] = useState(getUserLocalTimezone());
  const [newStartIso, setNewStartIso] = useState("2026-10-17T10:00");
  const [newEndIso, setNewEndIso] = useState("2026-10-17T11:00");
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  );
  const [availabilitySuccess, setAvailabilitySuccess] = useState<string | null>(
    null
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Feedback form state
  const [activeFeedbackSessionId, setActiveFeedbackSessionId] = useState<
    string | null
  >(null);
  const [topicsCovered, setTopicsCovered] = useState("");
  const [studentEngagement, setStudentEngagement] = useState<
    "ENGAGED" | "PARTIAL" | "NEEDS_FOLLOW_UP"
  >("ENGAGED");
  const [followUpRecommended, setFollowUpRecommended] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const tutorQuery = useQuery({
    queryKey: ["tutor", tutorId],
    queryFn: () => api.tutors.get(tutorId),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions.list(),
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.tutors.updateAvailability>[1]) =>
      api.tutors.updateAvailability(tutorId, payload),
    onSuccess: (updated) => {
      setAvailabilityError(null);
      setAvailabilitySuccess(
        `Availability saved (${updated.slots.length} slots in ${updated.timezone}).`
      );
      queryClient.setQueryData(["tutor", tutorId], updated);
      void queryClient.invalidateQueries({ queryKey: ["tutors"] });
    },
    onError: (err) => {
      setAvailabilitySuccess(null);
      setAvailabilityError(
        err instanceof Error ? err.message : "Failed to save availability"
      );
    },
  });

  const patchSessionMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACCEPTED" | "DECLINED" | "COMPLETED";
    }) => api.sessions.patch(id, { status }),
    onSuccess: (updated) => {
      setSessionError(null);
      setSessionNotice(
        `Session ${updated.id} (${updated.studentName}) marked as ${updated.status}.`
      );
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["tutor", tutorId] });
      void queryClient.invalidateQueries({ queryKey: ["tutors"] });
    },
    onError: (err) => {
      setSessionNotice(null);
      setSessionError(
        err instanceof Error ? err.message : "Failed to update session status"
      );
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof api.sessions.submitFeedback>[1];
    }) => api.sessions.submitFeedback(id, payload),
    onSuccess: (updated) => {
      setActiveFeedbackSessionId(null);
      setTopicsCovered("");
      setFeedbackError(null);
      setSessionError(null);
      setSessionNotice(
        `Academic session feedback recorded for ${updated.studentName} (${updated.id}).`
      );
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) => {
      setFeedbackError(
        err instanceof Error ? err.message : "Failed to submit feedback"
      );
    },
  });

  if (tutorQuery.isLoading) {
    return <LoadingSkeleton lines={5} label="Loading tutor workspace..." />;
  }

  if (tutorQuery.error || !tutorQuery.data) {
    return (
      <PanelErrorState
        error={tutorQuery.error}
        onRetry={() => void tutorQuery.refetch()}
        panelName="Tutor Workspace"
      />
    );
  }

  const tutor = tutorQuery.data;
  const mySessions = (sessionsQuery.data?.items ?? []).filter(
    (s) => s.tutorId === tutor.id
  );

  const handleAddAvailabilitySlot = (e: React.FormEvent) => {
    e.preventDefault();
    setAvailabilityError(null);
    setAvailabilitySuccess(null);

    if (!timezone.trim() || timezone.trim().length < 2) {
      setAvailabilityError("Please enter a valid timezone (e.g. Asia/Kolkata).");
      return;
    }

    const startDate = newStartIso ? new Date(newStartIso) : null;
    const endDate = newEndIso ? new Date(newEndIso) : null;
    if (
      !startDate ||
      !endDate ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setAvailabilityError(
        "Please provide valid slot start and end date/times."
      );
      return;
    }
    if (endDate <= startDate) {
      setAvailabilityError("Slot end time must be after slot start time.");
      return;
    }

    const nextSlots = [
      ...tutor.slots.map((s) => ({
        id: s.id,
        startIso: s.startIso,
        endIso: s.endIso,
      })),
      {
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
      },
    ];
    updateAvailabilityMutation.mutate({
      timezone: timezone.trim(),
      slots: nextSlots,
    });
  };

  const handleRemoveSlot = (slotId: string) => {
    setAvailabilityError(null);
    setAvailabilitySuccess(null);
    const remainingSlots = tutor.slots
      .filter((s) => s.id !== slotId)
      .map((s) => ({
        id: s.id,
        startIso: s.startIso,
        endIso: s.endIso,
      }));
    updateAvailabilityMutation.mutate({
      timezone: timezone.trim() || tutor.timezone,
      slots: remainingSlots,
    });
  };

  const handleFeedbackSubmit = (e: React.FormEvent, sessionId: string) => {
    e.preventDefault();
    setFeedbackError(null);
    const parsed = SessionFeedbackRequestSchema.safeParse({
      topicsCovered,
      studentEngagement,
      followUpRecommended,
    });
    if (!parsed.success) {
      setFeedbackError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    submitFeedbackMutation.mutate({ id: sessionId, payload: parsed.data });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Peer Tutor Workspace — {tutor.name}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Manage availability with explicit timezone, respond to booking requests, and record academic session feedback. Financial, counselling, and check-in records are strictly excluded from tutor views.
          </p>
        </div>
        <span className="px-3 py-1 rounded bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-800">
          Timezone: {tutor.timezone}
        </span>
      </div>

      {/* Availability Editor */}
      <section
        aria-label="Tutor Availability Editor"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">
          Availability Editor (PUT /api/tutors/{tutor.id}/availability)
        </h2>

        {availabilityError && (
          <div
            role="alert"
            className="p-3 rounded-md bg-rose-50 border border-rose-300 text-xs text-rose-800"
          >
            {availabilityError}
          </div>
        )}

        {availabilitySuccess && (
          <div
            role="status"
            className="p-3 rounded-md bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
          >
            {availabilitySuccess}
          </div>
        )}

        <form
          onSubmit={handleAddAvailabilitySlot}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label
              htmlFor="tutor-tz"
              className="block text-xs font-semibold text-slate-700"
            >
              Timezone
            </label>
            <input
              id="tutor-tz"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="slot-start"
              className="block text-xs font-semibold text-slate-700"
            >
              Slot Start (Local)
            </label>
            <input
              id="slot-start"
              type="datetime-local"
              value={newStartIso}
              onChange={(e) => setNewStartIso(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="slot-end"
              className="block text-xs font-semibold text-slate-700"
            >
              Slot End (Local)
            </label>
            <input
              id="slot-end"
              type="datetime-local"
              value={newEndIso}
              onChange={(e) => setNewEndIso(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={updateAvailabilityMutation.isPending}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {updateAvailabilityMutation.isPending
              ? "Saving..."
              : "Add & Save Availability"}
          </button>
        </form>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-700">
            Published Slots ({tutor.slots.length}):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {tutor.slots.map((slot) => (
              <div
                key={slot.id}
                className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
              >
                <span>{formatLocalDateTime(slot.startIso)}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${
                      slot.isBooked ? "text-amber-800" : "text-emerald-700"
                    }`}
                  >
                    {slot.isBooked ? "Booked" : "Open"}
                  </span>
                  {!slot.isBooked && (
                    <button
                      type="button"
                      disabled={updateAvailabilityMutation.isPending}
                      onClick={() => handleRemoveSlot(slot.id)}
                      className="text-[11px] text-rose-700 hover:underline font-semibold"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Requests & Session Completion / Feedback */}
      <section
        aria-label="Tutor Booking Requests and Feedback"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">
          Booking Requests & Session Feedback
        </h2>

        {sessionError && (
          <div
            role="alert"
            className="p-3 rounded-md bg-rose-50 border border-rose-300 text-xs text-rose-800"
          >
            {sessionError}
          </div>
        )}

        {sessionNotice && (
          <div
            role="status"
            className="p-3 rounded-md bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
          >
            {sessionNotice}
          </div>
        )}

        <div className="space-y-3">
          {mySessions.map((ses) => (
            <div
              key={ses.id}
              className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900 text-sm">
                    {ses.subject} — Student: {ses.studentName} ({ses.studentId})
                  </span>
                  <div className="text-slate-600">
                    Scheduled: {formatLocalDateTime(ses.startIso)} (
                    {tutor.timezone})
                  </div>
                  {ses.academicGoalNote && (
                    <div className="text-slate-700 mt-1">
                      Academic focus: {ses.academicGoalNote}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-white border border-slate-300 font-semibold">
                    {ses.status}
                  </span>
                  {ses.status === "REQUESTED" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          patchSessionMutation.mutate({
                            id: ses.id,
                            status: "ACCEPTED",
                          })
                        }
                        className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          patchSessionMutation.mutate({
                            id: ses.id,
                            status: "DECLINED",
                          })
                        }
                        className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold"
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {ses.status !== "DECLINED" && !ses.feedbackSubmitted && (
                    <button
                      type="button"
                      onClick={() => setActiveFeedbackSessionId(ses.id)}
                      className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold"
                    >
                      Complete & Log Feedback
                    </button>
                  )}
                </div>
              </div>

              {activeFeedbackSessionId === ses.id && (
                <form
                  onSubmit={(e) => handleFeedbackSubmit(e, ses.id)}
                  className="p-3 rounded bg-white border border-slate-300 space-y-3"
                >
                  <div className="font-bold text-slate-900">
                    Submit Session Feedback (POST /api/sessions/{ses.id}/feedback)
                  </div>
                  {feedbackError && (
                    <div
                      role="alert"
                      className="p-2 rounded bg-rose-50 text-rose-800"
                    >
                      {feedbackError}
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor={`topics-${ses.id}`}
                      className="block font-semibold text-slate-700"
                    >
                      Academic Topics Covered
                    </label>
                    <input
                      id={`topics-${ses.id}`}
                      type="text"
                      value={topicsCovered}
                      onChange={(e) => setTopicsCovered(e.target.value)}
                      placeholder="e.g. Recursion base cases and binary tree traversal"
                      className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label
                        htmlFor={`engagement-${ses.id}`}
                        className="block font-semibold text-slate-700"
                      >
                        Student Engagement
                      </label>
                      <select
                        id={`engagement-${ses.id}`}
                        value={studentEngagement}
                        onChange={(e) =>
                          setStudentEngagement(
                            e.target.value as typeof studentEngagement
                          )
                        }
                        className="mt-1 rounded border border-slate-300 px-2.5 py-1 bg-white"
                      >
                        <option value="ENGAGED">ENGAGED</option>
                        <option value="PARTIAL">PARTIAL</option>
                        <option value="NEEDS_FOLLOW_UP">NEEDS_FOLLOW_UP</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 mt-4">
                      <input
                        type="checkbox"
                        checked={followUpRecommended}
                        onChange={(e) =>
                          setFollowUpRecommended(e.target.checked)
                        }
                      />
                      <span>Recommend follow-up tutoring session</span>
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveFeedbackSessionId(null)}
                      className="px-3 py-1 rounded border border-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitFeedbackMutation.isPending}
                      className="px-3 py-1 rounded bg-emerald-700 text-white font-semibold"
                    >
                      Submit Feedback
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

