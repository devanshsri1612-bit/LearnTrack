import { z } from "zod";

// ==== 1. ROLES & AUTH ====
export const RoleSchema = z.enum([
  "STUDENT",
  "PEER_TUTOR",
  "MENTOR",
  "FACULTY",
  "HOD",
  "COUNSELLOR",
  "FINANCE",
  "ADMIN",
]);
export type Role = z.infer<typeof RoleSchema>;

export const STAFF_ROLES: Role[] = [
  "MENTOR",
  "FACULTY",
  "HOD",
  "COUNSELLOR",
  "FINANCE",
  "ADMIN",
];

export const STUDENT_ROLES: Role[] = ["STUDENT", "PEER_TUTOR"];

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email().optional(),
  roles: z.array(RoleSchema),
  studentId: z.string().nullable().optional(),
  staffId: z.string().nullable().optional(),
  tutorId: z.string().nullable().optional(),
  synthetic: z.boolean().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CsrfResponseSchema = z.object({
  csrfToken: z.string().optional(),
});
export type CsrfResponse = z.infer<typeof CsrfResponseSchema>;

// ==== 2. ERROR & PAGINATION ====
export const ApiErrorShapeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorShape = z.infer<typeof ApiErrorShapeSchema>;

export function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    synthetic: z.boolean().optional(),
  });
}

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  synthetic?: boolean;
};

// ==== 3. RESTRICTED / OBSERVATION WRAPPERS ====
export const RestrictedFieldSchema = z.object({
  restricted: z.literal(true),
  reason: z.string().optional(),
});
export type RestrictedField = z.infer<typeof RestrictedFieldSchema>;

export function restrictable<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, RestrictedFieldSchema]).nullable().optional();
}

export function isRestrictedField(val: unknown): val is RestrictedField {
  return (
    typeof val === "object" &&
    val !== null &&
    "restricted" in val &&
    (val as { restricted?: unknown }).restricted === true
  );
}

// ==== 4. QUEUE & STAFF CAPACITY ====
export const StaffCapacitySchema = z.object({
  staffId: z.string(),
  name: z.string(),
  role: RoleSchema,
  slotsUsed: z.number(),
  slotsTotal: z.number(),
});
export type StaffCapacity = z.infer<typeof StaffCapacitySchema>;

export const QueueOverflowStatusSchema = z.enum([
  "ASSIGNED_SLOT",
  "QUEUED",
  "ROUTED_TO_MENTOR_PEER",
]);
export type QueueOverflowStatus = z.infer<typeof QueueOverflowStatusSchema>;

export const QueueItemSchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  cohort: z.string(),
  expectedBenefitRank: z.number(),
  expectedBenefitLabel: z.string(),
  needsAttentionReason: z.string(),
  recommendedIntervention: z.string().optional(),
  assignedStaffId: z.string().nullable().optional(),
  assignedStaffName: z.string().nullable().optional(),
  routingStatus: QueueOverflowStatusSchema,
  caseId: z.string().nullable().optional(),
  updatedAt: z.string(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const PriorityQueueResponseSchema = z.object({
  items: z.array(QueueItemSchema),
  staffCapacities: z.array(StaffCapacitySchema),
  synthetic: z.boolean().optional(),
});
export type PriorityQueueResponse = z.infer<typeof PriorityQueueResponseSchema>;

export const UpdateCapacityRequestSchema = z.object({
  slotsTotal: z.number().int().min(0).max(100),
});
export type UpdateCapacityRequest = z.infer<typeof UpdateCapacityRequestSchema>;

// ==== 5. STUDENTS & 360 ====
export const StudentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  cohort: z.string(),
  department: z.string(),
  semester: z.number(),
  needsAttention: z.boolean(),
  activeCaseId: z.string().nullable().optional(),
  lastObservationAt: z.string().nullable().optional(),
});
export type StudentSummary = z.infer<typeof StudentSummarySchema>;

