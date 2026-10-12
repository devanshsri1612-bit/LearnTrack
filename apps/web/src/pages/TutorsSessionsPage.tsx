import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AvailabilitySlot, TutorProfile } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { ApiClientError } from "../api/client";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDateTime, getUserLocalTimezone } from "../utils/date";

export const TutorsSessionsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialSubject = searchParams.get("subject") ?? "";
  const initialStudentId = searchParams.get("studentId") ?? "S-104";
  const initialCaseId = searchParams.get("caseId") ?? "C-104";

  const [subjectFilter, setSubjectFilter] = useState(initialSubject);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [selectedCaseId, setSelectedCaseId] = useState(initialCaseId);
  const [academicGoalNote, setAcademicGoalNote] = useState(
    "Focus on recursion and tree traversal lab problems."
  );

  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [alternativeSlots, setAlternativeSlots] = useState<AvailabilitySlot[]>(
    []
  );
  const [conflictTutor, setConflictTutor] = useState<TutorProfile | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  const localTimezone = getUserLocalTimezone();

  const tutorsQuery = useQuery({
    queryKey: ["tutors", subjectFilter],
    queryFn: () => api.tutors.list(subjectFilter || undefined),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions.list(),
  });

  const bookSessionMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.sessions.book>[0]) =>
      api.sessions.book(payload),
    onSuccess: (created) => {
      setConflictMessage(null);
      setAlternativeSlots([]);
      setConflictTutor(null);
      setBookingError(null);
      setBookingSuccess(
        `Session ${created.id} booked with ${created.tutorName} for ${created.studentName} (${formatLocalDateTime(created.startIso)}).`
      );
      void queryClient.invalidateQueries({ queryKey: ["tutors"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err, variables) => {
      setBookingSuccess(null);
      if (err instanceof ApiClientError && err.status === 409) {
        setBookingError(null);
        setConflictMessage(err.message);
        const details = err.details as
          | { alternativeSlots?: AvailabilitySlot[] }
          | undefined;
        setAlternativeSlots(details?.alternativeSlots ?? []);
        const foundTutor = (tutorsQuery.data?.items ?? []).find(
          (t) => t.id === variables.tutorId
        );
        setConflictTutor(foundTutor ?? null);
      } else {
        setBookingError(
          err instanceof Error ? err.message : "Failed to book session"
        );
      }
    },
  });

  const patchSessionMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "ACCEPTED" | "DECLINED" | "COMPLETED" | "CANCELLED";
    }) => api.sessions.patch(id, { status }),
    onSuccess: (updated) => {
      setBookingError(null);
      setBookingSuccess(`Session ${updated.id} status updated to ${updated.status}.`);
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["tutors"] });
    },
    onError: (err) => {
      setBookingSuccess(null);
      setBookingError(
        err instanceof Error ? err.message : "Failed to update session status"
      );
    },
  });

  const handleBookSlot = (tutor: TutorProfile, slot: AvailabilitySlot) => {
    setBookingError(null);
    setBookingSuccess(null);
    if (!selectedStudentId.trim()) {
      setBookingError("Please enter a Student ID before booking a slot.");
      return;
    }
    bookSessionMutation.mutate({
      tutorId: tutor.id,
      studentId: selectedStudentId.trim(),
      subject:
        subjectFilter.trim() ||
        tutor.verifiedSubjects[0] ||
        "Data Structures & Algorithms",
      slotId: slot.id,
      startIso: slot.startIso,
      endIso: slot.endIso,
      caseId: selectedCaseId.trim() || undefined,
      academicGoalNote: academicGoalNote.trim() || undefined,
    });
  };

  // Client guard: strictly display only verified tutors
  const verifiedTutors = (tutorsQuery.data?.items ?? []).filter(
    (t) => t.isVerified
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Verified Peer Tutors & Sessions
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Only verified peer tutors for the selected subject appear. Displaying slot times in your local timezone:{" "}
            <strong>{localTimezone}</strong>
          </p>
        </div>
        {subjectFilter && (
          <button
            type="button"
            onClick={() => setSubjectFilter("")}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear Subject Filter
          </button>
        )}
      </div>

      {bookingError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-800"
        >
          {bookingError}
        </div>
      )}

      {bookingSuccess && (
        <div
          role="status"
          className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
        >
          {bookingSuccess}
        </div>
      )}

      {/* 409 Booking Conflict Banner with Alternative Slots */}
      {conflictMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-3"
        >
          <div className="font-bold text-sm">
            Booking conflict (409): {conflictMessage}
          </div>
          {alternativeSlots.length > 0 && conflictTutor && (
            <div className="space-y-2">
              <div className="text-xs font-semibold">
                Available Alternative Slots for {conflictTutor.name}:
              </div>
              <div className="flex flex-wrap gap-2">
                {alternativeSlots.map((alt) => (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => handleBookSlot(conflictTutor, alt)}
                    className="px-3 py-1.5 rounded bg-amber-900 text-white text-xs font-semibold hover:bg-amber-950"
                  >
                    Book Alternative: {formatLocalDateTime(alt.startIso)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter & Booking Context */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label
            htmlFor="tutor-subject-filter"
            className="block text-xs font-semibold text-slate-700"
          >
            Subject Filter
          </label>
          <input
            id="tutor-subject-filter"
            type="text"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            placeholder="e.g. Data Structures"
            className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label
            htmlFor="booking-student-id"
            className="block text-xs font-semibold text-slate-700"
          >
            Student ID
          </label>
          <input
            id="booking-student-id"
            type="text"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label
            htmlFor="booking-case-id"
            className="block text-xs font-semibold text-slate-700"
          >
            Linked Case ID
          </label>
          <input
            id="booking-case-id"
            type="text"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label
            htmlFor="booking-goal-note"
            className="block text-xs font-semibold text-slate-700"
          >
            Academic Topic Focus
          </label>
          <input
            id="booking-goal-note"
            type="text"
            value={academicGoalNote}
            onChange={(e) => setAcademicGoalNote(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Verified Tutors Grid */}
      {tutorsQuery.isLoading ? (
        <LoadingSkeleton lines={4} label="Loading verified tutors..." />
      ) : tutorsQuery.error ? (
        <PanelErrorState
          error={tutorsQuery.error}
          onRetry={() => void tutorsQuery.refetch()}
          panelName="Tutors directory"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {verifiedTutors.map((tutor) => (
            <div
              key={tutor.id}
              className="bg-white p-5 rounded-xl border border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {tutor.name} ({tutor.id})
                  </h2>
                  <div className="text-xs text-slate-500">
                    Cohort: {tutor.cohort} • Tutor TZ: {tutor.timezone}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-semibold">
                  Verified Tutor
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {tutor.verifiedSubjects.map((sub) => (
                  <span
                    key={sub}
                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-xs font-medium"
                  >
                    {sub}
                  </span>
                ))}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-700">
                  Slots (Displayed in {localTimezone}):
                </div>
                <div className="space-y-1.5">
                  {tutor.slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 text-xs"
                    >
                      <span>
                        {formatLocalDateTime(slot.startIso)} —{" "}
                        {formatLocalDateTime(slot.endIso)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleBookSlot(tutor, slot)}
                        disabled={bookSessionMutation.isPending}
                        className={`px-2.5 py-1 rounded font-semibold ${
                          slot.isBooked
                            ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                      >
                        {slot.isBooked
                          ? "Booked (Test 409 Conflict)"
                          : "Book Slot"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active & Requested Sessions Table */}
      <section
        aria-label="Booked Tutoring Sessions"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            Tutoring Sessions
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table
            aria-label="Tutoring sessions list"
            className="w-full text-left border-collapse text-xs"
          >
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                <th className="py-3 px-4">Session</th>
                <th className="py-3 px-4">Tutor & Student</th>
                <th className="py-3 px-4">Scheduled ({localTimezone})</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(sessionsQuery.data?.items ?? []).map((ses) => (
                <tr key={ses.id}>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">
                      {ses.id} • {ses.subject}
                    </div>
                    {ses.academicGoalNote && (
                      <div className="text-slate-600">
                        {ses.academicGoalNote}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div>Tutor: {ses.tutorName}</div>
                    <div>
                      Student: {ses.studentName} ({ses.studentId})
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {formatLocalDateTime(ses.startIso)}
                  </td>
                  <td className="py-3 px-4 font-semibold">{ses.status}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ses.status === "REQUESTED" && (
                        <button
                          type="button"
                          disabled={patchSessionMutation.isPending}
                          onClick={() =>
                            patchSessionMutation.mutate({
                              id: ses.id,
                              status: "ACCEPTED",
                            })
                          }
                          className="px-2 py-1 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                      {(ses.status === "REQUESTED" ||
                        ses.status === "ACCEPTED") && (
                        <>
                          <button
                            type="button"
                            disabled={patchSessionMutation.isPending}
                            onClick={() =>
                              patchSessionMutation.mutate({
                                id: ses.id,
                                status: "COMPLETED",
                              })
                            }
                            className="px-2 py-1 rounded border border-slate-300 font-semibold hover:bg-slate-50 disabled:opacity-50"
                          >
                            Mark Complete
                          </button>
                          <button
                            type="button"
                            disabled={patchSessionMutation.isPending}
                            onClick={() =>
                              patchSessionMutation.mutate({
                                id: ses.id,
                                status: "CANCELLED",
                              })
                            }
                            className="px-2 py-1 rounded border border-rose-300 text-rose-700 font-semibold hover:bg-rose-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {ses.status !== "REQUESTED" &&
                        ses.status !== "ACCEPTED" && (
                          <span className="text-slate-500">
                            {ses.status === "COMPLETED"
                              ? "Session completed"
                              : `Session ${ses.status.toLowerCase()}`}
                          </span>
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

