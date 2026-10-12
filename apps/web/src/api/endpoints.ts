import { z } from "zod";
import {
  UserSchema,
  LoginRequest,
  PriorityQueueResponseSchema,
  StaffCapacitySchema,
  UpdateCapacityRequest,
  createPaginatedSchema,
  StudentSummarySchema,
  Student360Schema,
  StudentHistoryResponseSchema,
  RiskAssessmentSchema,
  RecommendationsResponseSchema,
  CaseDetailSchema,
  CreateCaseRequest,
  PatchCaseRequest,
  CaseTimelineResponseSchema,
  EvidenceRecordSchema,
  CreateEvidenceRequest,
  OutcomeRecordSchema,
  CreateOutcomeRequest,
  TutorProfileSchema,
  UpdateAvailabilityRequest,
  TutoringSessionSchema,
  BookSessionRequest,
  PatchSessionRequest,
  SessionFeedbackRequest,
  MeetingRecordSchema,
  CreateMeetingRequest,
  PatchMeetingRequest,
  GoogleIntegrationStatusSchema,
  NotificationsResponseSchema,
  CohortAnalyticsSchema,
  OutcomesAnalyticsSchema,
  ImpactAnalyticsSchema,
  FairnessAnalyticsSchema,
  ClustersAnalyticsSchema,
  StudentSupportCaseViewSchema,
  CheckInRecordSchema,
  CreateCheckInRequest,
  ConsentResponseSchema,
  PatchConsentRequest,
} from "@learntrack/contracts";
import { apiRequest, clearCsrfTokenCache, generateIdempotencyKey } from "./client";