export const TrendPointSchema = z.object({
  period: z.string(),
  timestamp: z.string(),
  value: z.number().nullable(),
  label: z.string().optional(),
});
export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const FeeStatusRecordSchema = z.object({
  status: z.enum(["PAID", "PENDING_INSTALLMENT", "FEE_SUPPORT_REQUESTED", "OVERDUE_BALANCE"]),
  dueDate: z.string().nullable().optional(),
  note: z.string().optional(),
  trend: z.array(TrendPointSchema).optional(),
});
export type FeeStatusRecord = z.infer<typeof FeeStatusRecordSchema>;

export const FacultyFeedbackItemSchema = z.object({
  id: z.string(),
  date: z.string(),
  subject: z.string(),
  authorRole: z.string(),
  observation: z.string(),
  engagementRating: z.number().min(1).max(5).nullable().optional(),
});
export type FacultyFeedbackItem = z.infer<typeof FacultyFeedbackItemSchema>;

export const CounsellingSummarySchema = z.object({
  referralStatus: z.enum(["NONE", "REFERRED", "ACTIVE_SUPPORT", "COMPLETED"]),
  lastUpdated: z.string().nullable().optional(),
  summaryNote: z.string().optional(),
});
export type CounsellingSummary = z.infer<typeof CounsellingSummarySchema>;

export const Student360Schema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  cohort: z.string(),
  department: z.string(),
  semester: z.number(),
  mentorName: z.string().nullable().optional(),
  activeCaseId: z.string().nullable().optional(),
  hasRecentObservations: z.boolean(),
  attendance: restrictable(z.array(TrendPointSchema)),
  marks: restrictable(z.array(TrendPointSchema)),
  participation: restrictable(z.array(TrendPointSchema)),
  fees: restrictable(FeeStatusRecordSchema),
  skills: restrictable(z.array(TrendPointSchema)),
  facultyFeedback: restrictable(z.array(FacultyFeedbackItemSchema)),
  counselling: restrictable(CounsellingSummarySchema),
  studentContext: restrictable(
    z.object({
      lastCheckInAt: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      requestedSupport: z.string().nullable().optional(),
    })
  ),
  synthetic: z.boolean().optional(),
});
export type Student360 = z.infer<typeof Student360Schema>;

export const StudentHistoryEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  category: z.enum(["ACADEMIC", "ATTENDANCE", "CHECKIN", "CASE", "SUPPORT"]),
  title: z.string(),
  description: z.string(),
});
export type StudentHistoryEvent = z.infer<typeof StudentHistoryEventSchema>;

export const StudentHistoryResponseSchema = z.object({
  studentId: z.string(),
  events: z.array(StudentHistoryEventSchema),
  synthetic: z.boolean().optional(),
});
export type StudentHistoryResponse = z.infer<typeof StudentHistoryResponseSchema>;

// ==== 6. RISK ASSESSMENT ====
export const EvidenceItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string(),
  direction: z.enum(["CONCERN", "PROTECTIVE", "NEUTRAL"]).optional(),
  restricted: z.boolean().optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const RiskAssessmentSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  createdAt: z.string(),
  needsAttention: z.boolean(),
  attentionLevel: z.enum(["NEEDS_ATTENTION", "MONITOR", "ROUTINE", "INSUFFICIENT_DATA"]),
  attentionSummary: z.string(),
  sourceMode: z.enum(["ML", "FALLBACK", "UNAVAILABLE"]),
  modelVersion: z.string(),
  limitations: z.string(),
  evidenceGroups: z.object({
    observedChanges: z.array(EvidenceItemSchema),
    modelExplanation: z.array(EvidenceItemSchema),
    hypothesisedCauses: z.array(EvidenceItemSchema),
    studentConfirmedContext: restrictable(z.array(EvidenceItemSchema)),
  }),
  synthetic: z.boolean().optional(),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

// ==== 7. INTERVENTION RECOMMENDATIONS & CASES ====
export const InterventionTypeSchema = z.enum([
  "REMEDIAL",
  "MENTOR",
  "PARENT_MEETING",
  "COUNSELLING_REFERRAL",
  "FEE_SUPPORT",
  "PLACEMENT_READINESS",
  "PEER_TUTOR",
]);
export type InterventionType = z.infer<typeof InterventionTypeSchema>;

