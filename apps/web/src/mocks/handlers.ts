import { http, HttpResponse } from "msw";
import {
  User,
  Role,
  StaffCapacity,
  QueueItem,
  Student360,
  StudentHistoryEvent,
  RiskAssessment,
  RecommendationItem,
  CaseDetail,
  CaseTimelineEntry,
  TutorProfile,
  TutoringSession,
  MeetingRecord,
  GoogleIntegrationStatus,
  NotificationItem,
  CheckInRecord,
  ConsentGrant,
} from "@learntrack/contracts";
import seedData from "@fixtures/seed-data.json";
import c104Fixture from "@fixtures/C-104.json";

export const DEMO_USERS: Record<string, User & { email: string }> = {
  "mentor@learntrack.edu": {
    id: "STAFF-MENTOR-1",
    name: "Dr. Priya Nair",
    email: "mentor@learntrack.edu",
    roles: ["MENTOR", "FACULTY"],
    staffId: "STAFF-MENTOR-1",
    synthetic: true,
  },
  "hod@learntrack.edu": {
    id: "STAFF-HOD-1",
    name: "Prof. Rajesh Iyer",
    email: "hod@learntrack.edu",
    roles: ["HOD", "FACULTY", "ADMIN"],
    staffId: "STAFF-HOD-1",
    synthetic: true,
  },
  "counsellor@learntrack.edu": {
    id: "STAFF-COUNSELLOR-1",
    name: "Ananya Sen",
    email: "counsellor@learntrack.edu",
    roles: ["COUNSELLOR"],
    staffId: "STAFF-COUNSELLOR-1",
    synthetic: true,
  },
  "finance@learntrack.edu": {
    id: "STAFF-FINANCE-1",
    name: "Karthik Menon",
    email: "finance@learntrack.edu",
    roles: ["FINANCE"],
    staffId: "STAFF-FINANCE-1",
    synthetic: true,
  },
  "student@learntrack.edu": {
    id: "USER-S-104",
    name: "Aarav Sharma",
    email: "student@learntrack.edu",
    roles: ["STUDENT"],
    studentId: "S-104",
    synthetic: true,
  },
  "tutor@learntrack.edu": {
    id: "USER-TUTOR-1",
    name: "Divya Subramanian",
    email: "tutor@learntrack.edu",
    roles: ["STUDENT", "PEER_TUTOR"],
    studentId: "S-105",
    tutorId: "T-201",
    synthetic: true,
  },
};

interface MockDbState {
  currentUser: User | null;
  staffCapacities: StaffCapacity[];
  students: Record<string, Student360>;
  histories: Record<string, StudentHistoryEvent[]>;
  assessments: Record<string, RiskAssessment>;
  cases: Record<string, CaseDetail>;
  timelines: Record<string, CaseTimelineEntry[]>;
  recommendations: Record<string, RecommendationItem[]>;
  tutors: Record<string, TutorProfile>;
  sessions: TutoringSession[];
  meetings: MeetingRecord[];
  googleStatus: GoogleIntegrationStatus;
  notifications: NotificationItem[];
  checkIns: Record<string, CheckInRecord>;
  consents: ConsentGrant[];
}

