import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";
import { env } from "../src/config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seedDatabase() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed synthetic demo data when NODE_ENV=production.");
  }

  const fixturesDir = path.resolve(__dirname, "../../../fixtures");
  const seedDataPath = path.join(fixturesDir, "seed-data.json");
  const c104Path = path.join(fixturesDir, "C-104.json");

  const seedJson = JSON.parse(fs.readFileSync(seedDataPath, "utf-8"));
  const c104Json = JSON.parse(fs.readFileSync(c104Path, "utf-8"));

  // Clean existing tables in dependency order
  await prisma.sessionFeedback.deleteMany();
  await prisma.tutoringSession.deleteMany();
  await prisma.tutorAvailability.deleteMany();
  await prisma.tutorEligibility.deleteMany();
  await prisma.tutorProfile.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.studentCheckIn.deleteMany();
  await prisma.outcomeReview.deleteMany();
  await prisma.actionEvidence.deleteMany();
  await prisma.caseEvent.deleteMany();
  await prisma.supportCase.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.academicObservation.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.student.deleteMany();
  await prisma.pastCaseOutcome.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(env.DEMO_PASSWORD, 10);

  // 1. Seed Users (matching DEMO_USERS in frontend)
  const usersToCreate = [
    {
      id: "STAFF-MENTOR-1",
      email: "mentor@learntrack.edu",
      name: "Dr. Priya Nair",
      roles: ["MENTOR", "FACULTY"],
    },
    {
      id: "STAFF-HOD-1",
      email: "hod@learntrack.edu",
      name: "Prof. Rajesh Iyer",
      roles: ["HOD", "FACULTY", "ADMIN"],
    },
    {
      id: "STAFF-COUNSELLOR-1",
      email: "counsellor@learntrack.edu",
      name: "Ananya Sen",
      roles: ["COUNSELLOR"],
    },
    {
      id: "STAFF-FINANCE-1",
      email: "finance@learntrack.edu",
      name: "Karthik Menon",
      roles: ["FINANCE"],
    },
    {
      id: "USER-S-104",
      email: "student@learntrack.edu",
      name: "Aarav Sharma",
      roles: ["STUDENT"],
    },
    {
      id: "USER-TUTOR-1",
      email: "tutor@learntrack.edu",
      name: "Divya Subramanian",
      roles: ["STUDENT", "PEER_TUTOR"],
    },
  ];

  for (const u of usersToCreate) {
    await prisma.user.create({
      data: {
        id: u.id,
        email: u.email,
        passwordHash,
        name: u.name,
        rolesJson: JSON.stringify(u.roles),
        status: "ACTIVE",
        preferredLanguage: "en",
        synthetic: true,
      },
    });
  }

  // 2. Seed Staff Profiles (capacities 7/8, 6/6, 4/10, 2/5)
  const staffCapacities = [
    {
      id: "STAFF-MENTOR-1",
      userId: "STAFF-MENTOR-1",
      name: "Dr. Priya Nair",
      role: "MENTOR",
      slotsUsed: 7,
      capacitySlots: 8,
    },
    {
      id: "STAFF-COUNSELLOR-1",
      userId: "STAFF-COUNSELLOR-1",
      name: "Ananya Sen",
      role: "COUNSELLOR",
      slotsUsed: 6,
      capacitySlots: 6,
    },
    {
      id: "STAFF-FINANCE-1",
      userId: "STAFF-FINANCE-1",
      name: "Karthik Menon",
      role: "FINANCE",
      slotsUsed: 4,
      capacitySlots: 10,
    },
    {
      id: "STAFF-HOD-1",
      userId: "STAFF-HOD-1",
      name: "Prof. Rajesh Iyer",
      role: "HOD",
      slotsUsed: 2,
      capacitySlots: 5,
    },
  ];

  for (const sp of staffCapacities) {
    await prisma.staffProfile.create({ data: sp });
  }

  // 3. Seed Students S-104 to S-107 from /fixtures/seed-data.json
  const rawStudents = seedJson.students;
  for (const studentId of ["S-104", "S-105", "S-106", "S-107"]) {
    const s = rawStudents[studentId];
    const linkedUserId =
      studentId === "S-104"
        ? "USER-S-104"
        : studentId === "S-105"
        ? "USER-TUTOR-1"
        : null;

    const feeObj =
      s.fees && !s.fees.restricted ? s.fees : null;
    const counsObj =
      s.counselling && !s.counselling.restricted ? s.counselling : null;

    await prisma.student.create({
      data: {
        id: s.id,
        studentCode: s.id,
        userId: linkedUserId,
        name: s.name,
        email: s.email,
        cohort: s.cohort,
        course: s.department,
        semester: s.semester,
        mentorName: s.mentorName,
        hasRecentObservations: Boolean(s.hasRecentObservations),
        feeStatus: feeObj?.status ?? null,
        feeDueDate: feeObj?.dueDate ?? null,
        feeNote: feeObj?.note ?? null,
        counsellingStatus: counsObj?.referralStatus ?? (studentId === "S-105" ? "NONE" : null),
        counsellingUpdatedAt: counsObj?.lastUpdated ?? null,
        counsellingNote: counsObj?.summaryNote ?? null,
        synthetic: true,
      },
    });

    // Attendance observations
    for (const pt of s.attendance ?? []) {
      await prisma.academicObservation.create({
        data: {
          studentId: s.id,
          subject: s.cohort.startsWith("ECE") ? "Signal Processing" : "Data Structures & Algorithms",
          type: "ATTENDANCE",
          period: pt.period,
          value: pt.value,
          observedAt: new Date(pt.timestamp),
          source: "LMS",
        },
      });
    }

    // Marks observations
    for (const pt of s.marks ?? []) {
      await prisma.academicObservation.create({
        data: {
          studentId: s.id,
          subject: s.cohort.startsWith("ECE") ? "Signal Processing" : "Data Structures & Algorithms",
          type: "MARKS",
          period: pt.period,
          value: pt.value,
          observedAt: new Date(pt.timestamp),
          source: "LMS",
        },
      });
    }

    // Participation observations
    for (const pt of s.participation ?? []) {
      await prisma.academicObservation.create({
        data: {
          studentId: s.id,
          subject: "General",
          type: "PARTICIPATION",
          period: pt.period,
          value: pt.value,
          observedAt: new Date(pt.timestamp),
          source: "LMS",
        },
      });
    }

    // Skills observations
    for (const pt of s.skills ?? []) {
      await prisma.academicObservation.create({
        data: {
          studentId: s.id,
          subject: "Competency",
          type: "SKILLS",
          period: pt.period,
          value: pt.value,
          observedAt: new Date(pt.timestamp),
          source: "SKILL_PORTAL",
        },
      });
    }

    // Fees trend
    for (const pt of feeObj?.trend ?? []) {
      await prisma.academicObservation.create({
        data: {
          studentId: s.id,
          subject: "Tuition",
          type: "FEES_TREND",
          period: pt.period,
          value: pt.value,
          observedAt: new Date(pt.timestamp),
          source: "FINANCE",
        },
      });
    }

    // Faculty feedback
    for (const fb of s.facultyFeedback ?? []) {
      await prisma.academicObservation.create({
        data: {
          id: fb.id,
          studentId: s.id,
          subject: fb.subject,
          type: "FACULTY_FEEDBACK",
          period: "Current",
          observedAt: new Date(fb.date),
          source: "FACULTY",
          note: fb.observation,
          authorRole: fb.authorRole,
          rating: fb.engagementRating ?? 3,
        },
      });
    }
  }

  // History events
  const historySeed = [
    {
      id: "H-1",
      studentId: "S-104",
      observedAt: new Date("2026-09-08T16:00:00.000Z"),
      historyCat: "CASE",
      period: "Support case C-104 opened",
      note: "Flagged for human review following midterm and attendance changes.",
    },
    {
      id: "H-2",
      studentId: "S-104",
      observedAt: new Date("2026-09-06T09:00:00.000Z"),
      historyCat: "CHECKIN",
      period: "Student check-in submitted",
      note: "Student shared commute schedule context and requested peer tutoring.",
    },
    {
      id: "H-3",
      studentId: "S-104",
      observedAt: new Date("2026-09-02T11:00:00.000Z"),
      historyCat: "ACADEMIC",
      period: "Midterm assessment recorded",
      note: "Data Structures & Algorithms midterm score recorded (54%).",
    },
    {
      id: "H-105-1",
      studentId: "S-105",
      observedAt: new Date("2026-09-05T09:00:00.000Z"),
      historyCat: "SUPPORT",
      period: "Fee installment coordination",
      note: "Scholarship renewal timeline logged with Finance office.",
    },
    {
      id: "H-106-1",
      studentId: "S-106",
      observedAt: new Date("2026-09-06T18:20:00.000Z"),
      historyCat: "CHECKIN",
      period: "Student check-in submitted",
      note: "Requested mentor review for lab schedule balancing.",
    },
  ];
  for (const h of historySeed) {
    await prisma.academicObservation.create({
      data: {
        id: h.id,
        studentId: h.studentId,
        subject: "History",
        type: "HISTORY_EVENT",
        period: h.period,
        observedAt: h.observedAt,
        note: h.note,
        historyCat: h.historyCat,
      },
    });
  }

  // 4. Seed Risk Assessments for S-104, S-105, S-106, S-107
  await prisma.riskAssessment.create({
    data: {
      id: "ASM-104-1",
      studentId: "S-104",
      modelVersion: "lt-ordinal-v2.4.1",
      score: 0.78,
      needsAttention: true,
      signalCategory: "NEEDS_ATTENTION",
      attentionSummary: "Needs attention — recent shift in lab attendance and midterm performance",
      source: "ML",
      limitations:
        "Trained on historical cohort patterns; cannot observe external personal obligations unless shared by the student. Does not predict individual outcomes.",
      observedJson: JSON.stringify([
        {
          id: "OBS-1",
          label: "Attendance trend (Weeks 1–5)",
          detail: "Decreased from 92% in Week 1 to 60% in Week 5 (-32 percentage points).",
          direction: "CONCERN",
        },
        {
          id: "OBS-2",
          label: "Midterm marks in Data Structures",
          detail: "Midterm score of 54% compared to Quiz 1 baseline of 78%.",
          direction: "CONCERN",
        },
      ]),
      modelExplanationJson: JSON.stringify([
        {
          id: "EXP-1",
          label: "Multi-week attendance delta",
          detail: "Primary contributor to attention indicator based on 3-week rolling window.",
          direction: "CONCERN",
        },
        {
          id: "EXP-2",
          label: "Prior semester baseline",
          detail: "Consistent Sem 3–4 completion (76% skills score) acts as a protective factor.",
          direction: "PROTECTIVE",
        },
      ]),
      hypothesisedJson: JSON.stringify([
        {
          id: "HYP-1",
          label: "Hypothesis: Schedule or transit conflict with morning lab slots",
          detail: "Missed sessions cluster in 8:30 AM lab blocks; requires conversation to verify.",
          direction: "NEUTRAL",
        },
        {
          id: "HYP-2",
          label: "Hypothesis: Conceptual gap in pointer/recursion modules",
          detail: "Midterm subsections show lower completion on recursion problems.",
          direction: "NEUTRAL",
        },
      ]),
      studentConfirmedJson: JSON.stringify([
        {
          id: "CTX-1",
          label: "Check-in (6 Sep 2026)",
          detail: "Commute schedule changed this month; requested peer tutoring for Data Structures.",
          direction: "NEUTRAL",
        },
      ]),
      createdAt: new Date("2026-09-08T15:45:00.000Z"),
      synthetic: true,
    },
  });

  await prisma.riskAssessment.create({
    data: {
      id: "ASM-105-1",
      studentId: "S-105",
      modelVersion: "rule-fallback-v1.0",
      score: 0.4,
      needsAttention: true,
      signalCategory: "MONITOR",
      attentionSummary: "Needs attention — administrative fee support follow-up",
      source: "FALLBACK",
      limitations:
        "Rule-based checklist fallback used while ML scoring service was skipped for administrative-only flag.",
      observedJson: JSON.stringify([
        {
          id: "OBS-105-1",
          label: "Fee installment status",
          detail: "Scholarship renewal documentation pending verification.",
          direction: "NEUTRAL",
        },
      ]),
      modelExplanationJson: JSON.stringify([
        {
          id: "EXP-105-1",
          label: "Academic stability",
          detail: "Attendance (88%) and Midterm (79%) remain strong.",
          direction: "PROTECTIVE",
        },
      ]),
      hypothesisedJson: JSON.stringify([
        {
          id: "HYP-105-1",
          label: "Hypothesis: Administrative processing delay on scholarship renewal",
          detail: "Requires Finance office verification, not academic remediation.",
          direction: "NEUTRAL",
        },
      ]),
      studentConfirmedJson: JSON.stringify({
        restricted: true,
        reason: "Restricted by role or consent",
      }),
      createdAt: new Date("2026-09-07T12:00:00.000Z"),
      synthetic: true,
    },
  });

  await prisma.riskAssessment.create({
    data: {
      id: "ASM-106-1",
      studentId: "S-106",
      modelVersion: "lt-ordinal-v2.4.1",
      score: 0.69,
      needsAttention: true,
      signalCategory: "NEEDS_ATTENTION",
      attentionSummary: "Needs attention — lab workload and attendance dip",
      source: "ML",
      limitations:
        "Observational indicator only; lab submission extensions are not automatically weighted.",
      observedJson: JSON.stringify([
        {
          id: "OBS-106-1",
          label: "Attendance in Signal Processing",
          detail: "Moved from 86% to 64% over 4 weeks.",
          direction: "CONCERN",
        },
      ]),
      modelExplanationJson: JSON.stringify([
        {
          id: "EXP-106-1",
          label: "Concurrent lab load",
          detail: "Three lab courses scheduled in Semester 5.",
          direction: "CONCERN",
        },
      ]),
      hypothesisedJson: JSON.stringify([
        {
          id: "HYP-106-1",
          label: "Hypothesis: Overlapping project submission deadlines",
          detail: "Unconfirmed hypothesis based on course calendar density.",
          direction: "NEUTRAL",
        },
      ]),
      studentConfirmedJson: JSON.stringify([
        {
          id: "CTX-106-1",
          label: "Check-in (6 Sep 2026)",
          detail: "Requested mentor check-in regarding lab workload pacing.",
          direction: "NEUTRAL",
        },
      ]),
      createdAt: new Date("2026-09-08T10:00:00.000Z"),
      synthetic: true,
    },
  });

  await prisma.riskAssessment.create({
    data: {
      id: "ASM-107-1",
      studentId: "S-107",
      modelVersion: "lt-ordinal-v2.4.1",
      score: 0.0,
      needsAttention: false,
      signalCategory: "INSUFFICIENT_DATA",
      attentionSummary: "No recent observations available to compute an indicator",
      source: "UNAVAILABLE",
      limitations:
        "Minimum observation threshold not met for Semester 3 transfer cohort. Manual review option is available.",
      observedJson: JSON.stringify([]),
      modelExplanationJson: JSON.stringify([]),
      hypothesisedJson: JSON.stringify([]),
      studentConfirmedJson: JSON.stringify(null),
      createdAt: new Date("2026-09-08T10:00:00.000Z"),
      synthetic: true,
    },
  });

  // 5. Seed Support Cases C-104, C-105, C-106
  await prisma.supportCase.create({
    data: {
      id: c104Json.id,
      caseCode: c104Json.id,
      studentId: c104Json.studentId,
      studentName: c104Json.studentName,
      cohort: c104Json.cohort,
      assessmentId: "ASM-104-1",
      suggestedAction: c104Json.recommendedIntervention,
      approvedAction: c104Json.selectedIntervention,
      ownerId: c104Json.ownerId,
      ownerName: c104Json.ownerName,
      ownerRole: c104Json.ownerRole,
      priority: 1,
      status: c104Json.status,
      deadline: new Date("2026-10-14T12:00:00.000Z"), // Within 3 days -> DUE_SOON
      plainLanguageReason: c104Json.plainLanguageReason,
      overrideReason: null,
      escalatedToHod: true,
      version: c104Json.version,
      synthetic: true,
      createdAt: new Date(c104Json.createdAt),
      updatedAt: new Date(c104Json.updatedAt),
    },
  });

  await prisma.supportCase.create({
    data: {
      id: "C-105",
      caseCode: "C-105",
      studentId: "S-105",
      studentName: "Meera Krishnan",
      cohort: "CS-2024-A",
      assessmentId: "ASM-105-1",
      suggestedAction: "FEE_SUPPORT",
      approvedAction: "FEE_SUPPORT",
      ownerId: "STAFF-FINANCE-1",
      ownerName: "Karthik Menon",
      ownerRole: "FINANCE",
      priority: 3,
      status: "IN_PROGRESS",
      deadline: new Date("2026-10-25T12:00:00.000Z"), // ON_TIME
      plainLanguageReason:
        "Scholarship renewal documentation coordination with Finance support desk.",
      overrideReason: null,
      escalatedToHod: false,
      version: 2,
      synthetic: true,
      createdAt: new Date("2026-09-05T09:00:00.000Z"),
      updatedAt: new Date("2026-09-10T11:00:00.000Z"),
    },
  });

  await prisma.supportCase.create({
    data: {
      id: "C-106",
      caseCode: "C-106",
      studentId: "S-106",
      studentName: "Rohan Deshmukh",
      cohort: "ECE-2024-B",
      assessmentId: "ASM-106-1",
      suggestedAction: "MENTOR",
      approvedAction: "MENTOR",
      ownerId: "STAFF-MENTOR-1",
      ownerName: "Dr. Priya Nair",
      ownerRole: "MENTOR",
      priority: 2,
      status: "ASSIGNED",
      deadline: new Date("2026-10-05T12:00:00.000Z"), // Past -> OVERDUE
      plainLanguageReason:
        "Coursework pacing check-in requested for Signal Processing lab workload.",
      overrideReason: null,
      escalatedToHod: true,
      version: 1,
      synthetic: true,
      createdAt: new Date("2026-09-04T10:00:00.000Z"),
      updatedAt: new Date("2026-09-09T14:00:00.000Z"),
    },
  });

  // Seed Evidence & CaseEvents
  await prisma.actionEvidence.create({
    data: {
      id: "EV-101",
      caseId: "C-104",
      authorId: "STAFF-MENTOR-1",
      authorName: "Dr. Priya Nair",
      authorRole: "MENTOR",
      type: "ATTENDANCE_VERIFICATION",
      note: "Verified lab attendance logs for Weeks 3-5 with course instructor.",
      date: "2026-09-08",
      createdAt: new Date("2026-09-08T16:30:00.000Z"),
    },
  });

  const timelineEvents = [
    {
      id: "TL-104-1",
      caseId: "C-104",
      actorId: "STAFF-HOD-1",
      actorName: "System Queue",
      actorRole: "ADMIN",
      action: "CREATED",
      fromStatus: null,
      toStatus: "NEEDS_REVIEW",
      summary: "Case C-104 created for human review",
      metadata: "Initial recommendation: PEER_TUTOR (awaiting human decision).",
      createdAt: new Date("2026-09-08T16:00:00.000Z"),
    },
    {
      id: "TL-104-2",
      caseId: "C-104",
      actorId: "STAFF-MENTOR-1",
      actorName: "Dr. Priya Nair",
      actorRole: "MENTOR",
      action: "EVIDENCE_ADDED",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "NEEDS_REVIEW",
      summary: "Added structured evidence (ATTENDANCE_VERIFICATION)",
      metadata: "Verified lab attendance logs for Weeks 3-5 with course instructor.",
      createdAt: new Date("2026-09-08T16:30:00.000Z"),
    },
    {
      id: "TL-104-3",
      caseId: "C-104",
      actorId: "STAFF-HOD-1",
      actorName: "Prof. Rajesh Iyer",
      actorRole: "HOD",
      action: "ESCALATED",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "NEEDS_REVIEW",
      summary: "Escalated to HOD for staff follow-up",
      metadata: "Ensuring timely mentor capacity allocation this week.",
      createdAt: new Date("2026-09-09T08:30:00.000Z"),
    },
    {
      id: "TL-105-1",
      caseId: "C-105",
      actorId: "STAFF-FINANCE-1",
      actorName: "Karthik Menon",
      actorRole: "FINANCE",
      action: "CREATED",
      fromStatus: null,
      toStatus: "IN_PROGRESS",
      summary: "Fee support coordination started",
      metadata: "Assigned to Finance support officer.",
      createdAt: new Date("2026-09-05T09:00:00.000Z"),
    },
    {
      id: "TL-106-1",
      caseId: "C-106",
      actorId: "STAFF-MENTOR-1",
      actorName: "Dr. Priya Nair",
      actorRole: "MENTOR",
      action: "ASSIGNED",
      fromStatus: "NEEDS_REVIEW",
      toStatus: "ASSIGNED",
      summary: "Assigned to Dr. Priya Nair",
      metadata: "Scheduled for mentor review.",
      createdAt: new Date("2026-09-04T10:00:00.000Z"),
    },
    {
      id: "TL-106-2",
      caseId: "C-106",
      actorId: "STAFF-HOD-1",
      actorName: "Prof. Rajesh Iyer",
      actorRole: "HOD",
      action: "ESCALATED",
      fromStatus: "ASSIGNED",
      toStatus: "ASSIGNED",
      summary: "Escalated to HOD for staff follow-up",
      metadata: "Follow-up reminder for staff scheduling.",
      createdAt: new Date("2026-09-09T14:00:00.000Z"),
    },
  ];
  for (const ev of timelineEvents) {
    await prisma.caseEvent.create({ data: ev });
  }

  // 6. Seed PastCaseOutcome rows to reproduce exact recommendation counts for C-104:
  // PEER_TUTOR: 19/26, MENTOR: 22/31, REMEDIAL: 6/11, FEE_SUPPORT: 2/4, COUNSELLING_REFERRAL: 8/14, PLACEMENT_READINESS: 3/5, PARENT_MEETING: 1/3
  const pastOutcomesDistribution: Array<{
    type: string;
    improved: number;
    total: number;
  }> = [
    { type: "PEER_TUTOR", improved: 19, total: 26 },
    { type: "MENTOR", improved: 22, total: 31 },
    { type: "REMEDIAL", improved: 6, total: 11 },
    { type: "FEE_SUPPORT", improved: 2, total: 4 },
    { type: "COUNSELLING_REFERRAL", improved: 8, total: 14 },
    { type: "PLACEMENT_READINESS", improved: 3, total: 5 },
    { type: "PARENT_MEETING", improved: 1, total: 3 },
  ];

  for (const dist of pastOutcomesDistribution) {
    for (let i = 0; i < dist.total; i++) {
      await prisma.pastCaseOutcome.create({
        data: {
          interventionType: dist.type,
          similarityKey: "CS_ATTENDANCE_MARKS",
          improved: i < dist.improved,
          synthetic: true,
        },
      });
    }
  }

  // 7. Seed Check-ins & Consents
  await prisma.studentCheckIn.create({
    data: {
      id: "CHK-101",
      studentId: "S-104",
      contextNote:
        "Commute schedule changed this month and balancing part-time family responsibilities; would welcome peer tutoring in Data Structures.",
      supportRequested: "ACADEMIC_TUTORING",
      optionalSupportDecision: "ACCEPT",
      sharingOptionsJson: JSON.stringify([
        { recipientRole: "MENTOR", allowed: true },
        { recipientRole: "FACULTY", allowed: true },
        { recipientRole: "COUNSELLOR", allowed: false },
        { recipientRole: "FINANCE", allowed: false },
      ]),
      createdAt: new Date("2026-09-06T09:00:00.000Z"),
    },
  });

  await prisma.studentCheckIn.create({
    data: {
      id: "CHK-106",
      studentId: "S-106",
      contextNote:
        "Managing high project load across three labs; requested mentor check-in.",
      supportRequested: "MENTOR_CHECKIN",
      optionalSupportDecision: "ACCEPT",
      sharingOptionsJson: JSON.stringify([
        { recipientRole: "MENTOR", allowed: true },
        { recipientRole: "FACULTY", allowed: false },
        { recipientRole: "COUNSELLOR", allowed: true },
        { recipientRole: "FINANCE", allowed: false },
      ]),
      createdAt: new Date("2026-09-06T18:20:00.000Z"),
    },
  });

  const consentsSeed = [
    {
      id: "CON-1",
      studentId: "S-104",
      scope: "CHECKIN_NOTES",
      scopeLabel: "Self Check-in Context Notes",
      recipientRole: "MENTOR",
      granted: true,
      updatedAt: new Date("2026-09-06T09:00:00.000Z"),
    },
    {
      id: "CON-2",
      studentId: "S-104",
      scope: "CHECKIN_NOTES",
      scopeLabel: "Self Check-in Context Notes",
      recipientRole: "FACULTY",
      granted: true,
      updatedAt: new Date("2026-09-06T09:00:00.000Z"),
    },
    {
      id: "CON-3",
      studentId: "S-104",
      scope: "COUNSELLING_REFERRAL_STATUS",
      scopeLabel: "Counselling Referral Status",
      recipientRole: "MENTOR",
      granted: false,
      updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
    {
      id: "CON-4",
      studentId: "S-104",
      scope: "FINANCIAL_SUPPORT_STATUS",
      scopeLabel: "Financial Support & Installment Status",
      recipientRole: "MENTOR",
      granted: true,
      updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
    {
      id: "CON-5",
      studentId: "S-104",
      scope: "ATTENDANCE_AND_MARKS",
      scopeLabel: "Academic Attendance & Marks Summary",
      recipientRole: "PEER_TUTOR",
      granted: true,
      updatedAt: new Date("2026-09-06T09:00:00.000Z"),
    },
    // S-105 revokes CHECKIN_NOTES and COUNSELLING_REFERRAL_STATUS for MENTOR/FACULTY so S-105 renders restricted
    {
      id: "CON-105-1",
      studentId: "S-105",
      scope: "CHECKIN_NOTES",
      scopeLabel: "Self Check-in Context Notes",
      recipientRole: "MENTOR",
      granted: false,
      updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
    {
      id: "CON-105-2",
      studentId: "S-105",
      scope: "COUNSELLING_REFERRAL_STATUS",
      scopeLabel: "Counselling Referral Status",
      recipientRole: "MENTOR",
      granted: false,
      updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
  ];
  for (const c of consentsSeed) {
    await prisma.consentRecord.create({ data: c });
  }

  // 8. Seed Tutors (T-201 verified, T-202 verified, T-203 unverified) & Sessions
  await prisma.tutorProfile.create({
    data: {
      id: "T-201",
      userId: "USER-TUTOR-1",
      name: "Divya Subramanian",
      cohort: "CS-2023-A",
      isVerified: true,
      timezone: "Asia/Kolkata",
      activeSessionsCount: 2,
      maxWeeklySessions: 5,
      eligibilities: {
        create: [
          { subject: "Data Structures & Algorithms", status: "VERIFIED" },
          { subject: "Operating Systems", status: "VERIFIED" },
          { subject: "Database Systems", status: "VERIFIED" },
        ],
      },
      slots: {
        create: [
          {
            id: "SLOT-201-1",
            startIso: "2026-10-14T10:30:00.000Z",
            endIso: "2026-10-14T11:30:00.000Z",
            isBooked: false,
          },
          {
            id: "SLOT-201-2",
            startIso: "2026-10-15T11:00:00.000Z",
            endIso: "2026-10-15T12:00:00.000Z",
            isBooked: true,
          },
          {
            id: "SLOT-201-3",
            startIso: "2026-10-16T09:30:00.000Z",
            endIso: "2026-10-16T10:30:00.000Z",
            isBooked: false,
          },
        ],
      },
    },
  });

  await prisma.tutorProfile.create({
    data: {
      id: "T-202",
      name: "Nikhil Verma",
      cohort: "ECE-2023-A",
      isVerified: true,
      timezone: "Asia/Kolkata",
      activeSessionsCount: 1,
      maxWeeklySessions: 4,
      eligibilities: {
        create: [
          { subject: "Signal Processing", status: "VERIFIED" },
          { subject: "Data Structures & Algorithms", status: "VERIFIED" },
        ],
      },
      slots: {
        create: [
          {
            id: "SLOT-202-1",
            startIso: "2026-10-14T14:00:00.000Z",
            endIso: "2026-10-14T15:00:00.000Z",
            isBooked: false,
          },
        ],
      },
    },
  });

  await prisma.tutorProfile.create({
    data: {
      id: "T-203",
      name: "Unverified Candidate",
      cohort: "CS-2024-B",
      isVerified: false,
      timezone: "Asia/Kolkata",
      activeSessionsCount: 0,
      maxWeeklySessions: 3,
      eligibilities: {
        create: [{ subject: "Data Structures & Algorithms", status: "PENDING" }],
      },
    },
  });

  await prisma.tutoringSession.create({
    data: {
      id: "SES-301",
      tutorId: "T-201",
      tutorName: "Divya Subramanian",
      studentId: "S-104",
      studentName: "Aarav Sharma",
      subject: "Data Structures & Algorithms",
      slotId: "SLOT-201-2",
      startIso: "2026-10-15T11:00:00.000Z",
      endIso: "2026-10-15T12:00:00.000Z",
      status: "REQUESTED",
      caseId: "C-104",
      academicGoalNote: "Review recursion trees and graph traversal exercises.",
      feedbackSubmitted: false,
    },
  });

  // 9. Seed Meetings & Notifications
  await prisma.meeting.create({
    data: {
      id: "MTG-401",
      title: "Academic Advising Sync",
      organiserId: "STAFF-MENTOR-1",
      organiserName: "Dr. Priya Nair",
      participantIds: JSON.stringify(["S-104"]),
      participantNames: JSON.stringify(["Aarav Sharma"]),
      startIso: "2026-10-14T09:00:00.000Z",
      endIso: "2026-10-14T09:30:00.000Z",
      timezone: "Asia/Kolkata",
      syncStatus: "SYNCED",
      integrationMode: "MOCK",
      locationOrLink: "Room 302 / Meet Link (Mock)",
      caseId: "C-104",
    },
  });

  const notificationsSeed = [
    {
      id: "NOTIF-1",
      recipientId: "STAFF-MENTOR-1",
      title: "Case C-104 awaiting review",
      summary:
        "Aarav Sharma (CS-2024-A) has a new check-in and recommendation ready for review.",
      channel: "EMAIL",
      status: "SENT",
      createdAt: new Date("2026-10-12T08:15:00.000Z"),
    },
    {
      id: "NOTIF-2",
      recipientId: "STAFF-MENTOR-1",
      title: "Meeting invite queued",
      summary: "Calendar invitation for Academic Advising Sync.",
      channel: "EMAIL",
      status: "PENDING",
      createdAt: new Date("2026-10-12T09:30:00.000Z"),
    },
    {
      id: "NOTIF-3",
      recipientId: "STAFF-MENTOR-1",
      title: "SMS digest skipped",
      summary: "Secondary notification channel cancelled by user preference.",
      channel: "IN_APP",
      status: "CANCELLED",
      createdAt: new Date("2026-10-11T17:00:00.000Z"),
    },
  ];
  for (const n of notificationsSeed) {
    await prisma.notification.create({ data: n });
  }
}

// Run directly when executed via `tsx prisma/seed.ts`
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  seedDatabase()
    .then(async () => {
      console.log(
        JSON.stringify({
          level: "info",
          msg: "Database seeded deterministically with synthetic data.",
        })
      );
      await prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