export const RecommendationItemSchema = z.object({
  id: z.string(),
  interventionType: InterventionTypeSchema,
  rank: z.number(),
  title: z.string(),
  rationale: z.string(),
  improvedCount: z.number(),
  sampleSize: z.number(),
  minSampleThreshold: z.number(),
  confidenceState: z.enum(["STANDARD", "LOW_CONFIDENCE", "INSUFFICIENT_DATA"]),
  synthetic: z.boolean(),
});
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const RecommendationsResponseSchema = z.object({
  caseId: z.string(),
  studentId: z.string(),
  items: z.array(RecommendationItemSchema),
  synthetic: z.boolean().optional(),
});
export type RecommendationsResponse = z.infer<typeof RecommendationsResponseSchema>;

export const CaseLifecycleStatusSchema = z.enum([
  "NEEDS_REVIEW",
  "ASSIGNED",
  "SCHEDULED",
  "IN_PROGRESS",
  "ACTION_COMPLETED",
  "OUTCOME_REVIEWED",
  "CLOSED",
  "DEFERRED",
  "DECLINED",
  "CANCELLED",
  "REOPENED",
]);
export type CaseLifecycleStatus = z.infer<typeof CaseLifecycleStatusSchema>;

export const DeadlineStatusSchema = z.enum(["ON_TIME", "DUE_SOON", "OVERDUE"]);
export type DeadlineStatus = z.infer<typeof DeadlineStatusSchema>;

export const CaseActionTypeSchema = z.enum([
  "APPROVE",
  "OVERRIDE",
  "DEFER",
  "DECLINE",
  "SCHEDULE",
  "START_PROGRESS",
  "COMPLETE_ACTION",
  "CLOSE",
  "REOPEN",
]);
export type CaseActionType = z.infer<typeof CaseActionTypeSchema>;

export const AllowedTransitionSchema = z.object({
  action: CaseActionTypeSchema,
  allowed: z.boolean(),
  reasonIfDisabled: z.string().optional(),
});
export type AllowedTransition = z.infer<typeof AllowedTransitionSchema>;

export const EvidenceRecordSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  type: z.enum([
    "MEETING_NOTES",
    "ATTENDANCE_VERIFICATION",
    "TUTORING_SUMMARY",
    "FEE_PLAN_AGREEMENT",
    "FOLLOW_UP_OBSERVATION",
  ]),
  note: z.string(),
  date: z.string(),
  authorName: z.string(),
  authorRole: RoleSchema,
  createdAt: z.string(),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const OutcomeClassificationSchema = z.enum([
  "IMPROVEMENT",
  "NO_CHANGE",
  "UNKNOWN",
]);
export type OutcomeClassification = z.infer<typeof OutcomeClassificationSchema>;

export const OutcomeRecordSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  classification: OutcomeClassificationSchema,
  observedMeasures: z.array(z.string()),
  note: z.string(),
  recordedBy: z.string(),
  recordedAt: z.string(),
});
export type OutcomeRecord = z.infer<typeof OutcomeRecordSchema>;

export const CaseDetailSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  cohort: z.string(),
  status: CaseLifecycleStatusSchema,
  deadlineStatus: DeadlineStatusSchema,
  deadline: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerRole: RoleSchema.nullable().optional(),
  recommendedIntervention: InterventionTypeSchema.nullable().optional(),
  selectedIntervention: InterventionTypeSchema.nullable().optional(),
  overrideReason: z.string().nullable().optional(),
  plainLanguageReason: z.string(),
  version: z.number(),
  updatedAt: z.string(),
  createdAt: z.string(),
  allowedTransitions: z.array(AllowedTransitionSchema),
  evidence: z.array(EvidenceRecordSchema).optional(),
  outcome: OutcomeRecordSchema.nullable().optional(),
  escalatedToHod: z.boolean().optional(),
  synthetic: z.boolean().optional(),
});
export type CaseDetail = z.infer<typeof CaseDetailSchema>;