export const api = {
  auth: {
    login: async (payload: LoginRequest) => {
      clearCsrfTokenCache();
      return apiRequest("/api/auth/login", {
        method: "POST",
        body: payload,
        schema: UserSchema,
        skipUnauthorizedRedirect: true,
      });
    },
    logout: async () => {
      clearCsrfTokenCache();
      return apiRequest("/api/auth/logout", {
        method: "POST",
        schema: z.object({ ok: z.boolean().optional() }),
      });
    },
    me: () =>
      apiRequest("/api/auth/me", {
        method: "GET",
        schema: UserSchema,
        skipUnauthorizedRedirect: true,
      }),
  },

  queue: {
    get: () =>
      apiRequest("/api/queue", {
        method: "GET",
        schema: PriorityQueueResponseSchema,
      }),
    updateStaffCapacity: (staffId: string, payload: UpdateCapacityRequest) =>
      apiRequest(`/api/staff/${encodeURIComponent(staffId)}/capacity`, {
        method: "PUT",
        body: payload,
        schema: StaffCapacitySchema,
      }),
  },

  students: {
    list: (params: { search?: string; cohort?: string; page?: number; pageSize?: number }) => {
      const qs = new URLSearchParams();
      if (params.search) qs.set("search", params.search);
      if (params.cohort) qs.set("cohort", params.cohort);
      qs.set("page", String(params.page ?? 1));
      qs.set("pageSize", String(params.pageSize ?? 10));
      return apiRequest(`/api/students?${qs.toString()}`, {
        method: "GET",
        schema: createPaginatedSchema(StudentSummarySchema),
      });
    },
    get360: (id: string) =>
      apiRequest(`/api/students/${encodeURIComponent(id)}`, {
        method: "GET",
        schema: Student360Schema,
      }),
    getHistory: (id: string) =>
      apiRequest(`/api/students/${encodeURIComponent(id)}/history`, {
        method: "GET",
        schema: StudentHistoryResponseSchema,
      }),
    getLatestAssessment: (id: string) =>
      apiRequest(`/api/students/${encodeURIComponent(id)}/assessments/latest`, {
        method: "GET",
        schema: RiskAssessmentSchema,
      }),
    runAssessment: (id: string) =>
      apiRequest(`/api/students/${encodeURIComponent(id)}/assessments`, {
        method: "POST",
        body: {},
        idempotencyKey: generateIdempotencyKey(),
        schema: RiskAssessmentSchema,
      }),
  },

  cases: {
    list: (params?: { page?: number; pageSize?: number; status?: string }) => {
      const qs = new URLSearchParams();
      qs.set("page", String(params?.page ?? 1));
      qs.set("pageSize", String(params?.pageSize ?? 10));
      if (params?.status) qs.set("status", params.status);
      return apiRequest(`/api/cases?${qs.toString()}`, {
        method: "GET",
        schema: createPaginatedSchema(CaseDetailSchema),
      });
    },
    get: (id: string) =>
      apiRequest(`/api/cases/${encodeURIComponent(id)}`, {
        method: "GET",
        schema: CaseDetailSchema,
      }),
    create: (payload: CreateCaseRequest) =>
      apiRequest("/api/cases", {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: CaseDetailSchema,
      }),
    patch: (id: string, payload: PatchCaseRequest) =>
      apiRequest(`/api/cases/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: payload,
        schema: CaseDetailSchema,
      }),
    getRecommendations: (id: string) =>
      apiRequest(`/api/cases/${encodeURIComponent(id)}/recommendations`, {
        method: "GET",
        schema: RecommendationsResponseSchema,
      }),
    getTimeline: (id: string) =>
      apiRequest(`/api/cases/${encodeURIComponent(id)}/timeline`, {
        method: "GET",
        schema: CaseTimelineResponseSchema,
      }),
    addEvidence: (id: string, payload: CreateEvidenceRequest) =>
      apiRequest(`/api/cases/${encodeURIComponent(id)}/evidence`, {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: EvidenceRecordSchema,
      }),
    recordOutcome: (id: string, payload: CreateOutcomeRequest) =>
      apiRequest(`/api/cases/${encodeURIComponent(id)}/outcomes`, {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: OutcomeRecordSchema,
      }),
  },

  tutors: {
    list: (subject?: string) => {
      const qs = new URLSearchParams();
      if (subject) qs.set("subject", subject);
      return apiRequest(`/api/tutors${qs.toString() ? `?${qs.toString()}` : ""}`, {
        method: "GET",
        schema: createPaginatedSchema(TutorProfileSchema),
      });
    },
    get: (id: string) =>
      apiRequest(`/api/tutors/${encodeURIComponent(id)}`, {
        method: "GET",
        schema: TutorProfileSchema,
      }),
    updateAvailability: (id: string, payload: UpdateAvailabilityRequest) =>
      apiRequest(`/api/tutors/${encodeURIComponent(id)}/availability`, {
        method: "PUT",
        body: payload,
        schema: TutorProfileSchema,
      }),
  },

  sessions: {
    list: () =>
      apiRequest("/api/sessions", {
        method: "GET",
        schema: createPaginatedSchema(TutoringSessionSchema),
      }),
    book: (payload: BookSessionRequest) =>
      apiRequest("/api/sessions", {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: TutoringSessionSchema,
      }),
    patch: (id: string, payload: PatchSessionRequest) =>
      apiRequest(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: payload,
        schema: TutoringSessionSchema,
      }),
    submitFeedback: (id: string, payload: SessionFeedbackRequest) =>
      apiRequest(`/api/sessions/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: TutoringSessionSchema,
      }),
  },

  meetings: {
    list: () =>
      apiRequest("/api/meetings", {
        method: "GET",
        schema: createPaginatedSchema(MeetingRecordSchema),
      }),
    create: (payload: CreateMeetingRequest) =>
      apiRequest("/api/meetings", {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: MeetingRecordSchema,
      }),
    patch: (id: string, payload: PatchMeetingRequest) =>
      apiRequest(`/api/meetings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: payload,
        schema: MeetingRecordSchema,
      }),
    getGoogleStatus: () =>
      apiRequest("/api/integrations/google/status", {
        method: "GET",
        schema: GoogleIntegrationStatusSchema,
      }),
    connectGoogle: () =>
      apiRequest("/api/integrations/google/connect", {
        method: "POST",
        body: {},
        schema: GoogleIntegrationStatusSchema,
      }),
    disconnectGoogle: () =>
      apiRequest("/api/integrations/google/disconnect", {
        method: "POST",
        body: {},
        schema: GoogleIntegrationStatusSchema,
      }),
  },

  notifications: {
    list: () =>
      apiRequest("/api/notifications", {
        method: "GET",
        schema: NotificationsResponseSchema,
      }),
  },

  analytics: {
    getCohorts: () =>
      apiRequest("/api/analytics/cohorts", {
        method: "GET",
        schema: CohortAnalyticsSchema,
      }),
    getOutcomes: () =>
      apiRequest("/api/analytics/outcomes", {
        method: "GET",
        schema: OutcomesAnalyticsSchema,
      }),
    getImpact: () =>
      apiRequest("/api/analytics/impact", {
        method: "GET",
        schema: ImpactAnalyticsSchema,
      }),
    getFairness: () =>
      apiRequest("/api/analytics/fairness", {
        method: "GET",
        schema: FairnessAnalyticsSchema,
      }),
    getClusters: () =>
      apiRequest("/api/analytics/clusters", {
        method: "GET",
        schema: ClustersAnalyticsSchema,
      }),
  },

  studentApp: {
    getMySupport: () =>
      apiRequest("/api/my-support", {
        method: "GET",
        schema: z.object({
          cases: z.array(StudentSupportCaseViewSchema),
          synthetic: z.boolean().optional(),
        }),
      }),
    createCheckIn: (payload: CreateCheckInRequest) =>
      apiRequest("/api/checkins", {
        method: "POST",
        body: payload,
        idempotencyKey: generateIdempotencyKey(),
        schema: CheckInRecordSchema,
      }),
    getCheckIn: (id: string) =>
      apiRequest(`/api/checkins/${encodeURIComponent(id)}`, {
        method: "GET",
        schema: CheckInRecordSchema,
      }),
    getConsent: () =>
      apiRequest("/api/consent", {
        method: "GET",
        schema: ConsentResponseSchema,
      }),
    patchConsent: (payload: PatchConsentRequest) =>
      apiRequest("/api/consent", {
        method: "PATCH",
        body: payload,
        schema: ConsentResponseSchema,
      }),
  },
};