function buildInitialState(): MockDbState {
  const rawStudents = seedData.students as unknown as Record<string, Student360>;
  const studentsCopy: Record<string, Student360> = JSON.parse(
    JSON.stringify(rawStudents)
  );

  const c104: CaseDetail = {
    ...(c104Fixture as unknown as Omit<CaseDetail, "allowedTransitions">),
    allowedTransitions: [
      { action: "APPROVE", allowed: true },
      { action: "OVERRIDE", allowed: true },
      { action: "DEFER", allowed: true },
      { action: "DECLINE", allowed: true },
      {
        action: "COMPLETE_ACTION",
        allowed: false,
        reasonIfDisabled: "Case must be approved and assigned before completing action.",
      },
      {
        action: "CLOSE",
        allowed: false,
        reasonIfDisabled: "Outcome review must be recorded before closing a case.",
      },
    ],
    evidence: [
      {
        id: "EV-101",
        caseId: "C-104",
        type: "ATTENDANCE_VERIFICATION",
        note: "Verified lab attendance logs for Weeks 3-5 with course instructor.",
        date: "2026-09-08",
        authorName: "Dr. Priya Nair",
        authorRole: "MENTOR",
        createdAt: "2026-09-08T16:30:00.000Z",
      },
    ],
    outcome: null,
    escalatedToHod: true,
    synthetic: true,
  };

  const c105: CaseDetail = {
    id: "C-105",
    studentId: "S-105",
    studentName: "Meera Krishnan",
    cohort: "CS-2024-A",
    status: "IN_PROGRESS",
    deadlineStatus: "ON_TIME",
    deadline: "2026-10-22T12:00:00.000Z",
    ownerId: "STAFF-FINANCE-1",
    ownerName: "Karthik Menon",
    ownerRole: "FINANCE",
    recommendedIntervention: "FEE_SUPPORT",
    selectedIntervention: "FEE_SUPPORT",
    overrideReason: null,
    plainLanguageReason: "Scholarship renewal documentation coordination with Finance support desk.",
    version: 2,
    updatedAt: "2026-09-10T11:00:00.000Z",
    createdAt: "2026-09-05T09:00:00.000Z",
    allowedTransitions: [
      { action: "APPROVE", allowed: false, reasonIfDisabled: "Case is already in progress." },
      { action: "OVERRIDE", allowed: true },
      { action: "DEFER", allowed: true },
      { action: "DECLINE", allowed: false, reasonIfDisabled: "Cannot decline an active in-progress case." },
      { action: "COMPLETE_ACTION", allowed: true },
      { action: "CLOSE", allowed: true },
    ],
    evidence: [],
    outcome: null,
    escalatedToHod: false,
    synthetic: true,
  };

  const c106: CaseDetail = {
    id: "C-106",
    studentId: "S-106",
    studentName: "Rohan Deshmukh",
    cohort: "ECE-2024-B",
    status: "ASSIGNED",
    deadlineStatus: "OVERDUE",
    deadline: "2026-10-05T12:00:00.000Z",
    ownerId: "STAFF-MENTOR-1",
    ownerName: "Dr. Priya Nair",
    ownerRole: "MENTOR",
    recommendedIntervention: "MENTOR",
    selectedIntervention: "MENTOR",
    overrideReason: null,
    plainLanguageReason: "Coursework pacing check-in requested for Signal Processing lab workload.",
    version: 1,
    updatedAt: "2026-09-09T14:00:00.000Z",
    createdAt: "2026-09-04T10:00:00.000Z",
    allowedTransitions: [
      { action: "APPROVE", allowed: false, reasonIfDisabled: "Already approved and assigned." },
      { action: "OVERRIDE", allowed: true },
      { action: "DEFER", allowed: true },
      { action: "DECLINE", allowed: true },
      { action: "START_PROGRESS", allowed: true },
      { action: "COMPLETE_ACTION", allowed: true },
      { action: "CLOSE", allowed: true },
    ],
    evidence: [],
    outcome: null,
    escalatedToHod: true,
    synthetic: true,
  };

  return {
    currentUser: DEMO_USERS["mentor@learntrack.edu"],
    staffCapacities: [
      {
        staffId: "STAFF-MENTOR-1",
        name: "Dr. Priya Nair",
        role: "MENTOR",
        slotsUsed: 7,
        slotsTotal: 8,
      },
      {
        staffId: "STAFF-COUNSELLOR-1",
        name: "Ananya Sen",
        role: "COUNSELLOR",
        slotsUsed: 6,
        slotsTotal: 6,
      },
      {
        staffId: "STAFF-FINANCE-1",
        name: "Karthik Menon",
        role: "FINANCE",
        slotsUsed: 4,
        slotsTotal: 10,
      },
      {
        staffId: "STAFF-HOD-1",
        name: "Prof. Rajesh Iyer",
        role: "HOD",
        slotsUsed: 2,
        slotsTotal: 5,
      },
    ],
    students: studentsCopy,
    histories: {
      "S-104": [
        {
          id: "H-1",
          timestamp: "2026-09-08T16:00:00.000Z",
          category: "CASE",
          title: "Support case C-104 opened",
          description: "Flagged for human review following midterm and attendance changes.",
        },
        {
          id: "H-2",
          timestamp: "2026-09-06T09:00:00.000Z",
          category: "CHECKIN",
          title: "Student check-in submitted",
          description: "Student shared commute schedule context and requested peer tutoring.",
        },
        {
          id: "H-3",
          timestamp: "2026-09-02T11:00:00.000Z",
          category: "ACADEMIC",
          title: "Midterm assessment recorded",
          description: "Data Structures & Algorithms midterm score recorded (54%).",
        },
      ],
      "S-105": [
        {
          id: "H-105-1",
          timestamp: "2026-09-05T09:00:00.000Z",
          category: "SUPPORT",
          title: "Fee installment coordination",
          description: "Scholarship renewal timeline logged with Finance office.",
        },
      ],
      "S-106": [
        {
          id: "H-106-1",
          timestamp: "2026-09-06T18:20:00.000Z",
          category: "CHECKIN",
          title: "Student check-in submitted",
          description: "Requested mentor review for lab schedule balancing.",
        },
      ],
      "S-107": [],
    },
    assessments: {
      "S-104": {
        id: "ASM-104-1",
        studentId: "S-104",
        createdAt: "2026-09-08T15:45:00.000Z",
        needsAttention: true,
        attentionLevel: "NEEDS_ATTENTION",
        attentionSummary: "Needs attention — recent shift in lab attendance and midterm performance",
        sourceMode: "ML",
        modelVersion: "lt-ordinal-v2.4.1",
        limitations:
          "Trained on historical cohort patterns; cannot observe external personal obligations unless shared by the student. Does not predict individual outcomes.",
        evidenceGroups: {
          observedChanges: [
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
          ],
          modelExplanation: [
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
          ],
          hypothesisedCauses: [
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
          ],
          studentConfirmedContext: [
            {
              id: "CTX-1",
              label: "Check-in (6 Sep 2026)",
              detail: "Commute schedule changed this month; requested peer tutoring for Data Structures.",
              direction: "NEUTRAL",
            },
          ],
        },
        synthetic: true,
      },
      "S-105": {
        id: "ASM-105-1",
        studentId: "S-105",
        createdAt: "2026-09-07T12:00:00.000Z",
        needsAttention: true,
        attentionLevel: "MONITOR",
        attentionSummary: "Needs attention — administrative fee support follow-up",
        sourceMode: "FALLBACK",
        modelVersion: "rule-fallback-v1.0",
        limitations:
          "Rule-based checklist fallback used while ML scoring service was skipped for administrative-only flag.",
        evidenceGroups: {
          observedChanges: [
            {
              id: "OBS-105-1",
              label: "Fee installment status",
              detail: "Scholarship renewal documentation pending verification.",
              direction: "NEUTRAL",
            },
          ],
          modelExplanation: [
            {
              id: "EXP-105-1",
              label: "Academic stability",
              detail: "Attendance (88%) and Midterm (79%) remain strong.",
              direction: "PROTECTIVE",
            },
          ],
          hypothesisedCauses: [
            {
              id: "HYP-105-1",
              label: "Hypothesis: Administrative processing delay on scholarship renewal",
              detail: "Requires Finance office verification, not academic remediation.",
              direction: "NEUTRAL",
            },
          ],
          studentConfirmedContext: {
            restricted: true,
            reason: "Restricted by role or consent",
          },
        },
        synthetic: true,
      },
      "S-106": {
        id: "ASM-106-1",
        studentId: "S-106",
        createdAt: "2026-09-08T10:00:00.000Z",
        needsAttention: true,
        attentionLevel: "NEEDS_ATTENTION",
        attentionSummary: "Needs attention — lab workload and attendance dip",
        sourceMode: "ML",
        modelVersion: "lt-ordinal-v2.4.1",
        limitations:
          "Observational indicator only; lab submission extensions are not automatically weighted.",
        evidenceGroups: {
          observedChanges: [
            {
              id: "OBS-106-1",
              label: "Attendance in Signal Processing",
              detail: "Moved from 86% to 64% over 4 weeks.",
              direction: "CONCERN",
            },
          ],
          modelExplanation: [
            {
              id: "EXP-106-1",
              label: "Concurrent lab load",
              detail: "Three lab courses scheduled in Semester 5.",
              direction: "CONCERN",
            },
          ],
          hypothesisedCauses: [
            {
              id: "HYP-106-1",
              label: "Hypothesis: Overlapping project submission deadlines",
              detail: "Unconfirmed hypothesis based on course calendar density.",
              direction: "NEUTRAL",
            },
          ],
          studentConfirmedContext: [
            {
              id: "CTX-106-1",
              label: "Check-in (6 Sep 2026)",
              detail: "Requested mentor check-in regarding lab workload pacing.",
              direction: "NEUTRAL",
            },
          ],
        },
        synthetic: true,
      },
      "S-107": {
        id: "ASM-107-1",
        studentId: "S-107",
        createdAt: "2026-09-08T10:00:00.000Z",
        needsAttention: false,
        attentionLevel: "INSUFFICIENT_DATA",
        attentionSummary: "No recent observations available to compute an indicator",
        sourceMode: "UNAVAILABLE",
        modelVersion: "lt-ordinal-v2.4.1",
        limitations:
          "Minimum observation threshold not met for Semester 3 transfer cohort. Manual review option is available.",
        evidenceGroups: {
          observedChanges: [],
          modelExplanation: [],
          hypothesisedCauses: [],
          studentConfirmedContext: null,
        },
        synthetic: true,
      },
    },
    cases: {
      "C-104": c104,
      "C-105": c105,
      "C-106": c106,
    },
    timelines: {
      "C-104": [
        {
          id: "TL-104-1",
          caseId: "C-104",
          timestamp: "2026-09-08T16:00:00.000Z",
          actorName: "System Queue",
          actorRole: "ADMIN",
          eventType: "CREATED",
          fromStatus: null,
          toStatus: "NEEDS_REVIEW",
          summary: "Case C-104 created for human review",
          detail: "Initial recommendation: PEER_TUTOR (awaiting human decision).",
        },
        {
          id: "TL-104-2",
          caseId: "C-104",
          timestamp: "2026-09-08T16:30:00.000Z",
          actorName: "Dr. Priya Nair",
          actorRole: "MENTOR",
          eventType: "EVIDENCE_ADDED",
          fromStatus: "NEEDS_REVIEW",
          toStatus: "NEEDS_REVIEW",
          summary: "Added structured evidence (ATTENDANCE_VERIFICATION)",
          detail: "Verified lab attendance logs for Weeks 3-5 with course instructor.",
        },
        {
          id: "TL-104-3",
          caseId: "C-104",
          timestamp: "2026-09-09T08:30:00.000Z",
          actorName: "Prof. Rajesh Iyer",
          actorRole: "HOD",
          eventType: "ESCALATED",
          fromStatus: "NEEDS_REVIEW",
          toStatus: "NEEDS_REVIEW",
          summary: "Escalated to HOD for staff follow-up",
          detail: "Ensuring timely mentor capacity allocation this week.",
        },
      ],
      "C-105": [
        {
          id: "TL-105-1",
          caseId: "C-105",
          timestamp: "2026-09-05T09:00:00.000Z",
          actorName: "Karthik Menon",
          actorRole: "FINANCE",
          eventType: "CREATED",
          fromStatus: null,
          toStatus: "IN_PROGRESS",
          summary: "Fee support coordination started",
          detail: "Assigned to Finance support officer.",
        },
      ],
      "C-106": [
        {
          id: "TL-106-1",
          caseId: "C-106",
          timestamp: "2026-09-04T10:00:00.000Z",
          actorName: "Dr. Priya Nair",
          actorRole: "MENTOR",
          eventType: "ASSIGNED",
          fromStatus: "NEEDS_REVIEW",
          toStatus: "ASSIGNED",
          summary: "Assigned to Dr. Priya Nair",
          detail: "Scheduled for mentor review.",
        },
        {
          id: "TL-106-2",
          caseId: "C-106",
          timestamp: "2026-09-09T14:00:00.000Z",
          actorName: "Prof. Rajesh Iyer",
          actorRole: "HOD",
          eventType: "ESCALATED",
          fromStatus: "ASSIGNED",
          toStatus: "ASSIGNED",
          summary: "Escalated to HOD for staff follow-up",
          detail: "Follow-up reminder for staff scheduling.",
        },
      ],
    },
    recommendations: {
      "C-104": [
        {
          id: "REC-1",
          interventionType: "PEER_TUTOR",
          rank: 1,
          title: "Peer Tutoring — Data Structures & Algorithms",
          rationale:
            "Matches student's check-in request and addresses lab/midterm topic gaps in a collaborative setting.",
          improvedCount: 19,
          sampleSize: 26,
          minSampleThreshold: 15,
          confidenceState: "STANDARD",
          synthetic: true,
        },
        {
          id: "REC-2",
          interventionType: "MENTOR",
          rank: 2,
          title: "1-on-1 Faculty Mentor Check-in",
          rationale:
            "Review morning commute schedule and explore switching to afternoon lab section.",
          improvedCount: 22,
          sampleSize: 31,
          minSampleThreshold: 15,
          confidenceState: "STANDARD",
          synthetic: true,
        },
        {
          id: "REC-3",
          interventionType: "REMEDIAL",
          rank: 3,
          title: "Structured Remedial Lab Workshop",
          rationale: "Guided practice on recursion and tree traversal modules.",
          improvedCount: 6,
          sampleSize: 11,
          minSampleThreshold: 15,
          confidenceState: "LOW_CONFIDENCE",
          synthetic: true,
        },
        {
          id: "REC-4",
          interventionType: "FEE_SUPPORT",
          rank: 4,
          title: "Fee Installment Advisory",
          rationale: "Coordinate second installment timeline with Finance office.",
          improvedCount: 2,
          sampleSize: 4,
          minSampleThreshold: 15,
          confidenceState: "INSUFFICIENT_DATA",
          synthetic: true,
        },
        {
          id: "REC-5",
          interventionType: "COUNSELLING_REFERRAL",
          rank: 5,
          title: "Optional Counselling Referral",
          rationale: "Voluntary referral if student requests wellbeing support.",
          improvedCount: 8,
          sampleSize: 14,
          minSampleThreshold: 15,
          confidenceState: "LOW_CONFIDENCE",
          synthetic: true,
        },
        {
          id: "REC-6",
          interventionType: "PLACEMENT_READINESS",
          rank: 6,
          title: "Placement Readiness Coaching",
          rationale: "Coding practice alignment for upcoming internship cycle.",
          improvedCount: 3,
          sampleSize: 5,
          minSampleThreshold: 15,
          confidenceState: "INSUFFICIENT_DATA",
          synthetic: true,
        },
        {
          id: "REC-7",
          interventionType: "PARENT_MEETING",
          rank: 7,
          title: "Family / Guardian Consultation (With Consent)",
          rationale: "Optional family alignment meeting if requested by student.",
          improvedCount: 1,
          sampleSize: 3,
          minSampleThreshold: 15,
          confidenceState: "INSUFFICIENT_DATA",
          synthetic: true,
        },
      ],
    },
    tutors: {
      "T-201": {
        id: "T-201",
        name: "Divya Subramanian",
        cohort: "CS-2023-A",
        verifiedSubjects: ["Data Structures & Algorithms", "Operating Systems", "Database Systems"],
        isVerified: true,
        timezone: "Asia/Kolkata",
        activeSessionsCount: 2,
        maxWeeklySessions: 5,
        slots: [
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
      "T-202": {
        id: "T-202",
        name: "Nikhil Verma",
        cohort: "ECE-2023-A",
        verifiedSubjects: ["Signal Processing", "Data Structures & Algorithms"],
        isVerified: true,
        timezone: "Asia/Kolkata",
        activeSessionsCount: 1,
        maxWeeklySessions: 4,
        slots: [
          {
            id: "SLOT-202-1",
            startIso: "2026-10-14T14:00:00.000Z",
            endIso: "2026-10-14T15:00:00.000Z",
            isBooked: false,
          },
        ],
      },
      "T-203": {
        id: "T-203",
        name: "Unverified Candidate",
        cohort: "CS-2024-B",
        verifiedSubjects: ["Data Structures & Algorithms"],
        isVerified: false,
        timezone: "Asia/Kolkata",
        activeSessionsCount: 0,
        maxWeeklySessions: 3,
        slots: [],
      },
    },
    sessions: [
      {
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
    ],
    meetings: [
      {
        id: "MTG-401",
        title: "Academic Advising Sync",
        organiserId: "STAFF-MENTOR-1",
        organiserName: "Dr. Priya Nair",
        participantIds: ["S-104"],
        participantNames: ["Aarav Sharma"],
        startIso: "2026-10-14T09:00:00.000Z",
        endIso: "2026-10-14T09:30:00.000Z",
        timezone: "Asia/Kolkata",
        syncStatus: "SYNCED",
        integrationMode: "MOCK",
        locationOrLink: "Room 302 / Meet Link (Mock)",
        caseId: "C-104",
      },
    ],
    googleStatus: {
      connected: true,
      mode: "MOCK",
      organiserEmail: "mentor@learntrack.edu",
      lastSyncedAt: "2026-10-12T10:00:00.000Z",
      canManage: true,
    },
    notifications: [
      {
        id: "NOTIF-1",
        recipientId: "STAFF-MENTOR-1",
        title: "Case C-104 awaiting review",
        summary: "Aarav Sharma (CS-2024-A) has a new check-in and recommendation ready for review.",
        channel: "EMAIL",
        state: "SENT",
        createdAt: "2026-10-12T08:15:00.000Z",
      },
      {
        id: "NOTIF-2",
        recipientId: "STAFF-MENTOR-1",
        title: "Meeting invite queued",
        summary: "Calendar invitation for Academic Advising Sync.",
        channel: "EMAIL",
        state: "PENDING",
        createdAt: "2026-10-12T09:30:00.000Z",
      },
      {
        id: "NOTIF-3",
        recipientId: "STAFF-MENTOR-1",
        title: "SMS digest skipped",
        summary: "Secondary notification channel cancelled by user preference.",
        channel: "IN_APP",
        state: "CANCELLED",
        createdAt: "2026-10-11T17:00:00.000Z",
      },
    ],
    checkIns: {
      "CHK-101": {
        id: "CHK-101",
        studentId: "S-104",
        contextNote:
          "Commute schedule changed this month and balancing part-time family responsibilities; would welcome peer tutoring in Data Structures.",
        supportRequested: "ACADEMIC_TUTORING",
        optionalSupportDecision: "ACCEPT",
        sharingOptions: [
          { recipientRole: "MENTOR", allowed: true },
          { recipientRole: "FACULTY", allowed: true },
          { recipientRole: "COUNSELLOR", allowed: false },
          { recipientRole: "FINANCE", allowed: false },
        ],
        createdAt: "2026-09-06T09:00:00.000Z",
      },
    },
    consents: [
      {
        id: "CON-1",
        scope: "CHECKIN_NOTES",
        scopeLabel: "Self Check-in Context Notes",
        recipientRole: "MENTOR",
        granted: true,
        updatedAt: "2026-09-06T09:00:00.000Z",
      },
      {
        id: "CON-2",
        scope: "CHECKIN_NOTES",
        scopeLabel: "Self Check-in Context Notes",
        recipientRole: "FACULTY",
        granted: true,
        updatedAt: "2026-09-06T09:00:00.000Z",
      },
      {
        id: "CON-3",
        scope: "COUNSELLING_REFERRAL_STATUS",
        scopeLabel: "Counselling Referral Status",
        recipientRole: "MENTOR",
        granted: false,
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "CON-4",
        scope: "FINANCIAL_SUPPORT_STATUS",
        scopeLabel: "Financial Support & Installment Status",
        recipientRole: "MENTOR",
        granted: true,
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "CON-5",
        scope: "ATTENDANCE_AND_MARKS",
        scopeLabel: "Academic Attendance & Marks Summary",
        recipientRole: "PEER_TUTOR",
        granted: true,
        updatedAt: "2026-09-06T09:00:00.000Z",
      },
    ],
  };
}

let db: MockDbState = buildInitialState();

export function resetMockDb(initialUserEmail: string | null = "mentor@learntrack.edu") {
  db = buildInitialState();
  db.currentUser = initialUserEmail ? DEMO_USERS[initialUserEmail] ?? null : null;
}

export function setMockCurrentUser(user: User | null) {
  db.currentUser = user;
}

function requireAuth() {
  if (!db.currentUser) {
    return HttpResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required. Please sign in.",
        },
      },
      { status: 401 }
    );
  }
  return null;
}