export const CreateCaseRequestSchema = z.object({
  studentId: z.string().optional(),
  cohort: z.string().optional(),
  subject: z.string().optional(),
  clusterId: z.string().optional(),
  taskType: z.enum(["STUDENT_SUPPORT", "FACULTY_REVIEW_TASK"]).optional(),
  recommendedIntervention: InterventionTypeSchema.optional(),
  plainLanguageReason: z.string().min(5, "Provide a clear reason for opening support"),
});
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;

export const PatchCaseRequestSchema = z
  .object({
    action: CaseActionTypeSchema,
    version: z.number(),
    updatedAt: z.string(),
    selectedIntervention: InterventionTypeSchema.optional(),
    overrideReason: z.string().optional(),
    ownerId: z.string().optional(),
    deadline: z.string().optional(),
    note: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "OVERRIDE") {
      if (!data.overrideReason || data.overrideReason.trim().length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["overrideReason"],
          message: "Override reason is required and must be at least 10 characters.",
        });
      }
      if (!data.selectedIntervention) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectedIntervention"],
          message: "Select the intervention type for the override.",
        });
      }
    }
  });
export type PatchCaseRequest = z.infer<typeof PatchCaseRequestSchema>;

export const CaseTimelineEntrySchema = z.object({
  id: z.string(),
  caseId: z.string(),
  timestamp: z.string(),
  actorName: z.string(),
  actorRole: RoleSchema,
  eventType: z.enum([
    "CREATED",
    "STATUS_CHANGE",
    "ASSIGNED",
    "OVERRIDDEN",
    "ESCALATED",
    "EVIDENCE_ADDED",
    "OUTCOME_RECORDED",
  ]),
  fromStatus: CaseLifecycleStatusSchema.nullable().optional(),
  toStatus: CaseLifecycleStatusSchema.nullable().optional(),
  summary: z.string(),
  detail: z.string().nullable().optional(),
});
export type CaseTimelineEntry = z.infer<typeof CaseTimelineEntrySchema>;

export const CaseTimelineResponseSchema = z.object({
  caseId: z.string(),
  status: CaseLifecycleStatusSchema,
  deadlineStatus: DeadlineStatusSchema,
  deadline: z.string().nullable().optional(),
  entries: z.array(CaseTimelineEntrySchema),
  synthetic: z.boolean().optional(),
});
export type CaseTimelineResponse = z.infer<typeof CaseTimelineResponseSchema>;

export const CreateEvidenceRequestSchema = z.object({
  type: z.enum([
    "MEETING_NOTES",
    "ATTENDANCE_VERIFICATION",
    "TUTORING_SUMMARY",
    "FEE_PLAN_AGREEMENT",
    "FOLLOW_UP_OBSERVATION",
  ]),
  note: z.string().min(10, "Please provide structured evidence details (at least 10 characters)."),
  date: z.string().min(1, "Observation or meeting date is required."),
});
export type CreateEvidenceRequest = z.infer<typeof CreateEvidenceRequestSchema>;

export const CreateOutcomeRequestSchema = z.object({
  classification: OutcomeClassificationSchema,
  observedMeasures: z.array(z.string()).min(1, "Select at least one observed measure or note."),
  note: z.string().min(5, "Provide a brief summary note for the outcome review."),
});
export type CreateOutcomeRequest = z.infer<typeof CreateOutcomeRequestSchema>;

// ==== 8. TUTORS & SESSIONS ====
export const AvailabilitySlotSchema = z.object({
  id: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  isBooked: z.boolean().optional(),
});
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const TutorProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  cohort: z.string(),
  verifiedSubjects: z.array(z.string()),
  isVerified: z.boolean(),
  timezone: z.string(),
  slots: z.array(AvailabilitySlotSchema),
  activeSessionsCount: z.number(),
  maxWeeklySessions: z.number(),
});
export type TutorProfile = z.infer<typeof TutorProfileSchema>;

export const UpdateAvailabilityRequestSchema = z.object({
  timezone: z.string().min(1, "Timezone is required"),
  slots: z.array(
    z.object({
      id: z.string().optional(),
      startIso: z.string(),
      endIso: z.string(),
    })
  ),
});
export type UpdateAvailabilityRequest = z.infer<typeof UpdateAvailabilityRequestSchema>;

