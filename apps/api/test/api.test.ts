import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { seedDatabase } from "../prisma/seed.js";
import {
  CaseDetailSchema,
  CaseTimelineResponseSchema,
  CheckInRecordSchema,
  ClustersAnalyticsSchema,
  CohortAnalyticsSchema,
  ConsentResponseSchema,
  createPaginatedSchema,
  EvidenceRecordSchema,
  FairnessAnalyticsSchema,
  ImpactAnalyticsSchema,
  isRestrictedField,
  OutcomeRecordSchema,
  OutcomesAnalyticsSchema,
  PriorityQueueResponseSchema,
  RecommendationsResponseSchema,
  RiskAssessmentSchema,
  Student360Schema,
  StudentHistoryResponseSchema,
  StudentSummarySchema,
  StudentSupportCaseViewSchema,
  TutorProfileSchema,
  TutoringSessionSchema,
  UserSchema
} from "@learntrack/contracts";

const app = createApp();

async function loginAs(email: string, password = "demo-password") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  const parsed = UserSchema.safeParse(res.body);
  expect(parsed.success).toBe(true);
  return { agent, user: res.body };
}

describe("LearnTrack Backend API Integration Tests", () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it("1. GET /health and GET /ready return healthy status and database readiness", async () => {
    const healthRes = await request(app).get("/health");
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe("ok");

    const readyRes = await request(app).get("/ready");
    expect(readyRes.status).toBe(200);
    expect(readyRes.body).toEqual({
      status: "ready",
      db: "ok"
    });
  });

  it("2. Auth lifecycle: CSRF token, login, /api/auth/me, invalid credentials, and logout", async () => {
    const csrfRes = await request(app).get("/api/auth/csrf");
    expect(csrfRes.status).toBe(200);
    expect(typeof csrfRes.body.csrfToken).toBe("string");

    const unauthMe = await request(app).get("/api/auth/me");
    expect(unauthMe.status).toBe(401);
    expect(unauthMe.body.error.code).toBe("UNAUTHORIZED");

    const badLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "mentor@learntrack.edu", password: "wrong-password" });
    expect(badLogin.status).toBe(401);

    const { agent, user } = await loginAs("mentor@learntrack.edu");
    expect(user.roles).toContain("MENTOR");

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(UserSchema.safeParse(meRes.body).success).toBe(true);
    expect(meRes.body.id).toBe("STAFF-MENTOR-1");

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.ok).toBe(true);

    const afterLogoutMe = await agent.get("/api/auth/me");
    expect(afterLogoutMe.status).toBe(401);
  });

  it("3. Student access restricted to own data only", async () => {
    const { agent } = await loginAs("student@learntrack.edu");

    // Student can view own Student 360, own support plan (/api/my-support), own consent (/api/consent), and own check-in
    const ownStudent = await agent.get("/api/students/S-104");
    expect(ownStudent.status).toBe(200);
    expect(Student360Schema.safeParse(ownStudent.body).success).toBe(true);

    const ownPlan = await agent.get("/api/my-support");
    expect(ownPlan.status).toBe(200);
    const mySupportSchema = z.object({
      cases: z.array(StudentSupportCaseViewSchema),
      synthetic: z.boolean().optional()
    });
    expect(mySupportSchema.safeParse(ownPlan.body).success).toBe(true);

    const ownConsent = await agent.get("/api/consent");
    expect(ownConsent.status).toBe(200);
    expect(ConsentResponseSchema.safeParse(ownConsent.body).success).toBe(true);

    const ownCheckIn = await agent.get("/api/checkins/CHK-101");
    expect(ownCheckIn.status).toBe(200);
    expect(CheckInRecordSchema.safeParse(ownCheckIn.body).success).toBe(true);

    // Student cannot access another student's 360, history, or staff directory endpoints
    const otherStudent = await agent.get("/api/students/S-105");
    expect(otherStudent.status).toBe(403);
    expect(otherStudent.body.error.code).toBe("FORBIDDEN");

    const otherHistory = await agent.get("/api/students/S-105/history");
    expect(otherHistory.status).toBe(403);

    const staffList = await agent.get("/api/students");
    expect(staffList.status).toBe(403);

    const queueRes = await agent.get("/api/queue");
    expect(queueRes.status).toBe(403);
  });

  it("4. Tutor information limits: only academic session fields visible, never financial/counselling/360", async () => {
    const { agent } = await loginAs("tutor@learntrack.edu");

    // Tutor cannot view Student 360 or Cases
    const student360 = await agent.get("/api/students/S-104");
    expect(student360.status).toBe(403);

    const casesRes = await agent.get("/api/cases");
    expect(casesRes.status).toBe(403);

    // Tutor can view sessions, and caseId is null for non-staff
    const sessionsRes = await agent.get("/api/sessions");
    expect(sessionsRes.status).toBe(200);
    const parsedSessions = createPaginatedSchema(TutoringSessionSchema).safeParse(sessionsRes.body);
    expect(parsedSessions.success).toBe(true);
    for (const s of sessionsRes.body.items) {
      expect(s.caseId).toBeNull();
      expect(s).not.toHaveProperty("fees");
      expect(s).not.toHaveProperty("counselling");
      expect(s).not.toHaveProperty("studentContext");
    }
  });

  it("5. Check-in notes omitted from general responses and restricted when consent is revoked or viewer lacks role", async () => {
    const { agent: mentorAgent } = await loginAs("mentor@learntrack.edu");

    // General student list never includes checkInNotes or studentContext
    const listRes = await mentorAgent.get("/api/students");
    expect(listRes.status).toBe(200);
    expect(createPaginatedSchema(StudentSummarySchema).safeParse(listRes.body).success).toBe(true);
    for (const item of listRes.body.items) {
      expect(item).not.toHaveProperty("studentContext");
      expect(item).not.toHaveProperty("checkInNotes");
      expect(JSON.stringify(item)).not.toContain("Commute schedule changed this month");
    }

    // S-104 has granted CHECKIN_NOTES consent to MENTOR -> visible to mentor
    const s104Mentor = await mentorAgent.get("/api/students/S-104");
    expect(s104Mentor.status).toBe(200);
    expect(Student360Schema.safeParse(s104Mentor.body).success).toBe(true);
    expect(isRestrictedField(s104Mentor.body.studentContext)).toBe(false);
    expect(s104Mentor.body.studentContext.summary).toContain("Commute schedule changed this month");

    // S-105 has revoked CHECKIN_NOTES and COUNSELLING_REFERRAL_STATUS consent -> restricted even for mentor
    const s105Mentor = await mentorAgent.get("/api/students/S-105");
    expect(s105Mentor.status).toBe(200);
    expect(Student360Schema.safeParse(s105Mentor.body).success).toBe(true);
    expect(isRestrictedField(s105Mentor.body.studentContext)).toBe(true);
    expect(isRestrictedField(s105Mentor.body.counselling)).toBe(true);

    // Finance user cannot see S-104 check-in notes (only shared with MENTOR & COUNSELLOR)
    const { agent: financeAgent } = await loginAs("finance@learntrack.edu");
    const s104Finance = await financeAgent.get("/api/students/S-104");
    expect(s104Finance.status).toBe(200);
    expect(isRestrictedField(s104Finance.body.studentContext)).toBe(true);
    expect(isRestrictedField(s104Finance.body.fees)).toBe(false);
  });

  it("6. Valid and invalid case lifecycle transitions", async () => {
    const { agent } = await loginAs("mentor@learntrack.edu");

    const getRes = await agent.get("/api/cases/C-104");
    expect(getRes.status).toBe(200);
    expect(CaseDetailSchema.safeParse(getRes.body).success).toBe(true);
    const initialVersion = getRes.body.version;
    const initialUpdatedAt = getRes.body.updatedAt;

    // Invalid transition: NEEDS_REVIEW -> COMPLETE_ACTION (cannot complete before in progress/assigned)
    const invalidRes = await agent.patch("/api/cases/C-104").send({
      action: "COMPLETE_ACTION",
      version: initialVersion,
      updatedAt: initialUpdatedAt
    });
    expect(invalidRes.status).toBe(422);
    expect(invalidRes.body.error.code).toBe("INVALID_TRANSITION");

    // Valid transition: NEEDS_REVIEW -> APPROVE -> status becomes ASSIGNED
    const approveRes = await agent.patch("/api/cases/C-104").send({
      action: "APPROVE",
      selectedIntervention: "MENTOR",
      ownerId: "STAFF-MENTOR-1",
      version: initialVersion,
      updatedAt: initialUpdatedAt
    });
    expect(approveRes.status).toBe(200);
    expect(CaseDetailSchema.safeParse(approveRes.body).success).toBe(true);
    expect(approveRes.body.status).toBe("ASSIGNED");
    expect(approveRes.body.version).toBe(initialVersion + 1);
  });

  it("7. Override requires a reason of at least 10 characters", async () => {
    const { agent } = await loginAs("mentor@learntrack.edu");

    const c104 = await agent.get("/api/cases/C-104");
    const currentVersion = c104.body.version;
    const currentUpdatedAt = c104.body.updatedAt;

    // Short override reason (< 10 chars) is rejected by Zod contract validation (422)
    const shortOverride = await agent.patch("/api/cases/C-104").send({
      action: "OVERRIDE",
      selectedIntervention: "REMEDIAL",
      overrideReason: "Too short",
      version: currentVersion,
      updatedAt: currentUpdatedAt
    });
    expect(shortOverride.status).toBe(422);

    // Valid override reason (>= 10 chars) succeeds and logs OVERRIDDEN event
    const validOverride = await agent.patch("/api/cases/C-104").send({
      action: "OVERRIDE",
      selectedIntervention: "REMEDIAL",
      overrideReason: "Student requested remedial lab support first before mentor sessions.",
      version: currentVersion,
      updatedAt: currentUpdatedAt
    });
    expect(validOverride.status).toBe(200);
    expect(CaseDetailSchema.safeParse(validOverride.body).success).toBe(true);
    expect(validOverride.body.selectedIntervention).toBe("REMEDIAL");
    expect(validOverride.body.overrideReason).toContain("Student requested remedial lab support");
  });

  it("8. 409 conflict on stale case version or full staff capacity", async () => {
    const { agent } = await loginAs("mentor@learntrack.edu");

    const c104 = await agent.get("/api/cases/C-104");
    const currentVersion = c104.body.version;
    const currentUpdatedAt = c104.body.updatedAt;

    // Stale version returns 409 CONFLICT
    const staleRes = await agent.patch("/api/cases/C-104").send({
      action: "DEFER",
      version: currentVersion - 1,
      updatedAt: currentUpdatedAt
    });
    expect(staleRes.status).toBe(409);
    expect(staleRes.body.error.code).toBe("CONFLICT");

    // Full staff capacity (STAFF-COUNSELLOR-1 has 6/6 slots used) returns 409 STAFF_CAPACITY_FULL with proposedStaff
    const fullStaffRes = await agent.patch("/api/cases/C-104").send({
      action: "OVERRIDE",
      selectedIntervention: "COUNSELLING_REFERRAL",
      overrideReason: "Reassigning to counsellor for specialized support review.",
      ownerId: "STAFF-COUNSELLOR-1",
      version: currentVersion,
      updatedAt: currentUpdatedAt
    });
    expect(fullStaffRes.status).toBe(409);
    expect(fullStaffRes.body.error.code).toBe("STAFF_CAPACITY_FULL");
    expect(fullStaffRes.body.error.details.proposedStaff).toBeDefined();
    expect(fullStaffRes.body.error.details.proposedStaff.staffId).toBeDefined();
  });

  it("9. Duplicate booking blocked (409 SLOT_CONFLICT with alternativeSlots) and valid booking succeeds", async () => {
    const { agent } = await loginAs("student@learntrack.edu");

    // SLOT-201-2 is already booked in seed data
    const conflictRes = await agent.post("/api/sessions").send({
      studentId: "S-104",
      tutorId: "T-201",
      subject: "Data Structures & Algorithms",
      slotId: "SLOT-201-2",
      startIso: "2026-03-11T11:30:00.000Z",
      endIso: "2026-03-11T12:15:00.000Z"
    });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe("SLOT_CONFLICT");
    expect(Array.isArray(conflictRes.body.error.details.alternativeSlots)).toBe(true);
    expect(conflictRes.body.error.details.alternativeSlots.length).toBeGreaterThan(0);

    // Booking an open slot (SLOT-201-1) succeeds and marks the slot booked
    const validBook = await agent.post("/api/sessions").send({
      studentId: "S-104",
      tutorId: "T-201",
      subject: "Data Structures & Algorithms",
      slotId: "SLOT-201-1",
      startIso: "2026-03-10T10:30:00.000Z",
      endIso: "2026-03-10T11:15:00.000Z",
      academicGoalNote: "Practice tree traversal recursion"
    });
    expect(validBook.status).toBe(201);
    expect(TutoringSessionSchema.safeParse(validBook.body).success).toBe(true);

    // Attempting to book SLOT-201-1 a second time now returns 409
    const secondBook = await agent.post("/api/sessions").send({
      studentId: "S-104",
      tutorId: "T-201",
      subject: "Data Structures & Algorithms",
      slotId: "SLOT-201-1",
      startIso: "2026-03-10T10:30:00.000Z",
      endIso: "2026-03-10T11:15:00.000Z"
    });
    expect(secondBook.status).toBe(409);
  });

  it("10. Unverified tutor (T-203) excluded from eligible tutor directory and booking", async () => {
    const { agent } = await loginAs("student@learntrack.edu");

    const tutorsRes = await agent.get("/api/tutors");
    expect(tutorsRes.status).toBe(200);
    expect(createPaginatedSchema(TutorProfileSchema).safeParse(tutorsRes.body).success).toBe(true);

    const tutorIds = tutorsRes.body.items.map((t: { id: string }) => t.id);
    expect(tutorIds).toContain("T-201");
    expect(tutorIds).toContain("T-202");
    expect(tutorIds).not.toContain("T-203");

    const directUnverified = await agent.get("/api/tutors/T-203");
    expect(directUnverified.status).toBe(404);
  });

  it("11. Evidence and outcome review persisted on case and reflected in timeline", async () => {
    const { agent } = await loginAs("mentor@learntrack.edu");

    const evidenceRes = await agent.post("/api/cases/C-104/evidence").send({
      type: "MEETING_NOTES",
      note: "Reviewed Week 7 recursion lab worksheet and attendance log with student.",
      date: "2026-03-08T10:00:00.000Z"
    });
    expect(evidenceRes.status).toBe(201);
    expect(EvidenceRecordSchema.safeParse(evidenceRes.body).success).toBe(true);

    const outcomeRes = await agent.post("/api/cases/C-104/outcomes").send({
      classification: "IMPROVEMENT",
      observedMeasures: ["Attendance +24%", "Quiz 3: 15/20"],
      note: "Attendance recovered to 82% over two weeks and Quiz 3 passed."
    });
    expect(outcomeRes.status).toBe(201);
    expect(OutcomeRecordSchema.safeParse(outcomeRes.body).success).toBe(true);
    expect(outcomeRes.body.classification).toBe("IMPROVEMENT");

    const updatedCase = await agent.get("/api/cases/C-104");
    expect(updatedCase.status).toBe(200);
    expect(CaseDetailSchema.safeParse(updatedCase.body).success).toBe(true);
    expect(updatedCase.body.status).toBe("OUTCOME_REVIEWED");
    expect(updatedCase.body.evidence.length).toBeGreaterThanOrEqual(2);
    expect(updatedCase.body.outcome.classification).toBe("IMPROVEMENT");

    const timelineRes = await agent.get("/api/cases/C-104/timeline");
    expect(timelineRes.status).toBe(200);
    expect(CaseTimelineResponseSchema.safeParse(timelineRes.body).success).toBe(true);
    const eventTypes = timelineRes.body.entries.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain("EVIDENCE_ADDED");
    expect(eventTypes).toContain("OUTCOME_RECORDED");
  });

  it("12. Missing-data assessment (S-107) returns INSUFFICIENT_DATA and UNAVAILABLE sourceMode without fabricating scores", async () => {
    const { agent } = await loginAs("mentor@learntrack.edu");

    const latestS107 = await agent.get("/api/students/S-107/assessments/latest");
    expect(latestS107.status).toBe(200);
    expect(RiskAssessmentSchema.safeParse(latestS107.body).success).toBe(true);
    expect(latestS107.body.attentionLevel).toBe("INSUFFICIENT_DATA");
    expect(latestS107.body.sourceMode).toBe("UNAVAILABLE");

    const runS107 = await agent.post("/api/students/S-107/assessments");
    expect(runS107.status).toBe(200);
    expect(RiskAssessmentSchema.safeParse(runS107.body).success).toBe(true);
    expect(runS107.body.attentionLevel).toBe("INSUFFICIENT_DATA");
    expect(runS107.body.sourceMode).toBe("UNAVAILABLE");
    expect(runS107.body.needsAttention).toBe(false);
  });

  it("13. Recommendations, Priority Queue, Leadership Analytics & Shared Barriers conform to contracts and enforce RBAC", async () => {
    const { agent: mentorAgent } = await loginAs("mentor@learntrack.edu");

    // Priority queue
    const queueRes = await mentorAgent.get("/api/queue");
    expect(queueRes.status).toBe(200);
    expect(PriorityQueueResponseSchema.safeParse(queueRes.body).success).toBe(true);

    // Student history
    const historyRes = await mentorAgent.get("/api/students/S-104/history");
    expect(historyRes.status).toBe(200);
    expect(StudentHistoryResponseSchema.safeParse(historyRes.body).success).toBe(true);

    // Recommendations for C-104 reproduce synthetic historical counts from fixtures/C-104.json
    const recsRes = await mentorAgent.get("/api/cases/C-104/recommendations");
    expect(recsRes.status).toBe(200);
    expect(RecommendationsResponseSchema.safeParse(recsRes.body).success).toBe(true);
    const mentorRec = recsRes.body.items.find(
      (r: { interventionType: string }) => r.interventionType === "MENTOR"
    );
    expect(mentorRec.improvedCount).toBe(22);
    expect(mentorRec.sampleSize).toBe(31);

    // Mentor is forbidden from leadership analytics
    const forbiddenAnalytics = await mentorAgent.get("/api/analytics/clusters");
    expect(forbiddenAnalytics.status).toBe(403);

    // HOD can access all analytics endpoints + create cohort-level faculty review task without student names
    const { agent: hodAgent } = await loginAs("hod@learntrack.edu");

    const cohortsRes = await hodAgent.get("/api/analytics/cohorts");
    expect(cohortsRes.status).toBe(200);
    expect(CohortAnalyticsSchema.safeParse(cohortsRes.body).success).toBe(true);

    const outcomesRes = await hodAgent.get("/api/analytics/outcomes");
    expect(outcomesRes.status).toBe(200);
    expect(OutcomesAnalyticsSchema.safeParse(outcomesRes.body).success).toBe(true);

    const impactRes = await hodAgent.get("/api/analytics/impact");
    expect(impactRes.status).toBe(200);
    expect(ImpactAnalyticsSchema.safeParse(impactRes.body).success).toBe(true);

    const fairnessRes = await hodAgent.get("/api/analytics/fairness");
    expect(fairnessRes.status).toBe(200);
    expect(FairnessAnalyticsSchema.safeParse(fairnessRes.body).success).toBe(true);
    const smallGroup = fairnessRes.body.groups.find((g: { groupLabel: string }) =>
      g.groupLabel.includes("Lateral Transfer Cohort")
    );
    expect(smallGroup.insufficientData).toBe(true);
    expect(smallGroup.alertRatePercent).toBeNull();

    const clustersRes = await hodAgent.get("/api/analytics/clusters");
    expect(clustersRes.status).toBe(200);
    expect(ClustersAnalyticsSchema.safeParse(clustersRes.body).success).toBe(true);

    // Create cohort review task without student identifiers
    const taskRes = await hodAgent.post("/api/cases").send({
      taskType: "FACULTY_REVIEW_TASK",
      cohort: "CS-2024-A",
      subject: "Data Structures & Algorithms",
      clusterId: "CL-DSA-2024A",
      plainLanguageReason: "Review lab schedule overlap and Week 5-7 recursion attendance drop."
    });
    expect(taskRes.status).toBe(201);
    expect(CaseDetailSchema.safeParse(taskRes.body).success).toBe(true);
    expect(taskRes.body.studentName).toContain("Cohort Review");
  });

  it("14. Full contract parity audit across all remaining frontend endpoints (capacity, availability, session feedback, meetings, Google integration, notifications, check-ins, consent)", async () => {
    const {
      StaffCapacitySchema,
      MeetingRecordSchema,
      GoogleIntegrationStatusSchema,
      NotificationsResponseSchema
    } = await import("@learntrack/contracts");

    const { agent: hodAgent } = await loginAs("hod@learntrack.edu");
    const capRes = await hodAgent.put("/api/staff/STAFF-MENTOR-1/capacity").send({ slotsTotal: 9 });
    expect(capRes.status).toBe(200);
    expect(StaffCapacitySchema.safeParse(capRes.body).success).toBe(true);
    expect(capRes.body.slotsTotal).toBe(9);

    const { agent: tutorAgent } = await loginAs("tutor@learntrack.edu");
    const availRes = await tutorAgent.put("/api/tutors/T-201/availability").send({
      timezone: "Asia/Kolkata",
      slots: [
        {
          id: "SLOT-201-3",
          startIso: "2026-10-16T09:30:00.000Z",
          endIso: "2026-10-16T10:30:00.000Z"
        }
      ]
    });
    expect(availRes.status).toBe(200);
    expect(TutorProfileSchema.safeParse(availRes.body).success).toBe(true);

    const patchSesRes = await tutorAgent.patch("/api/sessions/SES-301").send({ status: "ACCEPTED" });
    expect(patchSesRes.status).toBe(200);
    expect(TutoringSessionSchema.safeParse(patchSesRes.body).success).toBe(true);

    const fbRes = await tutorAgent.post("/api/sessions/SES-301/feedback").send({
      topicsCovered: "Recursion trees and pointer manipulation",
      studentEngagement: "ENGAGED",
      followUpRecommended: false
    });
    expect(fbRes.status).toBe(200);
    expect(TutoringSessionSchema.safeParse(fbRes.body).success).toBe(true);
    expect(fbRes.body.feedbackSubmitted).toBe(true);

    const { agent: mentorAgent } = await loginAs("mentor@learntrack.edu");
    const mtgList = await mentorAgent.get("/api/meetings");
    expect(mtgList.status).toBe(200);
    expect(createPaginatedSchema(MeetingRecordSchema).safeParse(mtgList.body).success).toBe(true);

    const mtgCreate = await mentorAgent.post("/api/meetings").send({
      participantId: "S-104",
      startIso: "2026-10-18T09:00:00.000Z",
      endIso: "2026-10-18T09:30:00.000Z",
      timezone: "Asia/Kolkata",
      caseId: "C-104"
    });
    expect(mtgCreate.status).toBe(201);
    expect(MeetingRecordSchema.safeParse(mtgCreate.body).success).toBe(true);

    const mtgPatch = await mentorAgent.patch("/api/meetings/MTG-401").send({ resync: true });
    expect(mtgPatch.status).toBe(200);
    expect(MeetingRecordSchema.safeParse(mtgPatch.body).success).toBe(true);

    const gStatus = await mentorAgent.get("/api/integrations/google/status");
    expect(gStatus.status).toBe(200);
    expect(GoogleIntegrationStatusSchema.safeParse(gStatus.body).success).toBe(true);

    const gDisc = await mentorAgent.post("/api/integrations/google/disconnect").send({});
    expect(gDisc.status).toBe(200);
    expect(GoogleIntegrationStatusSchema.safeParse(gDisc.body).success).toBe(true);
    expect(gDisc.body.connected).toBe(false);

    const gConn = await mentorAgent.post("/api/integrations/google/connect").send({});
    expect(gConn.status).toBe(200);
    expect(GoogleIntegrationStatusSchema.safeParse(gConn.body).success).toBe(true);
    expect(gConn.body.connected).toBe(true);

    const notifRes = await mentorAgent.get("/api/notifications");
    expect(notifRes.status).toBe(200);
    expect(NotificationsResponseSchema.safeParse(notifRes.body).success).toBe(true);

    const { agent: studentAgent } = await loginAs("student@learntrack.edu");
    const chkCreate = await studentAgent.post("/api/checkins").send({
      contextNote: "Attended peer tutoring session; recursion lab exercises are clearer now.",
      supportRequested: "ACADEMIC_TUTORING",
      optionalSupportDecision: "ACCEPT",
      sharingOptions: [
        { recipientRole: "MENTOR", allowed: true },
        { recipientRole: "FACULTY", allowed: true }
      ]
    });
    expect(chkCreate.status).toBe(201);
    expect(CheckInRecordSchema.safeParse(chkCreate.body).success).toBe(true);

    const consentPatch = await studentAgent.patch("/api/consent").send({
      scope: "CHECKIN_NOTES",
      recipientRole: "MENTOR",
      granted: true
    });
    expect(consentPatch.status).toBe(200);
    expect(ConsentResponseSchema.safeParse(consentPatch.body).success).toBe(true);
  });

  it("15. FastAPI ML adapter maps AcademicObservation records and FastAPI responses into RiskAssessmentSchema", async () => {
    const { prisma } = await import("../src/db.js");
    const {
      buildMlObservations,
      FastApiPredictionRequestSchema,
      FastApiPredictionResponseSchema,
      mapFastApiResponseToAssessment
    } = await import("../src/services/mlAdapter.js");

    // 1. S-104 has 5 weekly attendance anchors (Aug-Sep 2026) -> produces 5 chronological Observation entries without duplicate timestamps
    const s104Rows = await prisma.academicObservation.findMany({
      where: { studentId: "S-104" },
      orderBy: { observedAt: "asc" }
    });
    const mappedObs = buildMlObservations(s104Rows, new Date("2026-10-12T10:15:00.000Z"));
    expect(mappedObs.length).toBe(5);
    expect(new Set(mappedObs.map((o) => o.observedAt)).size).toBe(5);

    const reqPayload = {
      studentId: "S-104",
      subject: "Data Structures & Algorithms",
      asOf: "2026-10-12T10:15:00.000Z",
      observations: mappedObs
    };
    expect(FastApiPredictionRequestSchema.safeParse(reqPayload).success).toBe(true);

    // 2. Map FastAPI "assessed" response into ComputedAssessmentOutput and validate against RiskAssessmentSchema
    const fastApiAssessed = FastApiPredictionResponseSchema.parse({
      studentId: "S-104",
      subject: "Data Structures & Algorithms",
      assessmentStatus: "assessed",
      predictionTarget: "needs_attention_in_subject",
      modelVersion: "synthetic-dsa-v1",
      modelScore: 0.78,
      decisionThreshold: 0.63,
      reviewSuggested: true,
      evidence: [
        "Attendance fell by 38 percentage points over the last 3 weeks.",
        "Latest assessment score is 42.0%."
      ],
      suggestedNextStep: "Schedule a mentor check-in to review recent coursework and attendance barriers.",
      requiresHumanReview: true,
      dataQuality: {
        status: "sufficient",
        reasons: [],
        observation_count: 4
      },
      limitations: [
        "Trained and evaluated only on fictional synthetic data.",
        "A review signal is not a diagnosis or final intervention decision."
      ],
      computedAt: "2026-03-08T10:15:00.000Z",
      source: "ml_model"
    });

    const mappedAssessed = mapFastApiResponseToAssessment(fastApiAssessed, null, -38, 42);
    expect(mappedAssessed.sourceMode).toBe("ML");
    expect(mappedAssessed.signalCategory).toBe("NEEDS_ATTENTION");
    expect(mappedAssessed.modelVersion).toBe("synthetic-dsa-v1");
    expect(mappedAssessed.limitations).toContain("fictional synthetic data");

    // 3. Map FastAPI "insufficient_data" response without inventing a score
    const fastApiInsufficient = FastApiPredictionResponseSchema.parse({
      studentId: "S-107",
      subject: "Data Structures & Algorithms",
      assessmentStatus: "insufficient_data",
      predictionTarget: "needs_attention_in_subject",
      modelVersion: "synthetic-dsa-v1",
      modelScore: null,
      decisionThreshold: 0.63,
      reviewSuggested: false,
      evidence: [],
      suggestedNextStep: "Collect at least 4 observations before generating a model score.",
      requiresHumanReview: true,
      dataQuality: {
        status: "insufficient",
        reasons: ["fewer_than_4_observations_in_window"],
        observation_count: 0
      },
      limitations: [
        "Trained and evaluated only on fictional synthetic data."
      ],
      computedAt: "2026-03-08T10:15:00.000Z",
      source: "insufficient_data_guard"
    });

    const mappedInsufficient = mapFastApiResponseToAssessment(fastApiInsufficient, null, 0, 100);
    expect(mappedInsufficient.signalCategory).toBe("INSUFFICIENT_DATA");
    expect(mappedInsufficient.sourceMode).toBe("UNAVAILABLE");
    expect(mappedInsufficient.needsAttention).toBe(false);
    expect(mappedInsufficient.score).toBe(0);
  });
});

