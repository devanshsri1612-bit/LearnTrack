import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreateMeetingRequestSchema } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import {
  SyncStatusBadge,
  MeetingNotificationBadge,
} from "../components/StatusBadges";
import { LoadingSkeleton, PanelErrorState } from "../components/StateViews";
import { formatLocalDateTime, getUserLocalTimezone } from "../utils/date";

export const MeetingsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initialStudentId = searchParams.get("studentId") ?? "S-104";
  const initialCaseId = searchParams.get("caseId") ?? "C-104";

  const [participantId, setParticipantId] = useState(initialStudentId);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [startIso, setStartIso] = useState("2026-10-16T10:00");
  const [endIso, setEndIso] = useState("2026-10-16T10:30");
  const [timezone] = useState(getUserLocalTimezone());
  const [formError, setFormError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      setActionNotice("Google Calendar and Gmail account successfully authorized and connected!");
      void queryClient.invalidateQueries({ queryKey: ["googleStatus"] });
    } else if (googleParam === "error") {
      setFormError(searchParams.get("message") || "Google authorization failed.");
    }
  }, [searchParams, queryClient]);

  const googleStatusQuery = useQuery({
    queryKey: ["googleStatus"],
    queryFn: () => api.meetings.getGoogleStatus(),
  });

  const meetingsQuery = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api.meetings.list(),
  });

  const connectGoogleMutation = useMutation({
    mutationFn: () => api.meetings.connectGoogle(),
    onSuccess: (updated) => {
      setFormError(null);
      if (updated.authUrl && updated.mode === "LIVE") {
        window.location.href = updated.authUrl;
        return;
      }
      setActionNotice(
        `Google Calendar connected (Mode: ${updated.mode}).`
      );
      queryClient.setQueryData(["googleStatus"], updated);
    },
    onError: (err) => {
      setActionNotice(null);
      setFormError(
        err instanceof Error ? err.message : "Failed to connect Google Calendar"
      );
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: () => api.meetings.disconnectGoogle(),
    onSuccess: (updated) => {
      setFormError(null);
      setActionNotice("Google Calendar disconnected.");
      queryClient.setQueryData(["googleStatus"], updated);
    },
    onError: (err) => {
      setActionNotice(null);
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to disconnect Google Calendar"
      );
    },
  });

  const createMeetingMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.meetings.create>[0]) =>
      api.meetings.create(payload),
    onSuccess: (created) => {
      setFormError(null);
      const emailStatus = created.notificationStatus
        ? ` | Gmail: ${created.notificationStatus}`
        : "";
      setActionNotice(
        `Meeting ${created.id} scheduled (${formatLocalDateTime(
          created.startIso
        )}) — Calendar: ${created.syncStatus} (${created.integrationMode})${emailStatus}.`
      );
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (err) => {
      setActionNotice(null);
      setFormError(
        err instanceof Error ? err.message : "Failed to schedule meeting"
      );
    },
  });

  const patchMeetingMutation = useMutation({
    mutationFn: (id: string) => {
      setResyncingId(id);
      return api.meetings.patch(id, { resync: true });
    },
    onSuccess: (updated) => {
      setResyncingId(null);
      setFormError(null);
      setActionNotice(
        `Calendar sync completed for ${updated.id} (${updated.title}) — Status: ${updated.syncStatus} (${updated.integrationMode}).`
      );
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (err) => {
      setResyncingId(null);
      setActionNotice(null);
      setFormError(
        err instanceof Error ? err.message : "Failed to re-sync meeting"
      );
    },
  });

  const resendEmailMutation = useMutation({
    mutationFn: (id: string) => {
      setResendingId(id);
      return api.meetings.patch(id, { resendNotification: true });
    },
    onSuccess: (updated) => {
      setResendingId(null);
      setFormError(null);
      setActionNotice(
        `Gmail notification update for ${updated.id}: ${
          updated.notificationStatus || "SENT"
        }.`
      );
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
    onError: (err) => {
      setResendingId(null);
      setActionNotice(null);
      setFormError(
        err instanceof Error ? err.message : "Failed to resend notification"
      );
    },
  });

  const handleCreateMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setActionNotice(null);

    if (!participantId.trim()) {
      setFormError("Please enter a Student ID.");
      return;
    }

    const startDate = startIso ? new Date(startIso) : null;
    const endDate = endIso ? new Date(endIso) : null;
    if (
      !startDate ||
      !endDate ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setFormError("Please enter valid start and end date/times.");
      return;
    }
    if (endDate <= startDate) {
      setFormError("Meeting end time must be after start time.");
      return;
    }

    const parsed = CreateMeetingRequestSchema.safeParse({
      participantId: participantId.trim(),
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      timezone,
      caseId: caseId.trim() || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    createMeetingMutation.mutate(parsed.data);
  };

  const gStatus = googleStatusQuery.data;

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Meetings & Calendar Integration
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Schedule advising check-ins. Calendar event titles are automatically privacy-safe and never include case details. Local Timezone:{" "}
            <strong>{timezone}</strong>
          </p>
        </div>

        {/* Google Calendar & Gmail Integration Status */}
        {gStatus && (
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div>
              <div className="font-bold text-slate-900">
                Google Calendar:{" "}
                {gStatus.connected ? "Connected" : "Disconnected"} (Mode:{" "}
                {gStatus.mode})
              </div>
              {gStatus.accountEmail && (
                <div className="text-[11px] text-slate-600 font-mono">
                  Account: {gStatus.accountEmail}
                </div>
              )}
              {gStatus.mode === "MOCK" && (
                <div className="text-amber-900 font-semibold">
                  Mock, not actually sent
                </div>
              )}
            </div>

            {gStatus.canManage && (
              <div>
                {gStatus.connected ? (
                  <button
                    type="button"
                    onClick={() => disconnectGoogleMutation.mutate()}
                    disabled={disconnectGoogleMutation.isPending}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-50"
                  >
                    {disconnectGoogleMutation.isPending
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </button>
                ) : gStatus.authUrl && gStatus.mode === "LIVE" ? (
                  <a
                    href={gStatus.authUrl}
                    className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 inline-block"
                  >
                    Authorize Google
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => connectGoogleMutation.mutate()}
                    disabled={connectGoogleMutation.isPending}
                    className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {connectGoogleMutation.isPending
                      ? "Connecting..."
                      : "Connect Google Calendar"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {actionNotice && (
        <div
          role="status"
          className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-semibold"
        >
          {actionNotice}
        </div>
      )}

      {/* Schedule New Meeting Form */}
      <section
        aria-label="Schedule Meeting Form"
        className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">
          Schedule Advising Meeting
        </h2>

        {formError && (
          <div
            role="alert"
            className="p-2.5 rounded bg-rose-50 border border-rose-300 text-xs text-rose-800"
          >
            {formError}
          </div>
        )}

        <form
          onSubmit={handleCreateMeeting}
          className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label
              htmlFor="mtg-participant"
              className="block text-xs font-semibold text-slate-700"
            >
              Student ID
            </label>
            <input
              id="mtg-participant"
              type="text"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="mtg-case"
              className="block text-xs font-semibold text-slate-700"
            >
              Internal Case Ref
            </label>
            <input
              id="mtg-case"
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="mtg-start"
              className="block text-xs font-semibold text-slate-700"
            >
              Start ({timezone})
            </label>
            <input
              id="mtg-start"
              type="datetime-local"
              value={startIso}
              onChange={(e) => setStartIso(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label
              htmlFor="mtg-end"
              className="block text-xs font-semibold text-slate-700"
            >
              End ({timezone})
            </label>
            <input
              id="mtg-end"
              type="datetime-local"
              value={endIso}
              onChange={(e) => setEndIso(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={createMeetingMutation.isPending}
            className="px-3.5 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {createMeetingMutation.isPending
              ? "Scheduling..."
              : "Schedule Meeting"}
          </button>
        </form>
      </section>

      {/* Meetings List */}
      <section
        aria-label="Scheduled Meetings List"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">
            Scheduled Meetings
          </h2>
        </div>

        {meetingsQuery.isLoading ? (
          <LoadingSkeleton lines={4} />
        ) : meetingsQuery.error ? (
          <PanelErrorState
            error={meetingsQuery.error}
            onRetry={() => void meetingsQuery.refetch()}
            panelName="Meetings"
          />
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label="Scheduled meetings table"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <th className="py-3 px-4">Calendar Event Title</th>
                  <th className="py-3 px-4">Participants</th>
                  <th className="py-3 px-4">Time ({timezone})</th>
                  <th className="py-3 px-4">Calendar Sync</th>
                  <th className="py-3 px-4">Gmail Notification</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(meetingsQuery.data?.items ?? []).map((mtg) => (
                  <tr key={mtg.id}>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">
                        {mtg.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Contains no sensitive case details
                      </div>
                      {mtg.googleEventId && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          ID: {mtg.googleEventId.slice(0, 16)}…
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>Organiser: {mtg.organiserName}</div>
                      <div>
                        Student: {mtg.participantNames.join(", ")} (
                        {mtg.participantIds.join(", ")})
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{formatLocalDateTime(mtg.startIso)}</div>
                      <div className="text-slate-500">TZ: {mtg.timezone}</div>
                    </td>
                    <td className="py-3 px-4">
                      <SyncStatusBadge
                        syncStatus={mtg.syncStatus}
                        integrationMode={mtg.integrationMode}
                        googleEventId={mtg.googleEventId ?? undefined}
                        meetLink={mtg.meetLink ?? undefined}
                        calendarError={mtg.calendarError ?? undefined}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <MeetingNotificationBadge
                        status={mtg.notificationStatus}
                        error={mtg.notificationError ?? undefined}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={
                            patchMeetingMutation.isPending &&
                            resyncingId === mtg.id
                          }
                          onClick={() => patchMeetingMutation.mutate(mtg.id)}
                          className="px-2 py-1 rounded border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-50 text-[11px]"
                        >
                          {patchMeetingMutation.isPending &&
                          resyncingId === mtg.id
                            ? "Syncing..."
                            : "Re-sync"}
                        </button>
                        {mtg.notificationStatus === "FAILED" && (
                          <button
                            type="button"
                            disabled={
                              resendEmailMutation.isPending &&
                              resendingId === mtg.id
                            }
                            onClick={() => resendEmailMutation.mutate(mtg.id)}
                            className="px-2 py-1 rounded bg-amber-50 border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100 disabled:opacity-50 text-[11px]"
                          >
                            {resendEmailMutation.isPending &&
                            resendingId === mtg.id
                              ? "Sending..."
                              : "Resend Email"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