export const TutoringSessionStatusSchema = z.enum([
  "REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "COMPLETED",
  "CANCELLED",
]);
export type TutoringSessionStatus = z.infer<typeof TutoringSessionStatusSchema>;

export const TutoringSessionSchema = z.object({
  id: z.string(),
  tutorId: z.string(),
  tutorName: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  subject: z.string(),
  slotId: z.string(),
  startIso: z.string(),
  endIso: z.string(),
  status: TutoringSessionStatusSchema,
  caseId: z.string().nullable().optional(),
  academicGoalNote: z.string().optional(),
  feedbackSubmitted: z.boolean().optional(),
});
export type TutoringSession = z.infer<typeof TutoringSessionSchema>;

export const BookSessionRequestSchema = z.object({
  tutorId: z.string().min(1),
  studentId: z.string().min(1),
  subject: z.string().min(1),
  slotId: z.string().min(1),
  startIso: z.string(),
  endIso: z.string(),
  caseId: z.string().optional(),
  academicGoalNote: z.string().optional(),
});
export type BookSessionRequest = z.infer<typeof BookSessionRequestSchema>;

export const PatchSessionRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "COMPLETED", "CANCELLED"]),
  note: z.string().optional(),
});
export type PatchSessionRequest = z.infer<typeof PatchSessionRequestSchema>;

export const SessionFeedbackRequestSchema = z.object({
  topicsCovered: z.string().min(5, "Describe the academic topics covered"),
  studentEngagement: z.enum(["ENGAGED", "PARTIAL", "NEEDS_FOLLOW_UP"]),
  followUpRecommended: z.boolean(),
  note: z.string().optional(),
});
export type SessionFeedbackRequest = z.infer<typeof SessionFeedbackRequestSchema>;

// ==== 9. MEETINGS & GOOGLE INTEGRATION ====
export const MeetingSyncStatusSchema = z.enum(["PENDING", "SYNCED", "FAILED"]);
export type MeetingSyncStatus = z.infer<typeof MeetingSyncStatusSchema>;

export const MeetingNotificationStatusSchema = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "UNAVAILABLE",
]);
export type MeetingNotificationStatus = z.infer<
  typeof MeetingNotificationStatusSchema
>;

export const IntegrationModeSchema = z.enum(["MOCK", "LIVE", "DISABLED"]);
export type IntegrationMode = z.infer<typeof IntegrationModeSchema>;

export const MeetingRecordSchema = z.object({
  id: z.string(),
  title: z.string(), // Must contain no sensitive case details
  organiserId: z.string(),
  organiserName: z.string(),
  participantIds: z.array(z.string()),
  participantNames: z.array(z.string()),
  startIso: z.string(),
  endIso: z.string(),
  timezone: z.string(),
  syncStatus: MeetingSyncStatusSchema,
  integrationMode: IntegrationModeSchema,
  locationOrLink: z.string().optional(),
  caseId: z.string().nullable().optional(),
  googleEventId: z.string().nullable().optional(),
  meetLink: z.string().nullable().optional(),
  calendarError: z.string().nullable().optional(),
  calendarSyncedAt: z.string().nullable().optional(),
  notificationStatus: MeetingNotificationStatusSchema.optional(),
  notificationError: z.string().nullable().optional(),
  notificationSentAt: z.string().nullable().optional(),
});
export type MeetingRecord = z.infer<typeof MeetingRecordSchema>;

export const CreateMeetingRequestSchema = z.object({
  participantId: z.string().min(1, "Select a participant"),
  startIso: z.string().min(1, "Start time is required"),
  endIso: z.string().min(1, "End time is required"),
  timezone: z.string().min(1),
  caseId: z.string().optional(),
  sendEmailNotification: z.boolean().optional(),
});
export type CreateMeetingRequest = z.infer<typeof CreateMeetingRequestSchema>;

export const PatchMeetingRequestSchema = z.object({
  startIso: z.string().optional(),
  endIso: z.string().optional(),
  resync: z.boolean().optional(),
  resendNotification: z.boolean().optional(),
});
export type PatchMeetingRequest = z.infer<typeof PatchMeetingRequestSchema>;