function hasAnyRole(user: User, allowed: Role[]): boolean {
  return user.roles.some((r) => allowed.includes(r));
}

export const handlers = [
  // CSRF
  http.get("/api/auth/csrf", () => {
    return HttpResponse.json({ csrfToken: "csrf-mock-token-2026" });
  }),

  // Login
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const emailKey = (body.email ?? "").trim().toLowerCase();
    const matched = DEMO_USERS[emailKey];
    if (!matched || body.password === "wrong") {
      return HttpResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
        },
        { status: 401 }
      );
    }
    db.currentUser = matched;
    return HttpResponse.json(matched);
  }),

  // Logout
  http.post("/api/auth/logout", () => {
    db.currentUser = null;
    return HttpResponse.json({ ok: true });
  }),

  // Me
  http.get("/api/auth/me", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    return HttpResponse.json(db.currentUser);
  }),

  // Priority Queue
  http.get("/api/queue", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;

    const queueItems: QueueItem[] = [
      {
        studentId: "S-104",
        studentName: "Aarav Sharma",
        cohort: "CS-2024-A",
        expectedBenefitRank: 1,
        expectedBenefitLabel: "High expected benefit — early lab & tutoring alignment",
        needsAttentionReason: "Attendance dip (92% -> 60%) + student requested peer tutoring",
        recommendedIntervention: db.cases["C-104"]?.selectedIntervention ?? db.cases["C-104"]?.recommendedIntervention ?? "PEER_TUTOR",
        assignedStaffId: db.cases["C-104"]?.ownerId ?? "STAFF-MENTOR-1",
        assignedStaffName: db.cases["C-104"]?.ownerName ?? "Dr. Priya Nair",
        routingStatus: "ASSIGNED_SLOT",
        caseId: "C-104",
        updatedAt: db.cases["C-104"]?.updatedAt ?? "2026-09-09T08:30:00.000Z",
      },
      {
        studentId: "S-106",
        studentName: "Rohan Deshmukh",
        cohort: "ECE-2024-B",
        expectedBenefitRank: 2,
        expectedBenefitLabel: "High expected benefit — lab workload scheduling",
        needsAttentionReason: "Signal Processing lab extension & workload check-in",
        recommendedIntervention: db.cases["C-106"]?.selectedIntervention ?? db.cases["C-106"]?.recommendedIntervention ?? "MENTOR",
        assignedStaffId: db.cases["C-106"]?.ownerId ?? "STAFF-MENTOR-1",
        assignedStaffName: db.cases["C-106"]?.ownerName ?? "Dr. Priya Nair",
        routingStatus: "ROUTED_TO_MENTOR_PEER",
        caseId: "C-106",
        updatedAt: db.cases["C-106"]?.updatedAt ?? "2026-09-09T14:00:00.000Z",
      },
      {
        studentId: "S-105",
        studentName: "Meera Krishnan",
        cohort: "CS-2024-A",
        expectedBenefitRank: 3,
        expectedBenefitLabel: "Moderate expected benefit — fee support coordination",
        needsAttentionReason: "Scholarship renewal installment review",
        recommendedIntervention: db.cases["C-105"]?.selectedIntervention ?? db.cases["C-105"]?.recommendedIntervention ?? "FEE_SUPPORT",
        assignedStaffId: db.cases["C-105"]?.ownerId ?? null,
        assignedStaffName: db.cases["C-105"]?.ownerName ?? null,
        routingStatus: "QUEUED",
        caseId: "C-105",
        updatedAt: db.cases["C-105"]?.updatedAt ?? "2026-09-10T11:00:00.000Z",
      },
    ];

    return HttpResponse.json({
      items: queueItems,
      staffCapacities: db.staffCapacities,
      synthetic: true,
    });
  }),

  // Update Staff Capacity (ADMIN, HOD only)
  http.put("/api/staff/:id/capacity", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    if (!hasAnyRole(db.currentUser!, ["ADMIN", "HOD"])) {
      return HttpResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only HOD or ADMIN roles can modify staff capacity.",
          },
        },
        { status: 403 }
      );
    }

    const staffId = String(params.id);
    const body = (await request.json()) as { slotsTotal: number };
    const idx = db.staffCapacities.findIndex((s) => s.staffId === staffId);
    if (idx === -1) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Staff member not found" } },
        { status: 404 }
      );
    }
    db.staffCapacities[idx] = {
      ...db.staffCapacities[idx],
      slotsTotal: body.slotsTotal,
    };
    return HttpResponse.json(db.staffCapacities[idx]);
  }),

  // Students list
  http.get("/api/students", ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;

    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const cohort = url.searchParams.get("cohort") ?? "";
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 10);

    const allSummaries = Object.values(db.students).map((s) => ({
      id: s.id,
      name: s.name,
      cohort: s.cohort,
      department: s.department,
      semester: s.semester,
      needsAttention: s.id !== "S-107",
      activeCaseId: s.activeCaseId ?? null,
      lastObservationAt: s.hasRecentObservations ? "2026-09-08T14:15:00.000Z" : null,
    }));

    const filtered = allSummaries.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.id.toLowerCase().includes(search);
      const matchesCohort = !cohort || item.cohort === cohort;
      return matchesSearch && matchesCohort;
    });

    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return HttpResponse.json({
      items: paged,
      page,
      pageSize,
      total: filtered.length,
      synthetic: true,
    });
  }),

  // Student 360
  http.get("/api/students/:id", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;

    const id = String(params.id);
    const student = db.students[id];
    if (!student) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: `Student ${id} not found` } },
        { status: 404 }
      );
    }

    // Apply role-based field restriction simulation
    const responseStudent: Student360 = JSON.parse(JSON.stringify(student));
    const userRoles = db.currentUser!.roles;

    // If user is FACULTY only (and not MENTOR/FINANCE/COUNSELLOR/HOD/ADMIN), restrict fees & counselling
    if (!userRoles.some((r) => ["FINANCE", "MENTOR", "HOD", "ADMIN"].includes(r))) {
      responseStudent.fees = { restricted: true, reason: "Restricted by role or consent" };
    }
    if (!userRoles.some((r) => ["COUNSELLOR", "MENTOR", "HOD", "ADMIN"].includes(r))) {
      responseStudent.counselling = {
        restricted: true,
        reason: "Restricted by role or consent",
      };
    }

    return HttpResponse.json(responseStudent);
  }),

  // Student History
  http.get("/api/students/:id/history", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    if (!db.students[id]) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: `Student ${id} not found` } },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      studentId: id,
      events: db.histories[id] ?? [],
      synthetic: true,
    });
  }),

  // Latest Risk Assessment
  http.get("/api/students/:id/assessments/latest", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const assessment = db.assessments[id];
    if (!assessment) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "No assessment found" } },
        { status: 404 }
      );
    }
    return HttpResponse.json(assessment);
  }),

  // Run Risk Assessment
  http.post("/api/students/:id/assessments", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const existing = db.assessments[id];
    if (!existing) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Student not found" } },
        { status: 404 }
      );
    }
    const updated: RiskAssessment = {
      ...existing,
      id: `ASM-${id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    db.assessments[id] = updated;
    return HttpResponse.json(updated);
  }),

  // Cases list
  http.get("/api/cases", ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "";
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 10);

    const allCases = Object.values(db.cases).filter((c) => !status || c.status === status);
    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      items: allCases.slice(start, start + pageSize),
      page,
      pageSize,
      total: allCases.length,
      synthetic: true,
    });
  }),

  // Create Case (supports individual student support or cohort/subject faculty review tasks without student identifiers)
  http.post("/api/cases", async ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const body = (await request.json()) as {
      studentId?: string;
      cohort?: string;
      subject?: string;
      clusterId?: string;
      taskType?: "STUDENT_SUPPORT" | "FACULTY_REVIEW_TASK";
      recommendedIntervention?: CaseDetail["recommendedIntervention"];
      plainLanguageReason: string;
    };
    const isCohortReviewTask = !body.studentId || body.taskType === "FACULTY_REVIEW_TASK";
    const student = body.studentId ? db.students[body.studentId] : undefined;
    const newId = `C-${Math.floor(200 + Math.random() * 700)}`;
    const now = new Date().toISOString();
    const created: CaseDetail = {
      id: newId,
      studentId: isCohortReviewTask
        ? `COHORT-REVIEW:${body.cohort ?? "CS-2024-A"}`
        : body.studentId!,
      studentName: isCohortReviewTask
        ? `Cohort Review (${body.subject ?? "Curriculum"} / ${body.cohort ?? "CS-2024-A"})`
        : student?.name ?? body.studentId!,
      cohort: body.cohort ?? student?.cohort ?? "CS-2024-A",
      status: "NEEDS_REVIEW",
      deadlineStatus: "ON_TIME",
      deadline: "2026-10-25T12:00:00.000Z",
      ownerId: db.currentUser!.id,
      ownerName: db.currentUser!.name,
      ownerRole: db.currentUser!.roles[0] ?? "MENTOR",
      recommendedIntervention: body.recommendedIntervention ?? "REMEDIAL",
      selectedIntervention: null,
      overrideReason: null,
      plainLanguageReason: body.plainLanguageReason,
      version: 1,
      updatedAt: now,
      createdAt: now,
      allowedTransitions: [
        { action: "APPROVE", allowed: true },
        { action: "OVERRIDE", allowed: true },
        { action: "DEFER", allowed: true },
        { action: "DECLINE", allowed: true },
      ],
      evidence: [],
      outcome: null,
      synthetic: true,
    };
    db.cases[newId] = created;
    db.timelines[newId] = [
      {
        id: `TL-${Date.now()}`,
        caseId: newId,
        timestamp: now,
        actorName: db.currentUser!.name,
        actorRole: db.currentUser!.roles[0] ?? "MENTOR",
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "NEEDS_REVIEW",
        summary: isCohortReviewTask
          ? "Cohort curriculum review task created"
          : "Manual review case created",
        detail: body.plainLanguageReason,
      },
    ];
    return HttpResponse.json(created, { status: 201 });
  }),

  // Get Case Detail
  http.get("/api/cases/:id", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const found = db.cases[id];
    if (!found) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: `Case ${id} not found` } },
        { status: 404 }
      );
    }
    return HttpResponse.json(found);
  }),

  // Patch Case (with optimistic concurrency check on version)
  http.patch("/api/cases/:id", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const existing = db.cases[id];
    if (!existing) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: `Case ${id} not found` } },
        { status: 404 }
      );
    }

    const body = (await request.json()) as {
      action: string;
      version: number;
      updatedAt: string;
      selectedIntervention?: CaseDetail["selectedIntervention"];
      overrideReason?: string;
      ownerId?: string;
      deadline?: string;
      note?: string;
    };

    if (body.version !== existing.version) {
      return HttpResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "This case was changed by someone else",
            details: { currentVersion: existing.version },
          },
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    let nextStatus = existing.status;
    let selectedIntervention = existing.selectedIntervention;
    let overrideReason = existing.overrideReason;

    if (body.action === "APPROVE") {
      nextStatus = "ASSIGNED";
      selectedIntervention =
        body.selectedIntervention ?? existing.recommendedIntervention ?? "PEER_TUTOR";
    } else if (body.action === "OVERRIDE") {
      nextStatus = "ASSIGNED";
      selectedIntervention = body.selectedIntervention ?? "MENTOR";
      overrideReason = body.overrideReason ?? null;
    } else if (body.action === "DEFER") {
      nextStatus = "DEFERRED";
    } else if (body.action === "DECLINE") {
      nextStatus = "DECLINED";
    } else if (body.action === "START_PROGRESS") {
      nextStatus = "IN_PROGRESS";
    } else if (body.action === "COMPLETE_ACTION") {
      nextStatus = "ACTION_COMPLETED";
    } else if (body.action === "CLOSE") {
      nextStatus = "CLOSED";
    } else if (body.action === "REOPEN") {
      nextStatus = "REOPENED";
    }

    const matchedStaff = body.ownerId
      ? db.staffCapacities.find((s) => s.staffId === body.ownerId)
      : null;

    const updated: CaseDetail = {
      ...existing,
      status: nextStatus,
      selectedIntervention,
      overrideReason,
      ownerId: body.ownerId ?? existing.ownerId,
      ownerName: matchedStaff ? matchedStaff.name : existing.ownerName,
      ownerRole: matchedStaff ? matchedStaff.role : existing.ownerRole,
      deadline: body.deadline ?? existing.deadline,
      version: existing.version + 1,
      updatedAt: now,
      allowedTransitions: [
        {
          action: "APPROVE",
          allowed: nextStatus === "NEEDS_REVIEW" || nextStatus === "REOPENED",
          reasonIfDisabled: "Case has already moved past initial review.",
        },
        { action: "OVERRIDE", allowed: nextStatus !== "CLOSED" },
        { action: "DEFER", allowed: nextStatus !== "CLOSED" },
        {
          action: "DECLINE",
          allowed: nextStatus === "NEEDS_REVIEW" || nextStatus === "ASSIGNED",
          reasonIfDisabled: "Cannot decline at this stage.",
        },
        {
          action: "START_PROGRESS",
          allowed: nextStatus === "ASSIGNED" || nextStatus === "SCHEDULED",
          reasonIfDisabled: "Case must be assigned before starting progress.",
        },
        {
          action: "COMPLETE_ACTION",
          allowed:
            nextStatus === "ASSIGNED" ||
            nextStatus === "IN_PROGRESS" ||
            nextStatus === "SCHEDULED",
          reasonIfDisabled: "Action must be assigned or in progress first.",
        },
        {
          action: "CLOSE",
          allowed:
            nextStatus === "OUTCOME_REVIEWED" ||
            nextStatus === "ACTION_COMPLETED" ||
            nextStatus === "DEFERRED",
          reasonIfDisabled: "Record an outcome review or complete actions before closing.",
        },
        {
          action: "REOPEN",
          allowed:
            nextStatus === "CLOSED" ||
            nextStatus === "DEFERRED" ||
            nextStatus === "DECLINED",
          reasonIfDisabled: "Only closed, deferred, or declined cases can be reopened.",
        },
      ],
    };

    db.cases[id] = updated;
    const entries = db.timelines[id] ?? [];
    entries.unshift({
      id: `TL-${Date.now()}`,
      caseId: id,
      timestamp: now,
      actorName: db.currentUser!.name,
      actorRole: db.currentUser!.roles[0] ?? "MENTOR",
      eventType: body.action === "OVERRIDE" ? "OVERRIDDEN" : "STATUS_CHANGE",
      fromStatus: existing.status,
      toStatus: nextStatus,
      summary:
        body.action === "OVERRIDE"
          ? `Overrode recommendation to ${selectedIntervention}`
          : `Transitioned case via ${body.action} to ${nextStatus}`,
      detail: body.overrideReason ?? body.note ?? null,
    });
    db.timelines[id] = entries;

    return HttpResponse.json(updated);
  }),

  // Case Recommendations
  http.get("/api/cases/:id/recommendations", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const c = db.cases[id];
    const items = db.recommendations[id] ?? db.recommendations["C-104"] ?? [];
    return HttpResponse.json({
      caseId: id,
      studentId: c?.studentId ?? "S-104",
      items,
      synthetic: true,
    });
  }),

  // Case Timeline
  http.get("/api/cases/:id/timeline", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const c = db.cases[id];
    if (!c) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      caseId: id,
      status: c.status,
      deadlineStatus: c.deadlineStatus,
      deadline: c.deadline,
      entries: db.timelines[id] ?? [],
      synthetic: true,
    });
  }),

  // Add Evidence
  http.post("/api/cases/:id/evidence", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const c = db.cases[id];
    if (!c) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404 }
      );
    }
    const body = (await request.json()) as {
      type: "MEETING_NOTES" | "ATTENDANCE_VERIFICATION" | "TUTORING_SUMMARY" | "FEE_PLAN_AGREEMENT" | "FOLLOW_UP_OBSERVATION";
      note: string;
      date: string;
    };
    const now = new Date().toISOString();
    const record = {
      id: `EV-${Date.now()}`,
      caseId: id,
      type: body.type,
      note: body.note,
      date: body.date,
      authorName: db.currentUser!.name,
      authorRole: db.currentUser!.roles[0] ?? "MENTOR",
      createdAt: now,
    };
    c.evidence = [record, ...(c.evidence ?? [])];
    db.timelines[id] = [
      {
        id: `TL-${Date.now()}`,
        caseId: id,
        timestamp: now,
        actorName: db.currentUser!.name,
        actorRole: db.currentUser!.roles[0] ?? "MENTOR",
        eventType: "EVIDENCE_ADDED",
        fromStatus: c.status,
        toStatus: c.status,
        summary: `Logged structured evidence (${body.type})`,
        detail: body.note,
      },
      ...(db.timelines[id] ?? []),
    ];
    return HttpResponse.json(record, { status: 201 });
  }),

  // Record Outcome
  http.post("/api/cases/:id/outcomes", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const c = db.cases[id];
    if (!c) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404 }
      );
    }
    const body = (await request.json()) as {
      classification: "IMPROVEMENT" | "NO_CHANGE" | "UNKNOWN";
      observedMeasures: string[];
      note: string;
    };
    const now = new Date().toISOString();
    const outcome = {
      id: `OUT-${Date.now()}`,
      caseId: id,
      classification: body.classification,
      observedMeasures: body.observedMeasures,
      note: body.note,
      recordedBy: db.currentUser!.name,
      recordedAt: now,
    };
    c.outcome = outcome;
    c.status = "OUTCOME_REVIEWED";
    c.version = c.version + 1;
    c.updatedAt = now;
    c.allowedTransitions = [
      {
        action: "APPROVE",
        allowed: false,
        reasonIfDisabled: "Case has already moved past initial review.",
      },
      { action: "OVERRIDE", allowed: true },
      { action: "DEFER", allowed: true },
      {
        action: "DECLINE",
        allowed: false,
        reasonIfDisabled: "Cannot decline at this stage.",
      },
      {
        action: "START_PROGRESS",
        allowed: false,
        reasonIfDisabled: "Case must be assigned before starting progress.",
      },
      {
        action: "COMPLETE_ACTION",
        allowed: false,
        reasonIfDisabled: "Action has already been completed.",
      },
      {
        action: "CLOSE",
        allowed: true,
      },
      {
        action: "REOPEN",
        allowed: false,
        reasonIfDisabled: "Only closed, deferred, or declined cases can be reopened.",
      },
    ];
    db.timelines[id] = [
      {
        id: `TL-${Date.now()}`,
        caseId: id,
        timestamp: now,
        actorName: db.currentUser!.name,
        actorRole: db.currentUser!.roles[0] ?? "MENTOR",
        eventType: "OUTCOME_RECORDED",
        fromStatus: "ACTION_COMPLETED",
        toStatus: "OUTCOME_REVIEWED",
        summary: `Outcome classified as ${body.classification}`,
        detail: body.note,
      },
      ...(db.timelines[id] ?? []),
    ];
    return HttpResponse.json(outcome, { status: 201 });
  }),

  // Tutors list (only verified tutors returned)
  http.get("/api/tutors", ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const url = new URL(request.url);
    const subject = (url.searchParams.get("subject") ?? "").toLowerCase();

    const verifiedTutors = Object.values(db.tutors).filter((t) => {
      if (!t.isVerified) return false;
      if (!subject) return true;
      return t.verifiedSubjects.some((s) => s.toLowerCase().includes(subject));
    });

    return HttpResponse.json({
      items: verifiedTutors,
      page: 1,
      pageSize: 20,
      total: verifiedTutors.length,
      synthetic: true,
    });
  }),

  // Tutor detail
  http.get("/api/tutors/:id", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const tutor = db.tutors[id];
    if (!tutor || !tutor.isVerified) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Verified tutor not found" } },
        { status: 404 }
      );
    }
    return HttpResponse.json(tutor);
  }),

  // Update Tutor Availability
  http.put("/api/tutors/:id/availability", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const tutor = db.tutors[id];
    if (!tutor) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Tutor not found" } },
        { status: 404 }
      );
    }
    const body = (await request.json()) as {
      timezone: string;
      slots: Array<{ id?: string; startIso: string; endIso: string }>;
    };
    const existingBookedIds = new Set(
      tutor.slots.filter((s) => s.isBooked).map((s) => s.id)
    );
    const existingBookedWindows = new Set(
      tutor.slots.filter((s) => s.isBooked).map((s) => `${s.startIso}|${s.endIso}`)
    );
    tutor.timezone = body.timezone;
    tutor.slots = body.slots.map((s, idx) => ({
      id: s.id ?? `SLOT-${id}-${Date.now()}-${idx}`,
      startIso: s.startIso,
      endIso: s.endIso,
      isBooked:
        (s.id ? existingBookedIds.has(s.id) : false) ||
        existingBookedWindows.has(`${s.startIso}|${s.endIso}`),
    }));
    return HttpResponse.json(tutor);
  }),

  // Sessions list
  http.get("/api/sessions", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    return HttpResponse.json({
      items: db.sessions,
      page: 1,
      pageSize: 20,
      total: db.sessions.length,
      synthetic: true,
    });
  }),

  // Book Session (handles 409 conflict with alternative slots)
  http.post("/api/sessions", async ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const body = (await request.json()) as {
      tutorId: string;
      studentId: string;
      subject: string;
      slotId: string;
      startIso: string;
      endIso: string;
      caseId?: string;
      academicGoalNote?: string;
    };
    const tutor = db.tutors[body.tutorId];
    if (!tutor || !tutor.isVerified) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Verified tutor not found" } },
        { status: 404 }
      );
    }
    const targetSlot = tutor.slots.find((s) => s.id === body.slotId);
    if (!targetSlot || targetSlot.isBooked) {
      const alternativeSlots = tutor.slots.filter((s) => !s.isBooked);
      return HttpResponse.json(
        {
          error: {
            code: "SLOT_CONFLICT",
            message: "This slot was just booked. Please select an alternative available slot.",
            details: { alternativeSlots },
          },
        },
        { status: 409 }
      );
    }

    targetSlot.isBooked = true;
    const student = db.students[body.studentId];
    const newSession: TutoringSession = {
      id: `SES-${Date.now()}`,
      tutorId: tutor.id,
      tutorName: tutor.name,
      studentId: body.studentId,
      studentName: student?.name ?? body.studentId,
      subject: body.subject,
      slotId: body.slotId,
      startIso: body.startIso,
      endIso: body.endIso,
      status: "REQUESTED",
      caseId: body.caseId ?? null,
      academicGoalNote: body.academicGoalNote,
      feedbackSubmitted: false,
    };
    db.sessions.unshift(newSession);
    return HttpResponse.json(newSession, { status: 201 });
  }),

  // Patch Session
  http.patch("/api/sessions/:id", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const session = db.sessions.find((s) => s.id === id);
    if (!session) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found" } },
        { status: 404 }
      );
    }
    const body = (await request.json()) as { status: TutoringSession["status"] };
    session.status = body.status;
    if (body.status === "DECLINED" || body.status === "CANCELLED") {
      const tutor = db.tutors[session.tutorId];
      const slot = tutor?.slots.find((s) => s.id === session.slotId);
      if (slot) {
        slot.isBooked = false;
      }
    }
    return HttpResponse.json(session);
  }),

  // Session Feedback
  http.post("/api/sessions/:id/feedback", async ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const session = db.sessions.find((s) => s.id === id);
    if (!session) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found" } },
        { status: 404 }
      );
    }
    session.status = "COMPLETED";
    session.feedbackSubmitted = true;
    return HttpResponse.json(session);
  }),

  // Meetings
  http.get("/api/meetings", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    return HttpResponse.json({
      items: db.meetings,
      page: 1,
      pageSize: 20,
      total: db.meetings.length,
      synthetic: true,
    });
  }),

  http.post("/api/meetings", async ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const body = (await request.json()) as {
      participantId: string;
      startIso: string;
      endIso: string;
      timezone: string;
      caseId?: string;
    };
    const student = db.students[body.participantId];
    const created: MeetingRecord = {
      id: `MTG-${Date.now()}`,
      title: "Academic Support Check-in", // Privacy-safe generic title without case details
      organiserId: db.currentUser!.id,
      organiserName: db.currentUser!.name,
      participantIds: [body.participantId],
      participantNames: [student?.name ?? body.participantId],
      startIso: body.startIso,
      endIso: body.endIso,
      timezone: body.timezone,
      syncStatus: db.googleStatus.connected ? "SYNCED" : "PENDING",
      integrationMode: db.googleStatus.mode,
      locationOrLink: "Advising Office / Calendar Invite",
      caseId: body.caseId ?? null,
<<<<<<< HEAD
      googleEventId: `mock-gcal-${Date.now()}`,
      notificationStatus: "SENT",
=======
>>>>>>> 478a80caf06bf48bfa4387ebbf864fe02a764bea
    };
    db.meetings.unshift(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch("/api/meetings/:id", async ({ params, request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const mtg = db.meetings.find((m) => m.id === id);
    if (!mtg) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Meeting not found" } },
        { status: 404 }
      );
    }
<<<<<<< HEAD
    const body = (await request.json()) as {
      startIso?: string;
      endIso?: string;
      resync?: boolean;
      resendNotification?: boolean;
    };
    if (body.startIso) mtg.startIso = body.startIso;
    if (body.endIso) mtg.endIso = body.endIso;
    if (body.resync) mtg.syncStatus = "SYNCED";
    if (body.resendNotification) mtg.notificationStatus = "SENT";
=======
    const body = (await request.json()) as { startIso?: string; endIso?: string; resync?: boolean };
    if (body.startIso) mtg.startIso = body.startIso;
    if (body.endIso) mtg.endIso = body.endIso;
    if (body.resync) mtg.syncStatus = "SYNCED";
>>>>>>> 478a80caf06bf48bfa4387ebbf864fe02a764bea
    return HttpResponse.json(mtg);
  }),

  // Google Integration
  http.get("/api/integrations/google/status", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const isOrganiser = hasAnyRole(db.currentUser!, [
      "MENTOR",
      "FACULTY",
      "HOD",
      "COUNSELLOR",
      "FINANCE",
      "ADMIN",
    ]);
    return HttpResponse.json({
      ...db.googleStatus,
      canManage: isOrganiser,
    });
  }),

  http.post("/api/integrations/google/connect", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    db.googleStatus.connected = true;
    db.googleStatus.lastSyncedAt = new Date().toISOString();
    return HttpResponse.json(db.googleStatus);
  }),

  http.post("/api/integrations/google/disconnect", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    db.googleStatus.connected = false;
    return HttpResponse.json(db.googleStatus);
  }),

  // Notifications
  http.get("/api/notifications", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    return HttpResponse.json({
      items: db.notifications,
      synthetic: true,
    });
  }),

  // Analytics (HOD, ADMIN)
  http.get("/api/analytics/cohorts", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    if (!hasAnyRole(db.currentUser!, ["HOD", "ADMIN"])) {
      return HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Access restricted to HOD and ADMIN roles." } },
        { status: 403 }
      );
    }
    return HttpResponse.json({
      openCasesCount: 14,
      completedCasesCount: 38,
      overdueCasesCount: 2,
      medianHoursToFirstAction: 18.5,
      outcomeReviewRatePercent: 84,
      sharedDeclinePatterns: [
        {
          id: "PAT-1",
          cohort: "CS-2024-A",
          subject: "Data Structures & Algorithms",
          affectedStudentsCount: 11,
          metric: "Morning Lab Attendance (Weeks 3–5)",
          changeSummary: "18% aggregate dip across 8:30 AM Tuesday lab section",
        },
        {
          id: "PAT-2",
          cohort: "ECE-2024-B",
          subject: "Signal Processing",
          affectedStudentsCount: 9,
          metric: "Lab Report Submission Pacing",
          changeSummary: "Clustered extension requests during concurrent project week",
        },
      ],
      synthetic: true,
    });
  }),

  http.get("/api/analytics/outcomes", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    if (!hasAnyRole(db.currentUser!, ["HOD", "ADMIN"])) {
      return HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Access restricted to HOD and ADMIN roles." } },
        { status: 403 }
      );
    }
    return HttpResponse.json({
      byIntervention: [
        {
          interventionType: "PEER_TUTOR",
          improvementCount: 19,
          noChangeCount: 4,
          unknownCount: 3,
          totalReviewed: 26,
        },
        {
          interventionType: "MENTOR",
          improvementCount: 22,
          noChangeCount: 6,
          unknownCount: 3,
          totalReviewed: 31,
        },
        {
          interventionType: "REMEDIAL",
          improvementCount: 6,
          noChangeCount: 3,
          unknownCount: 2,
          totalReviewed: 11,
        },
        {
          interventionType: "FEE_SUPPORT",
          improvementCount: 9,
          noChangeCount: 1,
          unknownCount: 2,
          totalReviewed: 12,
        },
      ],
      synthetic: true,
    });
  }),

  http.get("/api/analytics/impact", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    if (!hasAnyRole(db.currentUser!, ["HOD", "ADMIN"])) {
      return HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Access restricted to HOD and ADMIN roles." } },
        { status: 403 }
      );
    }
    return HttpResponse.json({
      series: [
        {
          period: "Month 1",
          withSupportAttendanceDelta: 4.2,
          comparisonGroupAttendanceDelta: -1.5,
          reviewedCasesCount: 12,
        },
        {
          period: "Month 2",
          withSupportAttendanceDelta: 8.6,
          comparisonGroupAttendanceDelta: 0.4,
          reviewedCasesCount: 19,
        },
        {
          period: "Month 3",
          withSupportAttendanceDelta: 11.1,
          comparisonGroupAttendanceDelta: 1.2,
          reviewedCasesCount: 26,
        },
      ],
      synthetic: true,
    });
  }),

  http.get("/api/analytics/fairness", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    if (!hasAnyRole(db.currentUser!, ["HOD", "ADMIN"])) {
      return HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Access restricted to HOD and ADMIN roles." } },
        { status: 403 }
      );
    }
    return HttpResponse.json({
      groups: [
        {
          groupDimension: "Department Cohort",
          groupLabel: "Computer Science (CS-2024)",
          groupCount: 120,
          flaggedCount: 15,
          alertRatePercent: 12.5,
          minGroupSizeThreshold: 10,
          insufficientData: false,
        },
        {
          groupDimension: "Department Cohort",
          groupLabel: "Electronics & Comm (ECE-2024)",
          groupCount: 95,
          flaggedCount: 11,
          alertRatePercent: 11.6,
          minGroupSizeThreshold: 10,
          insufficientData: false,
        },
        {
          groupDimension: "Entry Pathway",
          groupLabel: "Lateral Transfer Cohort (ME-2025)",
          groupCount: 4,
          flaggedCount: 1,
          alertRatePercent: null,
          minGroupSizeThreshold: 10,
          insufficientData: true,
        },
        {
          groupDimension: "Entry Pathway",
          groupLabel: "Exchange Visiting Students",
          groupCount: 0,
          flaggedCount: 0,
          alertRatePercent: null,
          minGroupSizeThreshold: 10,
          insufficientData: true,
        },
      ],
      synthetic: true,
    });
  }),

  http.get("/api/analytics/clusters", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    if (!hasAnyRole(db.currentUser!, ["HOD", "ADMIN"])) {
      return HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Access restricted to HOD and ADMIN roles." } },
        { status: 403 }
      );
    }
    return HttpResponse.json({
      clusters: [
        {
          id: "CLUST-DSA-CS2024A",
          subject: "DSA",
          cohort: "CS-2024-A",
          groupSize: 60,
          minGroupSize: 10,
          affectedCount: 18,
          rate: 30.0,
          baselineRate: 12.0,
          flagged: true,
          insufficientData: false,
          signals: [
            "Morning 8:30 AM lab attendance dipped 18% between Weeks 3 and 5",
            "Midterm recursion and pointer module completion below cohort baseline",
          ],
          suggestedChecks: [
            "Review lab timetable overlap with transit schedules and concurrent project deadlines",
            "Check whether an optional afternoon lab practice block or peer-led study session is feasible",
          ],
          trend: [
            { period: "Wk 1", rate: 10.0, baselineRate: 11.5 },
            { period: "Wk 2", rate: 13.3, baselineRate: 11.8 },
            { period: "Wk 3", rate: 21.7, baselineRate: 12.0 },
            { period: "Wk 4", rate: 26.7, baselineRate: 12.0 },
            { period: "Wk 5", rate: 30.0, baselineRate: 12.0 },
          ],
          synthetic: true,
        },
        {
          id: "CLUST-DBMS-CS2024A",
          subject: "Database Systems",
          cohort: "CS-2024-A",
          groupSize: 60,
          minGroupSize: 10,
          affectedCount: 6,
          rate: 10.0,
          baselineRate: 11.5,
          flagged: false,
          insufficientData: false,
          signals: [
            "Lab submission and attendance pacing aligns with historical cohort baseline",
          ],
          suggestedChecks: [
            "Continue standard syllabus pacing and routine office hours",
          ],
          trend: [
            { period: "Wk 1", rate: 9.5, baselineRate: 11.0 },
            { period: "Wk 3", rate: 10.2, baselineRate: 11.5 },
            { period: "Wk 5", rate: 10.0, baselineRate: 11.5 },
          ],
          synthetic: true,
        },
        {
          id: "CLUST-OS-ECE2024B",
          subject: "Operating Systems",
          cohort: "ECE-2024-B",
          groupSize: 52,
          minGroupSize: 10,
          affectedCount: 5,
          rate: 9.6,
          baselineRate: 10.5,
          flagged: false,
          insufficientData: false,
          signals: [
            "Steady participation across weekly concurrency lab exercises",
          ],
          suggestedChecks: [
            "No curriculum pacing adjustment required at this stage",
          ],
          trend: [
            { period: "Wk 1", rate: 8.8, baselineRate: 10.5 },
            { period: "Wk 3", rate: 9.4, baselineRate: 10.5 },
            { period: "Wk 5", rate: 9.6, baselineRate: 10.5 },
          ],
          synthetic: true,
        },
        {
          id: "CLUST-DSA-ME2025A",
          subject: "DSA",
          cohort: "ME-2025-A",
          groupSize: 6,
          minGroupSize: 10,
          affectedCount: null,
          rate: null,
          baselineRate: null,
          flagged: false,
          insufficientData: true,
          signals: [],
          suggestedChecks: [
            "Group size is below minimum threshold (n < 10); aggregate rates are suppressed to protect student privacy",
          ],
          trend: [],
          synthetic: true,
        },
      ],
      synthetic: true,
    });
  }),

  // Student App: My Support
  http.get("/api/my-support", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    return HttpResponse.json({
      cases: [
        {
          id: "C-104",
          status: db.cases["C-104"]?.status ?? "NEEDS_REVIEW",
          plainLanguageReason:
            "We noticed a recent dip in Data Structures lab attendance and midterm marks, alongside your request for peer tutoring.",
          supportType: db.cases["C-104"]?.selectedIntervention ?? "PEER_TUTOR",
          ownerName: "Dr. Priya Nair",
          ownerRole: "MENTOR",
          nextStepSummary:
            "Your mentor Dr. Priya Nair is reviewing peer tutoring options for Data Structures & Algorithms.",
          canDeclineOrDeferOptional: true,
          updatedAt: db.cases["C-104"]?.updatedAt ?? "2026-09-09T08:30:00.000Z",
        },
      ],
      synthetic: true,
    });
  }),

  // Student App: Check-ins
  http.post("/api/checkins", async ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const body = (await request.json()) as {
      contextNote: string;
      supportRequested: CheckInRecord["supportRequested"];
      optionalSupportDecision?: CheckInRecord["optionalSupportDecision"];
      sharingOptions: CheckInRecord["sharingOptions"];
    };
    const studentId = db.currentUser?.studentId ?? "S-104";
    const decision = body.optionalSupportDecision ?? "ACCEPT";
    const now = new Date().toISOString();
    const created: CheckInRecord = {
      id: `CHK-${Date.now()}`,
      studentId,
      contextNote: body.contextNote,
      supportRequested: body.supportRequested,
      optionalSupportDecision: decision,
      sharingOptions: body.sharingOptions,
      createdAt: now,
    };
    db.checkIns[created.id] = created;

    if (decision === "DEFER" || decision === "DECLINE") {
      const activeCase = Object.values(db.cases).find(
        (c) =>
          c.studentId === studentId &&
          (c.status === "NEEDS_REVIEW" || c.status === "ASSIGNED")
      );
      if (activeCase) {
        activeCase.status = decision === "DEFER" ? "DEFERRED" : "DECLINED";
        activeCase.version += 1;
        activeCase.updatedAt = now;
      }
    }

    return HttpResponse.json(created, { status: 201 });
  }),

  http.get("/api/checkins/:id", ({ params }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const id = String(params.id);
    const record = db.checkIns[id] ?? db.checkIns["CHK-101"];
    if (!record) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Check-in not found" } },
        { status: 404 }
      );
    }
    return HttpResponse.json(record);
  }),

  // Student App: Consent
  http.get("/api/consent", () => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    return HttpResponse.json({
      studentId: db.currentUser?.studentId ?? "S-104",
      grants: db.consents,
      synthetic: true,
    });
  }),

  http.patch("/api/consent", async ({ request }) => {
    const unauth = requireAuth();
    if (unauth) return unauth;
    const body = (await request.json()) as {
      scope: ConsentGrant["scope"];
      recipientRole: ConsentGrant["recipientRole"];
      granted: boolean;
    };
    const now = new Date().toISOString();
    const existingIdx = db.consents.findIndex(
      (g) => g.scope === body.scope && g.recipientRole === body.recipientRole
    );
    if (existingIdx >= 0) {
      db.consents[existingIdx] = {
        ...db.consents[existingIdx],
        granted: body.granted,
        updatedAt: now,
      };
    }
    return HttpResponse.json({
      studentId: db.currentUser?.studentId ?? "S-104",
      grants: db.consents,
      synthetic: true,
    });
  }),
];