export const GoogleIntegrationStatusSchema = z.object({
  connected: z.boolean(),
  mode: IntegrationModeSchema,
  organiserEmail: z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable().optional(),
  canManage: z.boolean(),
  calendarConnected: z.boolean().optional(),
  gmailConnected: z.boolean().optional(),
  configured: z.boolean().optional(),
  authUrl: z.string().nullable().optional(),
  accountEmail: z.string().nullable().optional(),
});
export type GoogleIntegrationStatus = z.infer<
  typeof GoogleIntegrationStatusSchema
>;

// ==== 10. NOTIFICATIONS ====
export const NotificationStateSchema = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "CANCELLED",
]);
export type NotificationState = z.infer<typeof NotificationStateSchema>;

export const NotificationItemSchema = z.object({
  id: z.string(),
  recipientId: z.string(),
  title: z.string(),
  summary: z.string(),
  channel: z.enum(["EMAIL", "IN_APP"]),
  state: NotificationStateSchema,
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const NotificationsResponseSchema = z.object({
  items: z.array(NotificationItemSchema),
  synthetic: z.boolean().optional(),
});
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

// ==== 11. ANALYTICS & LEADERSHIP DASHBOARD ====
export const CohortAnalyticsSchema = z.object({
  openCasesCount: z.number(),
  completedCasesCount: z.number(),
  overdueCasesCount: z.number(),
  medianHoursToFirstAction: z.number(),
  outcomeReviewRatePercent: z.number(),
  sharedDeclinePatterns: z.array(
    z.object({
      id: z.string(),
      cohort: z.string(),
      subject: z.string(),
      affectedStudentsCount: z.number(),
      metric: z.string(),
      changeSummary: z.string(),
    })
  ),
  synthetic: z.boolean(),
});
export type CohortAnalytics = z.infer<typeof CohortAnalyticsSchema>;

export const OutcomesAnalyticsSchema = z.object({
  byIntervention: z.array(
    z.object({
      interventionType: InterventionTypeSchema,
      improvementCount: z.number(),
      noChangeCount: z.number(),
      unknownCount: z.number(),
      totalReviewed: z.number(),
    })
  ),
  synthetic: z.boolean(),
});
export type OutcomesAnalytics = z.infer<typeof OutcomesAnalyticsSchema>;

export const ImpactAnalyticsSchema = z.object({
  series: z.array(
    z.object({
      period: z.string(),
      withSupportAttendanceDelta: z.number(),
      comparisonGroupAttendanceDelta: z.number(),
      reviewedCasesCount: z.number(),
    })
  ),
  synthetic: z.boolean(),
});
export type ImpactAnalytics = z.infer<typeof ImpactAnalyticsSchema>;

export const FairnessGroupMetricSchema = z.object({
  groupDimension: z.string(),
  groupLabel: z.string(),
  groupCount: z.number(),
  flaggedCount: z.number(),
  alertRatePercent: z.number().nullable(),
  minGroupSizeThreshold: z.number(),
  insufficientData: z.boolean(),
});
export type FairnessGroupMetric = z.infer<typeof FairnessGroupMetricSchema>;

export const FairnessAnalyticsSchema = z.object({
  groups: z.array(FairnessGroupMetricSchema),
  synthetic: z.boolean(),
});
export type FairnessAnalytics = z.infer<typeof FairnessAnalyticsSchema>;

export const ClusterTrendPointSchema = z.object({
  period: z.string(),
  rate: z.number(),
  baselineRate: z.number(),
});
export type ClusterTrendPoint = z.infer<typeof ClusterTrendPointSchema>;

export const SharedBarrierClusterSchema = z.object({
  id: z.string(),
  subject: z.string(),
  cohort: z.string(),
  groupSize: z.number(),
  minGroupSize: z.number(),
  affectedCount: z.number().nullable(),
  rate: z.number().nullable(),
  baselineRate: z.number().nullable(),
  flagged: z.boolean(),
  insufficientData: z.boolean(),
  signals: z.array(z.string()),
  suggestedChecks: z.array(z.string()),
  trend: z.array(ClusterTrendPointSchema),
  synthetic: z.boolean(),
});
export type SharedBarrierCluster = z.infer<typeof SharedBarrierClusterSchema>;

export const ClustersAnalyticsSchema = z.object({
  clusters: z.array(SharedBarrierClusterSchema),
  synthetic: z.boolean(),
});
export type ClustersAnalytics = z.infer<typeof ClustersAnalyticsSchema>;

// ==== 12. STUDENT APP: CHECK-IN, CONSENT, MY SUPPORT ====
export const StudentSupportCaseViewSchema = z.object({
  id: z.string(),
  status: CaseLifecycleStatusSchema,
  plainLanguageReason: z.string(),
  supportType: InterventionTypeSchema.nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerRole: RoleSchema.nullable().optional(),
  nextStepSummary: z.string(),
  canDeclineOrDeferOptional: z.boolean(),
  updatedAt: z.string(),
});
export type StudentSupportCaseView = z.infer<typeof StudentSupportCaseViewSchema>;

export const CheckInSharingOptionSchema = z.object({
  recipientRole: z.enum(["MENTOR", "FACULTY", "COUNSELLOR", "FINANCE"]),
  allowed: z.boolean(),
});
export type CheckInSharingOption = z.infer<typeof CheckInSharingOptionSchema>;

export const CheckInRecordSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  contextNote: z.string(),
  supportRequested: z.enum([
    "NONE",
    "ACADEMIC_TUTORING",
    "MENTOR_CHECKIN",
    "COUNSELLING_REFERRAL",
    "FEE_GUIDANCE",
  ]),
  optionalSupportDecision: z.enum(["ACCEPT", "DEFER", "DECLINE"]).optional(),
  sharingOptions: z.array(CheckInSharingOptionSchema),
  createdAt: z.string(),
});
export type CheckInRecord = z.infer<typeof CheckInRecordSchema>;

export const CreateCheckInRequestSchema = z.object({
  contextNote: z.string().min(5, "Please share a brief note (at least 5 characters) about how things are going."),
  supportRequested: z.enum([
    "NONE",
    "ACADEMIC_TUTORING",
    "MENTOR_CHECKIN",
    "COUNSELLING_REFERRAL",
    "FEE_GUIDANCE",
  ]),
  optionalSupportDecision: z.enum(["ACCEPT", "DEFER", "DECLINE"]).optional(),
  sharingOptions: z.array(CheckInSharingOptionSchema),
});
export type CreateCheckInRequest = z.infer<typeof CreateCheckInRequestSchema>;

export const ConsentScopeSchema = z.enum([
  "CHECKIN_NOTES",
  "COUNSELLING_REFERRAL_STATUS",
  "FINANCIAL_SUPPORT_STATUS",
  "ATTENDANCE_AND_MARKS",
]);
export type ConsentScope = z.infer<typeof ConsentScopeSchema>;

export const ConsentGrantSchema = z.object({
  id: z.string(),
  scope: ConsentScopeSchema,
  scopeLabel: z.string(),
  recipientRole: z.enum(["MENTOR", "FACULTY", "HOD", "COUNSELLOR", "FINANCE", "PEER_TUTOR"]),
  granted: z.boolean(),
  updatedAt: z.string(),
});
export type ConsentGrant = z.infer<typeof ConsentGrantSchema>;

export const ConsentResponseSchema = z.object({
  studentId: z.string(),
  grants: z.array(ConsentGrantSchema),
  synthetic: z.boolean().optional(),
});
export type ConsentResponse = z.infer<typeof ConsentResponseSchema>;

export const PatchConsentRequestSchema = z.object({
  scope: ConsentScopeSchema,
  recipientRole: z.enum(["MENTOR", "FACULTY", "HOD", "COUNSELLOR", "FINANCE", "PEER_TUTOR"]),
  granted: z.boolean(),
});
export type PatchConsentRequest = z.infer<typeof PatchConsentRequestSchema>;

// ==== 12. REWARDS & LEARNCOINS ====
export const RewardSourceTypeSchema = z.enum([
  "COMEBACK",
  "CONSISTENCY",
  "SUPPORT_SESSION",
  "SUPPORT_SESSION_TUTOR",
]);
export type RewardSourceType = z.infer<typeof RewardSourceTypeSchema>;

export const RewardLedgerEntrySchema = z.object({
  id: z.string(),
  studentId: z.string(),
  sourceType: RewardSourceTypeSchema,
  sourceId: z.string(),
  points: z.number().int(),
  reason: z.string(),
  createdAt: z.string(),
  activityWeek: z.string().optional(),
});
export type RewardLedgerEntry = z.infer<typeof RewardLedgerEntrySchema>;

export const RewardItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cost: z.number().int().positive(),
  stock: z.number().int().min(0),
  isDraw: z.boolean().default(false),
  simulated: z.boolean().default(true),
  entered: z.boolean().optional(),
});
export type RewardItem = z.infer<typeof RewardItemSchema>;

export const RedemptionStatusSchema = z.enum([
  "PENDING",
  "FULFILLED",
  "CANCELLED",
]);
export type RedemptionStatus = z.infer<typeof RedemptionStatusSchema>;

export const RedemptionSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  itemId: z.string(),
  cost: z.number().int().positive(),
  status: RedemptionStatusSchema,
  createdAt: z.string(),
  item: RewardItemSchema.optional(),
});
export type Redemption = z.infer<typeof RedemptionSchema>;

export const RedemptionListItemSchema = z.object({
  id: z.string(),
  studentDisplayName: z.string(),
  itemName: z.string(),
  cost: z.number().int().positive(),
  status: RedemptionStatusSchema,
  createdAt: z.string(),
});
export type RedemptionListItem = z.infer<typeof RedemptionListItemSchema>;

export const RedemptionsListResponseSchema = z.object({
  items: z.array(RedemptionListItemSchema),
  synthetic: z.boolean().optional(),
});
export type RedemptionsListResponse = z.infer<typeof RedemptionsListResponseSchema>;

export const RewardProgressSchema = z.object({
  nextRewardName: z.string().nullable(),
  nextRewardCost: z.number().int().nullable(),
  pointsNeeded: z.number().int().min(0),
  percent: z.number().min(0).max(100),
});
export type RewardProgress = z.infer<typeof RewardProgressSchema>;

export const RewardsMeResponseSchema = z.object({
  studentId: z.string(),
  balance: z.number().int().min(0),
  ledger: z.array(RewardLedgerEntrySchema),
  catalog: z.array(RewardItemSchema),
  progress: RewardProgressSchema,
  synthetic: z.boolean().optional(),
});
export type RewardsMeResponse = z.infer<typeof RewardsMeResponseSchema>;

export const RedeemRequestSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
});
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>;

export const PatchRedemptionRequestSchema = z.object({
  status: z.enum(["FULFILLED", "CANCELLED"]),
});
export type PatchRedemptionRequest = z.infer<typeof PatchRedemptionRequestSchema>;

export const CohortRewardSummarySchema = z.object({
  cohort: z.string(),
  studentCount: z.number().int(),
  pointsIssued: z.number().int().nullable(),
  redemptionsCount: z.number().int().nullable(),
  insufficientData: z.boolean(),
  note: z.string().optional(),
});
export type CohortRewardSummary = z.infer<typeof CohortRewardSummarySchema>;

export const RewardsSummaryResponseSchema = z.object({
  totalPointsIssued: z.number().int(),
  totalPointsRedeemed: z.number().int(),
  totalRedemptions: z.number().int(),
  fulfilledRedemptions: z.number().int(),
  cohorts: z.array(CohortRewardSummarySchema),
  synthetic: z.boolean().optional(),
});
export type RewardsSummaryResponse = z.infer<typeof RewardsSummaryResponseSchema>;

export const EvaluateRewardsResponseSchema = z.object({
  evaluatedStudents: z.number().int(),
  newEntriesCount: z.number().int(),
  synthetic: z.boolean().optional(),
});
export type EvaluateRewardsResponse = z.infer<typeof EvaluateRewardsResponseSchema>;

