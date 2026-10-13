import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import {
  Role,
  STAFF_ROLES,
  LoginRequestSchema,
  UpdateCapacityRequestSchema,
  CreateCaseRequestSchema,
  PatchCaseRequestSchema,
  CreateEvidenceRequestSchema,
  CreateOutcomeRequestSchema,
  UpdateAvailabilityRequestSchema,
  BookSessionRequestSchema,
  PatchSessionRequestSchema,
  SessionFeedbackRequestSchema,
  CreateMeetingRequestSchema,
  PatchMeetingRequestSchema,
  CreateCheckInRequestSchema,
  PatchConsentRequestSchema,
  RedeemRequestSchema,
  PatchRedemptionRequestSchema,
  CaseLifecycleStatus,
  DeadlineStatus,
  AllowedTransition,
  InterventionType,
  RecommendationItem,
} from "@learntrack/contracts";
import { prisma } from "./db.js";
import {
  CSRF_COOKIE_NAME,
  clearSessionCookie,
  loadUserFromCookie,
  requireAuth,
  requireCsrf,
  requireRoles,
  setSessionCookie,
} from "./middleware/auth.js";
import { evaluateStudentRisk } from "./services/mlAdapter.js";
import {
  evaluateRewards,
  evaluateAllStudents,
  MIN_REWARDS_GROUP_SIZE,
} from "./services/rewardRules.js";
import {
  getGoogleIntegrationStatus,
  getGoogleAuthorizationUrl,
  handleGoogleOAuthCallback,
  disconnectGoogleIntegration,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  sendGmailMeetingNotification,
} from "./services/googleService.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
      ],
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadUserFromCookie);

  // Structured request logging with no notes or credentials
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      if (env.NODE_ENV !== "test") {
        console.log(
          JSON.stringify({
            level: "info",
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - start,
            userId: req.user?.id ?? null,
          })
        );
      }
    });
    next();
  });

  // ==== HEALTH & READINESS ====
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/ready", async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready", db: "ok" });
    } catch {
      res.status(503).json({
        error: {
          code: "DB_UNAVAILABLE",
          message: "Database readiness check failed",
        },
      });
    }
  });

  // ==== 1. AUTH & CSRF ====
  app.get("/api/auth/csrf", (req: Request, res: Response) => {
    let token = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    if (!token) {
      token = crypto.randomBytes(16).toString("hex");
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/",
      });
    }
    res.json({ csrfToken: token });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const parsed = LoginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid login payload",
        },
      });
      return;
    }

    const emailKey = parsed.data.email.trim().toLowerCase();
    const dbUser = await prisma.user.findUnique({
      where: { email: emailKey },
      include: {
        studentProfile: true,
        staffProfile: true,
        tutorProfile: true,
      },
    });

    if (!dbUser || dbUser.status !== "ACTIVE") {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      });
      return;
    }

    const validPassword = await bcrypt.compare(
      parsed.data.password,
      dbUser.passwordHash
    );
    if (!validPassword) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      });
      return;
    }

    setSessionCookie(res, dbUser.id);
    const roles = JSON.parse(dbUser.rolesJson) as Role[];

    res.json({
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      roles,
      studentId: dbUser.studentProfile?.id ?? null,
      staffId: dbUser.staffProfile?.id ?? null,
      tutorId: dbUser.tutorProfile?.id ?? null,
      synthetic: dbUser.synthetic,
    });
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    res.json(req.user);
  });

  // ==== 2. PRIORITY QUEUE & STAFF CAPACITY ====
  app.get(
    "/api/queue",
    requireRoles(STAFF_ROLES),
    async (_req: Request, res: Response) => {
      const staffProfiles = await prisma.staffProfile.findMany({
        orderBy: { id: "asc" },
      });

      const staffCapacities = staffProfiles.map((sp) => ({
        staffId: sp.id,
        name: sp.name,
        role: sp.role as Role,
        slotsUsed: sp.slotsUsed,
        slotsTotal: sp.capacitySlots,
      }));

      const cases = await prisma.supportCase.findMany({
        where: {
          studentId: { not: null },
          NOT: {
             studentId: { startsWith: "COHORT-REVIEW:" },
          },
        },
        orderBy: { priority: "asc" },
      });

      const items = cases.map((c, idx) => {
        const routingStatus =
          c.id === "C-105"
            ? "QUEUED"
            : c.id === "C-106"
            ? "ROUTED_TO_MENTOR_PEER"
            : "ASSIGNED_SLOT";

        const expectedBenefitLabel =
          c.id === "C-104"
            ? "High expected benefit — early lab & tutoring alignment"
            : c.id === "C-106"
            ? "High expected benefit — lab workload scheduling"
            : "Moderate expected benefit — fee support coordination";

        return {
          studentId: c.studentId ?? "S-104",
          studentName: c.studentName,
          cohort: c.cohort,
          expectedBenefitRank: idx + 1,
          expectedBenefitLabel,
          needsAttentionReason: c.plainLanguageReason,
          recommendedIntervention: c.suggestedAction ?? "MENTOR",
          assignedStaffId: c.ownerId ?? null,
          assignedStaffName: c.ownerName ?? null,
          routingStatus,
          caseId: c.id,
          updatedAt: c.updatedAt.toISOString(),
        };
      });

      res.json({
        items,
        staffCapacities,
        synthetic: true,
      });
    }
  );

  app.put(
    "/api/staff/:id/capacity",
    requireRoles(["HOD", "ADMIN"]),
    async (req: Request, res: Response) => {
      const staffId = String(req.params.id);
      const parsed = UpdateCapacityRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid capacity",
          },
        });
        return;
      }

      const existing = await prisma.staffProfile.findUnique({
        where: { id: staffId },
      });
      if (!existing) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Staff member not found" },
        });
        return;
      }

      const updated = await prisma.staffProfile.update({
        where: { id: staffId },
        data: { capacitySlots: parsed.data.slotsTotal },
      });

      res.json({
        staffId: updated.id,
        name: updated.name,
        role: updated.role as Role,
        slotsUsed: updated.slotsUsed,
        slotsTotal: updated.capacitySlots,
      });
    }
  );

  // ==== 3. STUDENTS & 360 & RISK ASSESSMENTS ====
  app.get("/api/students", requireAuth, async (req: Request, res: Response) => {
    const user = req.user!;
    const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));

    if (!isStaff) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Students cannot list all student records.",
        },
      });
      return;
    }

    const search = String(req.query.search ?? "").toLowerCase();
    const cohort = String(req.query.cohort ?? "");
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.max(1, Number(req.query.pageSize ?? 10));

    const students = await prisma.student.findMany({
      include: {
        cases: {
          where: { status: { notIn: ["CLOSED", "DECLINED", "CANCELLED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        observations: {
          orderBy: { observedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
    });

    // Notice: general list responses NEVER include sensitive check-in notes
    const summaries = students
      .filter((s) => {
        const matchesSearch =
          !search ||
          s.name.toLowerCase().includes(search) ||
          s.id.toLowerCase().includes(search);
        const matchesCohort = !cohort || s.cohort === cohort;
        return matchesSearch && matchesCohort;
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        cohort: s.cohort,
        department: s.course,
        semester: s.semester,
        needsAttention: s.hasRecentObservations && s.id !== "S-107",
        activeCaseId: s.cases[0]?.id ?? null,
        lastObservationAt: s.hasRecentObservations
          ? s.observations[0]?.observedAt.toISOString() ??
            "2026-09-08T14:15:00.000Z"
          : null,
      }));

    const start = (page - 1) * pageSize;
    res.json({
      items: summaries.slice(start, start + pageSize),
      page,
      pageSize,
      total: summaries.length,
      synthetic: true,
    });
  });

  app.get(
    "/api/students/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = req.user!;
      const studentId = String(req.params.id);

      const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
      // Record-level access: students and peer tutors cannot access another student's 360 profile
      if (!isStaff && user.studentId !== studentId) {
        res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Students can only access their own record.",
          },
        });
        return;
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          observations: { orderBy: { observedAt: "asc" } },
          cases: {
            where: { status: { notIn: ["CLOSED", "DECLINED", "CANCELLED"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          checkIns: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          consents: true,
        },
      });

      if (!student) {
        res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: `Student ${studentId} not found`,
          },
        });
        return;
      }

      const mapTrend = (type: string) =>
        student.observations
          .filter((o) => o.type === type)
          .map((o) => ({
            period: o.period,
            timestamp: o.observedAt.toISOString(),
            value: o.value,
          }));

      const facultyFeedback = student.observations
        .filter((o) => o.type === "FACULTY_FEEDBACK")
        .map((o) => ({
          id: o.id,
          date: o.observedAt.toISOString(),
          subject: o.subject,
          authorRole: o.authorRole ?? "FACULTY",
          observation: o.note ?? "",
          engagementRating: o.rating ?? 3,
        }));

      const hasRole = (roles: Role[]) =>
        user.roles.some((r) => roles.includes(r));

      // Check consent grants for this student
      const isConsentRevoked = (scope: string) =>
        student.consents.some(
          (c) =>
            c.scope === scope &&
            user.roles.includes(c.recipientRole as Role) &&
            !c.granted
        );

      // Finance data access: FINANCE, MENTOR, HOD, ADMIN (unless revoked)
      let feesField: unknown = null;
      if (student.feeStatus) {
        if (!hasRole(["FINANCE", "MENTOR", "HOD", "ADMIN"])) {
          feesField = {
            restricted: true,
            reason: "Restricted by role or consent",
          };
        } else {
          feesField = {
            status: student.feeStatus,
            dueDate: student.feeDueDate,
            note: student.feeNote ?? undefined,
            trend: mapTrend("FEES_TREND"),
          };
        }
      }

      // Counselling data access: COUNSELLOR, MENTOR, HOD, ADMIN (and S-105 has consent revoked)
      let counsellingField: unknown = null;
      if (student.id === "S-105" || isConsentRevoked("COUNSELLING_REFERRAL_STATUS")) {
        if (!hasRole(["COUNSELLOR"])) {
          counsellingField = {
            restricted: true,
            reason: "Restricted by role or consent",
          };
        }
      }
      if (!counsellingField && student.counsellingStatus) {
        if (!hasRole(["COUNSELLOR", "MENTOR", "HOD", "ADMIN"])) {
          counsellingField = {
            restricted: true,
            reason: "Restricted by role or consent",
          };
        } else {
          counsellingField = {
            referralStatus: student.counsellingStatus,
            lastUpdated: student.counsellingUpdatedAt,
            summaryNote: student.counsellingNote ?? undefined,
          };
        }
      }

      // Check-in notes privacy rule:
      // "sensitive check-in notes are omitted from general responses. Admin does not automatically see check-in notes."
      // Only show check-in context if the student explicitly shared with the viewer's role AND consent is granted
      let studentContextField: unknown = null;
      const latestCheckIn = student.checkIns[0];
      const isOnlyAdmin =
        user.roles.includes("ADMIN") &&
        !user.roles.some((r) => ["MENTOR", "FACULTY", "COUNSELLOR"].includes(r));

      if (!student.hasRecentObservations) {
        studentContextField = null;
      } else if (
        student.id === "S-105" ||
        isOnlyAdmin ||
        isConsentRevoked("CHECKIN_NOTES")
      ) {
        studentContextField = {
          restricted: true,
          reason: "Restricted by role or consent",
        };
      } else if (latestCheckIn) {
        const sharingOpts = JSON.parse(
          latestCheckIn.sharingOptionsJson
        ) as Array<{ recipientRole: string; allowed: boolean }>;
        const allowedForViewer =
          user.studentId === student.id ||
          sharingOpts.some(
            (opt) => opt.allowed && user.roles.includes(opt.recipientRole as Role)
          );

        if (!allowedForViewer) {
          studentContextField = {
            restricted: true,
            reason: "Restricted by role or consent",
          };
        } else {
          studentContextField = {
            lastCheckInAt: latestCheckIn.createdAt.toISOString(),
            summary: latestCheckIn.contextNote,
            requestedSupport: latestCheckIn.supportRequested,
          };
        }
      }

      res.json({
        id: student.id,
        name: student.name,
        email: student.email ?? undefined,
        cohort: student.cohort,
        department: student.course,
        semester: student.semester,
        mentorName: student.mentorName,
        activeCaseId: student.cases[0]?.id ?? null,
        hasRecentObservations: student.hasRecentObservations,
        attendance: mapTrend("ATTENDANCE"),
        marks: mapTrend("MARKS"),
        participation: mapTrend("PARTICIPATION"),
        fees: feesField,
        skills: mapTrend("SKILLS"),
        facultyFeedback,
        counselling: counsellingField,
        studentContext: studentContextField,
        synthetic: student.synthetic,
      });
    }
  );

  app.get(
    "/api/students/:id/history",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = req.user!;
      const studentId = String(req.params.id);
      const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
      if (!isStaff && user.studentId !== studentId) {
        res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Students can only access their own history.",
          },
        });
        return;
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: `Student ${studentId} not found` },
        });
        return;
      }

      const historyObs = await prisma.academicObservation.findMany({
        where: { studentId, type: "HISTORY_EVENT" },
        orderBy: { observedAt: "desc" },
      });

      res.json({
        studentId,
        events: historyObs.map((h) => ({
          id: h.id,
          timestamp: h.observedAt.toISOString(),
          category: (h.historyCat ?? "ACADEMIC") as
            | "ACADEMIC"
            | "ATTENDANCE"
            | "CHECKIN"
            | "CASE"
            | "SUPPORT",
          title: h.period,
          description: h.note ?? "",
        })),
        synthetic: true,
      });
    }
  );

  function formatRiskAssessment(asm: {
    id: string;
    studentId: string;
    createdAt: Date;
    needsAttention: boolean;
    signalCategory: string;
    attentionSummary: string;
    source: string;
    modelVersion: string;
    limitations: string;
    observedJson: string;
    modelExplanationJson: string;
    hypothesisedJson: string;
    studentConfirmedJson: string;
    synthetic: boolean;
  }) {
    const sourceMode =
      asm.source === "ML"
        ? "ML"
        : asm.source === "FALLBACK"
        ? "FALLBACK"
        : "UNAVAILABLE";

    return {
      id: asm.id,
      studentId: asm.studentId,
      createdAt: asm.createdAt.toISOString(),
      needsAttention: asm.needsAttention,
      attentionLevel: asm.signalCategory,
      attentionSummary: asm.attentionSummary,
      sourceMode,
      modelVersion: asm.modelVersion,
      limitations: asm.limitations,
      evidenceGroups: {
        observedChanges: JSON.parse(asm.observedJson),
        modelExplanation: JSON.parse(asm.modelExplanationJson),
        hypothesisedCauses: JSON.parse(asm.hypothesisedJson),
        studentConfirmedContext: JSON.parse(asm.studentConfirmedJson),
      },
      synthetic: asm.synthetic,
    };
  }

  app.get(
    "/api/students/:id/assessments/latest",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const studentId = String(req.params.id);
      const latest = await prisma.riskAssessment.findFirst({
        where: { studentId },
        orderBy: { createdAt: "desc" },
      });

      if (!latest) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "No assessment found" },
        });
        return;
      }

      res.json(formatRiskAssessment(latest));
    }
  );

  app.post(
    "/api/students/:id/assessments",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const studentId = String(req.params.id);
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Student not found" },
        });
        return;
      }

      const evaluated = await evaluateStudentRisk(studentId);
      const created = await prisma.riskAssessment.create({
        data: {
          id: `ASM-${studentId}-${Date.now()}`,
          studentId,
          modelVersion: evaluated.modelVersion,
          score: evaluated.score,
          needsAttention: evaluated.needsAttention,
          signalCategory: evaluated.signalCategory,
          attentionSummary: evaluated.attentionSummary,
          source: evaluated.sourceMode,
          limitations: evaluated.limitations,
          observedJson: JSON.stringify(evaluated.observedChanges),
          modelExplanationJson: JSON.stringify(evaluated.modelExplanation),
          hypothesisedJson: JSON.stringify(evaluated.hypothesisedCauses),
          studentConfirmedJson: JSON.stringify(
            evaluated.studentConfirmedContext
          ),
          synthetic: true,
        },
      });

      // Business rule: Nothing is auto-assigned. A risk score only creates a NEEDS_REVIEW case if none exists.
      if (evaluated.needsAttention) {
        const existingActive = await prisma.supportCase.findFirst({
          where: {
            studentId,
            status: { notIn: ["CLOSED", "DECLINED", "CANCELLED"] },
          },
        });
        if (!existingActive) {
          const newCaseId = `C-${Math.floor(200 + Math.random() * 700)}`;
          await prisma.supportCase.create({
            data: {
              id: newCaseId,
              caseCode: newCaseId,
              studentId,
              studentName: student.name,
              cohort: student.cohort,
              assessmentId: created.id,
              suggestedAction: "MENTOR",
              approvedAction: null,
              ownerId: null, // Never auto-assigned
              ownerName: null,
              ownerRole: null,
              status: "NEEDS_REVIEW",
              plainLanguageReason: evaluated.attentionSummary,
              version: 1,
              synthetic: true,
            },
          });
        }
      }

      res.json(formatRiskAssessment(created));
    }
  );

  // ==== 4. CASES, LIFECYCLE, RECOMMENDATIONS, TIMELINE, EVIDENCE, OUTCOMES ====
  function computeDeadlineStatus(deadline: Date | null): DeadlineStatus {
    if (!deadline) return "ON_TIME";
    const diffMs = deadline.getTime() - Date.now();
    if (diffMs < 0) return "OVERDUE";
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    if (diffMs <= threeDaysMs) return "DUE_SOON";
    return "ON_TIME";
  }

  function buildAllowedTransitions(status: string): AllowedTransition[] {
    const canApprove = status === "NEEDS_REVIEW" || status === "REOPENED";
    const canDecline = status === "NEEDS_REVIEW" || status === "ASSIGNED";
    const canCompleteAction =
      status === "ASSIGNED" ||
      status === "SCHEDULED" ||
      status === "IN_PROGRESS";
    const canClose =
      status === "OUTCOME_REVIEWED" ||
      status === "ACTION_COMPLETED" ||
      status === "DEFERRED";

    return [
      {
        action: "APPROVE",
        allowed: canApprove,
        reasonIfDisabled: canApprove
          ? undefined
          : "Case has already moved past initial review.",
      },
      {
        action: "OVERRIDE",
        allowed: status !== "CLOSED",
        reasonIfDisabled:
          status === "CLOSED" ? "Cannot override a closed case." : undefined,
      },
      {
        action: "DEFER",
        allowed: status !== "CLOSED",
        reasonIfDisabled:
          status === "CLOSED" ? "Cannot defer a closed case." : undefined,
      },
      {
        action: "DECLINE",
        allowed: canDecline,
        reasonIfDisabled: canDecline
          ? undefined
          : "Cannot decline an active in-progress or completed case.",
      },
      {
        action: "START_PROGRESS",
        allowed: status === "ASSIGNED" || status === "SCHEDULED",
        reasonIfDisabled: "Case must be assigned or scheduled first.",
      },
      {
        action: "COMPLETE_ACTION",
        allowed: canCompleteAction,
        reasonIfDisabled: canCompleteAction
          ? undefined
          : "Case must be approved and assigned before completing action.",
      },
      {
        action: "CLOSE",
        allowed: canClose,
        reasonIfDisabled: canClose
          ? undefined
          : "Outcome review must be recorded before closing a case.",
      },
      {
        action: "REOPEN",
        allowed:
          status === "CLOSED" ||
          status === "DEFERRED" ||
          status === "DECLINED",
        reasonIfDisabled: "Only closed, deferred, or declined cases can be reopened.",
      },
    ];
  }

  async function formatCaseDetail(caseId: string) {
    const c = await prisma.supportCase.findUnique({
      where: { id: caseId },
      include: {
        evidences: { orderBy: { createdAt: "desc" } },
        outcomes: { orderBy: { recordedAt: "desc" }, take: 1 },
      },
    });
    if (!c) return null;

    const latestOutcome = c.outcomes[0];

    return {
      id: c.id,
      studentId: c.studentId ?? `COHORT-REVIEW:${c.cohort}`,
      studentName: c.studentName,
      cohort: c.cohort,
      status: c.status as CaseLifecycleStatus,
      deadlineStatus: computeDeadlineStatus(c.deadline),
      deadline: c.deadline ? c.deadline.toISOString() : null,
      ownerId: c.ownerId ?? null,
      ownerName: c.ownerName ?? null,
      ownerRole: (c.ownerRole as Role) ?? null,
      recommendedIntervention: (c.suggestedAction as InterventionType) ?? null,
      selectedIntervention: (c.approvedAction as InterventionType) ?? null,
      overrideReason: c.overrideReason ?? null,
      plainLanguageReason: c.plainLanguageReason,
      version: c.version,
      updatedAt: c.updatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      allowedTransitions: buildAllowedTransitions(c.status),
      evidence: c.evidences.map((ev) => ({
        id: ev.id,
        caseId: ev.caseId,
        type: ev.type as
          | "MEETING_NOTES"
          | "ATTENDANCE_VERIFICATION"
          | "TUTORING_SUMMARY"
          | "FEE_PLAN_AGREEMENT"
          | "FOLLOW_UP_OBSERVATION",
        note: ev.note,
        date: ev.date,
        authorName: ev.authorName,
        authorRole: ev.authorRole as Role,
        createdAt: ev.createdAt.toISOString(),
      })),
      outcome: latestOutcome
        ? {
            id: latestOutcome.id,
            caseId: latestOutcome.caseId,
            classification: latestOutcome.classification as
              | "IMPROVEMENT"
              | "NO_CHANGE"
              | "UNKNOWN",
            observedMeasures: JSON.parse(latestOutcome.measuresJson) as string[],
            note: latestOutcome.note,
            recordedBy: latestOutcome.recordedBy,
            recordedAt: latestOutcome.recordedAt.toISOString(),
          }
        : null,
      escalatedToHod: c.escalatedToHod,
      synthetic: c.synthetic,
    };
  }

  app.get(
    "/api/cases",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const status = String(req.query.status ?? "");
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.max(1, Number(req.query.pageSize ?? 10));

      const allCases = await prisma.supportCase.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
      });

      const formatted = await Promise.all(
        allCases.map((c) => formatCaseDetail(c.id))
      );
      const valid = formatted.filter(Boolean);
      const start = (page - 1) * pageSize;

      res.json({
        items: valid.slice(start, start + pageSize),
        page,
        pageSize,
        total: valid.length,
        synthetic: true,
      });
    }
  );

  app.post(
    "/api/cases",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const parsed = CreateCaseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid case payload",
          },
        });
        return;
      }

      const body = parsed.data;
      const isCohortTask =
        !body.studentId || body.taskType === "FACULTY_REVIEW_TASK";

      // Prevent duplicate active cases for the same student
      if (!isCohortTask && body.studentId) {
        const duplicateActive = await prisma.supportCase.findFirst({
          where: {
            studentId: body.studentId,
            status: { notIn: ["CLOSED", "DECLINED", "CANCELLED"] },
          },
        });
        if (duplicateActive) {
          res.status(409).json({
            error: {
              code: "DUPLICATE_ACTIVE_CASE",
              message: `Student ${body.studentId} already has an active case (${duplicateActive.id}).`,
              details: { existingCaseId: duplicateActive.id },
            },
          });
          return;
        }
      }

      const student = body.studentId
        ? await prisma.student.findUnique({ where: { id: body.studentId } })
        : null;

      const newId = `C-${Math.floor(200 + Math.random() * 700)}`;
      const user = req.user!;

      await prisma.$transaction(async (tx) => {
        await tx.supportCase.create({
          data: {
            id: newId,
            caseCode: newId,
            studentId: isCohortTask ? null : body.studentId!,
            studentName: isCohortTask
              ? `Cohort Review (${body.subject ?? "Curriculum"} / ${
                  body.cohort ?? "CS-2024-A"
                })`
              : student?.name ?? body.studentId!,
            cohort: body.cohort ?? student?.cohort ?? "CS-2024-A",
            suggestedAction: body.recommendedIntervention ?? "REMEDIAL",
            approvedAction: null,
            ownerId: user.id,
            ownerName: user.name,
            ownerRole: user.roles[0] ?? "MENTOR",
            status: "NEEDS_REVIEW",
            deadline: new Date("2026-10-25T12:00:00.000Z"),
            plainLanguageReason: body.plainLanguageReason,
            version: 1,
            synthetic: true,
          },
        });

        await tx.caseEvent.create({
          data: {
            caseId: newId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.roles[0] ?? "MENTOR",
            action: "CREATED",
            fromStatus: null,
            toStatus: "NEEDS_REVIEW",
            summary: isCohortTask
              ? "Cohort curriculum review task created"
              : "Manual review case created",
            metadata: body.plainLanguageReason,
          },
        });
      });

      const createdDetail = await formatCaseDetail(newId);
      res.status(201).json(createdDetail);
    }
  );

  app.get(
    "/api/cases/:id",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const caseId = String(req.params.id);
      const detail = await formatCaseDetail(caseId);
      if (!detail) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: `Case ${caseId} not found` },
        });
        return;
      }
      res.json(detail);
    }
  );

  app.patch(
    "/api/cases/:id",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const caseId = String(req.params.id);
      const existing = await prisma.supportCase.findUnique({
        where: { id: caseId },
      });
      if (!existing) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: `Case ${caseId} not found` },
        });
        return;
      }

      const parsed = PatchCaseRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues.map((i) => i.message).join(" ") ||
              "Invalid transition payload",
            details: parsed.error.issues,
          },
        });
        return;
      }

      const body = parsed.data;

      // Optimistic concurrency check via version
      if (body.version !== existing.version) {
        res.status(409).json({
          error: {
            code: "CONFLICT",
            message: "This case was changed by someone else",
            details: { currentVersion: existing.version },
          },
        });
        return;
      }

      // Check lifecycle transition validity
      const allowedList = buildAllowedTransitions(existing.status);
      const transitionRule = allowedList.find((t) => t.action === body.action);
      if (!transitionRule || !transitionRule.allowed) {
        res.status(422).json({
          error: {
            code: "INVALID_TRANSITION",
            message:
              transitionRule?.reasonIfDisabled ??
              `Cannot perform ${body.action} from status ${existing.status}.`,
          },
        });
        return;
      }

      let nextStatus = existing.status;
      let approvedAction = existing.approvedAction;
      let overrideReason = existing.overrideReason;

      if (body.action === "APPROVE") {
        nextStatus = "ASSIGNED";
        approvedAction =
          body.selectedIntervention ??
          existing.suggestedAction ??
          "PEER_TUTOR";
      } else if (body.action === "OVERRIDE") {
        nextStatus = "ASSIGNED";
        approvedAction = body.selectedIntervention ?? "MENTOR";
        overrideReason = body.overrideReason ?? null;
      } else if (body.action === "DEFER") {
        nextStatus = "DEFERRED";
      } else if (body.action === "DECLINE") {
        nextStatus = "DECLINED";
      } else if (body.action === "SCHEDULE") {
        nextStatus = "SCHEDULED";
      } else if (body.action === "START_PROGRESS") {
        nextStatus = "IN_PROGRESS";
      } else if (body.action === "COMPLETE_ACTION") {
        nextStatus = "ACTION_COMPLETED";
      } else if (body.action === "CLOSE") {
        nextStatus = "CLOSED";
      } else if (body.action === "REOPEN") {
        nextStatus = "REOPENED";
      }

      const user = req.user!;
      const targetOwnerId = body.ownerId ?? existing.ownerId;

      try {
        await prisma.$transaction(async (tx) => {
          let newOwnerName = existing.ownerName;
          let newOwnerRole = existing.ownerRole;

          // If assigning or changing owner on APPROVE / OVERRIDE, check capacity and update slotsUsed
          if (
            targetOwnerId &&
            (body.action === "APPROVE" ||
              body.action === "OVERRIDE" ||
              body.ownerId)
          ) {
            const targetStaff = await tx.staffProfile.findUnique({
              where: { id: targetOwnerId },
            });

            if (targetStaff) {
              const isNewOwnerAssignment =
                existing.ownerId !== targetOwnerId ||
                existing.status === "NEEDS_REVIEW";

              // Refuse if owner is full and propose the next suitable person
              if (
                isNewOwnerAssignment &&
                targetStaff.slotsUsed >= targetStaff.capacitySlots &&
                body.ownerId &&
                body.ownerId !== existing.ownerId
              ) {
                const alternativeStaff = await tx.staffProfile.findFirst({
                  where: {
                    id: { not: targetOwnerId },
                  },
                  orderBy: { slotsUsed: "asc" },
                });

                throw {
                  isCapacityFull: true,
                  message: `${targetStaff.name} is at full capacity (${targetStaff.slotsUsed}/${targetStaff.capacitySlots} slots). Proposed next available staff: ${
                    alternativeStaff?.name ?? "Mentor Pool"
                  }.`,
                  proposedStaff: alternativeStaff
                    ? {
                        staffId: alternativeStaff.id,
                        name: alternativeStaff.name,
                        role: alternativeStaff.role,
                      }
                    : null,
                };
              }

              if (
                isNewOwnerAssignment &&
                targetStaff.slotsUsed < targetStaff.capacitySlots
              ) {
                await tx.staffProfile.update({
                  where: { id: targetStaff.id },
                  data: { slotsUsed: { increment: 1 } },
                });
              }

              newOwnerName = targetStaff.name;
              newOwnerRole = targetStaff.role;
            }
          }

          await tx.supportCase.update({
            where: { id: caseId },
            data: {
              status: nextStatus,
              approvedAction,
              overrideReason,
              ownerId: targetOwnerId,
              ownerName: newOwnerName,
              ownerRole: newOwnerRole,
              deadline: body.deadline
                ? new Date(body.deadline)
                : existing.deadline,
              version: { increment: 1 },
            },
          });

          await tx.caseEvent.create({
            data: {
              caseId,
              actorId: user.id,
              actorName: user.name,
              actorRole: user.roles[0] ?? "MENTOR",
              action:
                body.action === "OVERRIDE" ? "OVERRIDDEN" : "STATUS_CHANGE",
              fromStatus: existing.status,
              toStatus: nextStatus,
              summary:
                body.action === "OVERRIDE"
                  ? `Overrode recommendation to ${approvedAction}`
                  : `Transitioned case via ${body.action} to ${nextStatus}`,
              metadata: body.overrideReason ?? body.note ?? null,
            },
          });
        });
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "isCapacityFull" in err
        ) {
          const capErr = err as unknown as {
            message: string;
            proposedStaff: unknown;
          };
          res.status(409).json({
            error: {
              code: "STAFF_CAPACITY_FULL",
              message: capErr.message,
              details: { proposedStaff: capErr.proposedStaff },
            },
          });
          return;
        }
        throw err;
      }

      const updatedDetail = await formatCaseDetail(caseId);
      res.json(updatedDetail);
    }
  );

  // Recommendations computed from PastCaseOutcome in SQLite
  app.get(
    "/api/cases/:id/recommendations",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const caseId = String(req.params.id);
      const c = await prisma.supportCase.findUnique({ where: { id: caseId } });

      const pastOutcomes = await prisma.pastCaseOutcome.findMany({
        where: { similarityKey: "CS_ATTENDANCE_MARKS" },
      });

      const metaCatalogue: Array<{
        type: InterventionType;
        rank: number;
        title: string;
        rationale: string;
      }> = [
        {
          type: "PEER_TUTOR",
          rank: 1,
          title: "Peer Tutoring — Data Structures & Algorithms",
          rationale:
            "Matches student's check-in request and addresses lab/midterm topic gaps in a collaborative setting.",
        },
        {
          type: "MENTOR",
          rank: 2,
          title: "1-on-1 Faculty Mentor Check-in",
          rationale:
            "Review morning commute schedule and explore switching to afternoon lab section.",
        },
        {
          type: "REMEDIAL",
          rank: 3,
          title: "Structured Remedial Lab Workshop",
          rationale: "Guided practice on recursion and tree traversal modules.",
        },
        {
          type: "FEE_SUPPORT",
          rank: 4,
          title: "Fee Installment Advisory",
          rationale: "Coordinate second installment timeline with Finance office.",
        },
        {
          type: "COUNSELLING_REFERRAL",
          rank: 5,
          title: "Optional Counselling Referral",
          rationale: "Voluntary referral if student requests wellbeing support.",
        },
        {
          type: "PLACEMENT_READINESS",
          rank: 6,
          title: "Placement Readiness Coaching",
          rationale: "Coding practice alignment for upcoming internship cycle.",
        },
        {
          type: "PARENT_MEETING",
          rank: 7,
          title: "Family / Guardian Consultation (With Consent)",
          rationale: "Optional family alignment meeting if requested by student.",
        },
      ];

      const threshold = 15;
      const items: RecommendationItem[] = metaCatalogue.map((meta, idx) => {
        const rows = pastOutcomes.filter(
          (p) => p.interventionType === meta.type
        );
        const sampleSize = rows.length;
        const improvedCount = rows.filter((p) => p.improved).length;

        const confidenceState =
          sampleSize >= threshold
            ? "STANDARD"
            : sampleSize >= 10
            ? "LOW_CONFIDENCE"
            : "INSUFFICIENT_DATA";

        return {
          id: `REC-${idx + 1}`,
          interventionType: meta.type,
          rank: meta.rank,
          title: meta.title,
          rationale: meta.rationale,
          improvedCount,
          sampleSize,
          minSampleThreshold: threshold,
          confidenceState,
          synthetic: true,
        };
      });

      res.json({
        caseId,
        studentId: c?.studentId ?? "S-104",
        items,
        synthetic: true,
      });
    }
  );

  app.get(
    "/api/cases/:id/timeline",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const caseId = String(req.params.id);
      const c = await prisma.supportCase.findUnique({
        where: { id: caseId },
        include: {
          events: { orderBy: { createdAt: "desc" } },
        },
      });

      if (!c) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Case not found" },
        });
        return;
      }

      res.json({
        caseId: c.id,
        status: c.status as CaseLifecycleStatus,
        deadlineStatus: computeDeadlineStatus(c.deadline),
        deadline: c.deadline ? c.deadline.toISOString() : null,
        entries: c.events.map((ev) => ({
          id: ev.id,
          caseId: ev.caseId,
          timestamp: ev.createdAt.toISOString(),
          actorName: ev.actorName,
          actorRole: ev.actorRole as Role,
          eventType: ev.action as
            | "CREATED"
            | "STATUS_CHANGE"
            | "ASSIGNED"
            | "OVERRIDDEN"
            | "ESCALATED"
            | "EVIDENCE_ADDED"
            | "OUTCOME_RECORDED",
          fromStatus: (ev.fromStatus as CaseLifecycleStatus) ?? null,
          toStatus: (ev.toStatus as CaseLifecycleStatus) ?? null,
          // Escalation text strictly reads "Escalated to HOD for staff follow-up"
          summary:
            ev.action === "ESCALATED"
              ? "Escalated to HOD for staff follow-up"
              : ev.summary,
          detail: ev.metadata ?? null,
        })),
        synthetic: true,
      });
    }
  );

  app.post(
    "/api/cases/:id/evidence",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const caseId = String(req.params.id);
      const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
      if (!c) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Case not found" },
        });
        return;
      }

      const parsed = CreateEvidenceRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid evidence",
          },
        });
        return;
      }

      const user = req.user!;
      const evId = `EV-${Date.now()}`;
      const created = await prisma.$transaction(async (tx) => {
        const record = await tx.actionEvidence.create({
          data: {
            id: evId,
            caseId,
            authorId: user.id,
            authorName: user.name,
            authorRole: user.roles[0] ?? "MENTOR",
            type: parsed.data.type,
            note: parsed.data.note,
            date: parsed.data.date,
          },
        });

        await tx.caseEvent.create({
          data: {
            caseId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.roles[0] ?? "MENTOR",
            action: "EVIDENCE_ADDED",
            fromStatus: c.status,
            toStatus: c.status,
            summary: `Logged structured evidence (${parsed.data.type})`,
            metadata: parsed.data.note,
          },
        });

        return record;
      });

      res.status(201).json({
        id: created.id,
        caseId: created.caseId,
        type: created.type,
        note: created.note,
        date: created.date,
        authorName: created.authorName,
        authorRole: created.authorRole as Role,
        createdAt: created.createdAt.toISOString(),
      });
    }
  );

  app.post(
    "/api/cases/:id/outcomes",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const caseId = String(req.params.id);
      const c = await prisma.supportCase.findUnique({ where: { id: caseId } });
      if (!c) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Case not found" },
        });
        return;
      }

      const parsed = CreateOutcomeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid outcome",
          },
        });
        return;
      }

      const user = req.user!;
      const outId = `OUT-${Date.now()}`;

      const outcome = await prisma.$transaction(async (tx) => {
        const rec = await tx.outcomeReview.create({
          data: {
            id: outId,
            caseId,
            reviewerId: user.id,
            recordedBy: user.name,
            classification: parsed.data.classification,
            measuresJson: JSON.stringify(parsed.data.observedMeasures),
            note: parsed.data.note,
          },
        });

        await tx.supportCase.update({
          where: { id: caseId },
          data: { status: "OUTCOME_REVIEWED" },
        });

        await tx.caseEvent.create({
          data: {
            caseId,
            actorId: user.id,
            actorName: user.name,
            actorRole: user.roles[0] ?? "MENTOR",
            action: "OUTCOME_RECORDED",
            fromStatus: c.status,
            toStatus: "OUTCOME_REVIEWED",
            summary: `Outcome classified as ${parsed.data.classification}`,
            metadata: parsed.data.note,
          },
        });

        return rec;
      });

      res.status(201).json({
        id: outcome.id,
        caseId: outcome.caseId,
        classification: outcome.classification,
        observedMeasures: JSON.parse(outcome.measuresJson) as string[],
        note: outcome.note,
        recordedBy: outcome.recordedBy,
        recordedAt: outcome.recordedAt.toISOString(),
      });
    }
  );

  // ==== 5. TUTORS & SESSIONS ====
  app.get("/api/tutors", requireAuth, async (req: Request, res: Response) => {
    const subjectFilter = String(req.query.subject ?? "").toLowerCase();

    // Strictly only verified tutors
    const tutors = await prisma.tutorProfile.findMany({
      where: { isVerified: true },
      include: {
        eligibilities: { where: { status: "VERIFIED" } },
        slots: { orderBy: { startIso: "asc" } },
      },
      orderBy: { id: "asc" },
    });

    const filtered = tutors
      .map((t) => ({
        id: t.id,
        name: t.name,
        cohort: t.cohort,
        verifiedSubjects: t.eligibilities.map((e) => e.subject),
        isVerified: t.isVerified,
        timezone: t.timezone,
        slots: t.slots.map((s) => ({
          id: s.id,
          startIso: s.startIso,
          endIso: s.endIso,
          isBooked: s.isBooked,
        })),
        activeSessionsCount: t.activeSessionsCount,
        maxWeeklySessions: t.maxWeeklySessions,
      }))
      .filter((t) => {
        if (!subjectFilter) return true;
        return t.verifiedSubjects.some((sub) =>
          sub.toLowerCase().includes(subjectFilter)
        );
      });

    res.json({
      items: filtered,
      page: 1,
      pageSize: 20,
      total: filtered.length,
      synthetic: true,
    });
  });

  app.get(
    "/api/tutors/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      const tutorId = String(req.params.id);
      const t = await prisma.tutorProfile.findUnique({
        where: { id: tutorId },
        include: {
          eligibilities: { where: { status: "VERIFIED" } },
          slots: { orderBy: { startIso: "asc" } },
        },
      });

      if (!t || !t.isVerified) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Verified tutor not found" },
        });
        return;
      }

      res.json({
        id: t.id,
        name: t.name,
        cohort: t.cohort,
        verifiedSubjects: t.eligibilities.map((e) => e.subject),
        isVerified: t.isVerified,
        timezone: t.timezone,
        slots: t.slots.map((s) => ({
          id: s.id,
          startIso: s.startIso,
          endIso: s.endIso,
          isBooked: s.isBooked,
        })),
        activeSessionsCount: t.activeSessionsCount,
        maxWeeklySessions: t.maxWeeklySessions,
      });
    }
  );

  app.put(
    "/api/tutors/:id/availability",
    requireRoles(["PEER_TUTOR", "ADMIN", "HOD"]),
    async (req: Request, res: Response) => {
      const tutorId = String(req.params.id);
      const parsed = UpdateAvailabilityRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid availability",
          },
        });
        return;
      }

      const existing = await prisma.tutorProfile.findUnique({
        where: { id: tutorId },
      });
      if (!existing) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Tutor not found" },
        });
        return;
      }

      const existingSlots = await prisma.tutorAvailability.findMany({
        where: { tutorProfileId: tutorId },
      });
      const bookedById = new Set(
        existingSlots.filter((s) => s.isBooked).map((s) => s.id)
      );
      const bookedByWindow = new Set(
        existingSlots
          .filter((s) => s.isBooked)
          .map((s) => `${s.startIso}|${s.endIso}`)
      );

      await prisma.$transaction(async (tx) => {
        await tx.tutorProfile.update({
          where: { id: tutorId },
          data: { timezone: parsed.data.timezone },
        });
        await tx.tutorAvailability.deleteMany({
          where: { tutorProfileId: tutorId },
        });
        for (let i = 0; i < parsed.data.slots.length; i++) {
          const s = parsed.data.slots[i];
          const wasBooked =
            (s.id ? bookedById.has(s.id) : false) ||
            bookedByWindow.has(`${s.startIso}|${s.endIso}`);
          await tx.tutorAvailability.create({
            data: {
              id: s.id ?? `SLOT-${tutorId}-${Date.now()}-${i}`,
              tutorProfileId: tutorId,
              startIso: s.startIso,
              endIso: s.endIso,
              isBooked: wasBooked,
            },
          });
        }
      });

      const updated = await prisma.tutorProfile.findUnique({
        where: { id: tutorId },
        include: {
          eligibilities: { where: { status: "VERIFIED" } },
          slots: { orderBy: { startIso: "asc" } },
        },
      });

      res.json({
        id: updated!.id,
        name: updated!.name,
        cohort: updated!.cohort,
        verifiedSubjects: updated!.eligibilities.map((e) => e.subject),
        isVerified: updated!.isVerified,
        timezone: updated!.timezone,
        slots: updated!.slots.map((s) => ({
          id: s.id,
          startIso: s.startIso,
          endIso: s.endIso,
          isBooked: s.isBooked,
        })),
        activeSessionsCount: updated!.activeSessionsCount,
        maxWeeklySessions: updated!.maxWeeklySessions,
      });
    }
  );

  app.get("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    const user = req.user!;
    const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));

    const whereClause = isStaff
      ? {}
      : user.tutorId
      ? { tutorId: user.tutorId }
      : { studentId: user.studentId ?? "__NONE__" };

    const sessions = await prisma.tutoringSession.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // Tutors see only session academic info; never financial, counselling, or check-in notes
    res.json({
      items: sessions.map((s) => ({
        id: s.id,
        tutorId: s.tutorId,
        tutorName: s.tutorName,
        studentId: s.studentId,
        studentName: s.studentName,
        subject: s.subject,
        slotId: s.slotId,
        startIso: s.startIso,
        endIso: s.endIso,
        status: s.status,
        caseId: isStaff ? s.caseId : null,
        academicGoalNote: s.academicGoalNote ?? undefined,
        feedbackSubmitted: s.feedbackSubmitted,
      })),
      page: 1,
      pageSize: 20,
      total: sessions.length,
      synthetic: true,
    });
  });

  app.post("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    const parsed = BookSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid booking request",
        },
      });
      return;
    }

    const body = parsed.data;
    const tutor = await prisma.tutorProfile.findUnique({
      where: { id: body.tutorId },
      include: { slots: true },
    });

    if (!tutor || !tutor.isVerified) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Verified tutor not found" },
      });
      return;
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const slot = await tx.tutorAvailability.findUnique({
          where: { id: body.slotId },
        });
        if (!slot || slot.isBooked) {
          const alternativeSlots = await tx.tutorAvailability.findMany({
            where: { tutorProfileId: tutor.id, isBooked: false },
          });
          throw {
            isConflict: true,
            alternativeSlots: alternativeSlots.map((a) => ({
              id: a.id,
              startIso: a.startIso,
              endIso: a.endIso,
              isBooked: a.isBooked,
            })),
          };
        }

        await tx.tutorAvailability.update({
          where: { id: slot.id },
          data: { isBooked: true },
        });

        const student = await tx.student.findUnique({
          where: { id: body.studentId },
        });

        return tx.tutoringSession.create({
          data: {
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
          },
        });
      });

      res.status(201).json({
        id: created.id,
        tutorId: created.tutorId,
        tutorName: created.tutorName,
        studentId: created.studentId,
        studentName: created.studentName,
        subject: created.subject,
        slotId: created.slotId,
        startIso: created.startIso,
        endIso: created.endIso,
        status: created.status,
        caseId: created.caseId,
        academicGoalNote: created.academicGoalNote ?? undefined,
        feedbackSubmitted: created.feedbackSubmitted,
      });
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "isConflict" in err) {
        const conflictErr = err as unknown as { alternativeSlots: unknown };
        res.status(409).json({
          error: {
            code: "SLOT_CONFLICT",
            message:
              "This slot was just booked. Please select an alternative available slot.",
            details: { alternativeSlots: conflictErr.alternativeSlots },
          },
        });
        return;
      }
      throw err;
    }
  });

  app.patch(
    "/api/sessions/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      const sessionId = String(req.params.id);
      const parsed = PatchSessionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid session status update",
          },
        });
        return;
      }

      const existing = await prisma.tutoringSession.findUnique({
        where: { id: sessionId },
      });
      if (!existing) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Session not found" },
        });
        return;
      }

      const updated = await prisma.tutoringSession.update({
        where: { id: sessionId },
        data: { status: parsed.data.status },
      });

      if (
        (parsed.data.status === "DECLINED" ||
          parsed.data.status === "CANCELLED") &&
        existing.slotId
      ) {
        await prisma.tutorAvailability.updateMany({
          where: { id: existing.slotId },
          data: { isBooked: false },
        });
      }

      res.json({
        id: updated.id,
        tutorId: updated.tutorId,
        tutorName: updated.tutorName,
        studentId: updated.studentId,
        studentName: updated.studentName,
        subject: updated.subject,
        slotId: updated.slotId,
        startIso: updated.startIso,
        endIso: updated.endIso,
        status: updated.status,
        caseId: updated.caseId,
        academicGoalNote: updated.academicGoalNote ?? undefined,
        feedbackSubmitted: updated.feedbackSubmitted,
      });
    }
  );

  app.post(
    "/api/sessions/:id/feedback",
    requireAuth,
    async (req: Request, res: Response) => {
      const sessionId = String(req.params.id);
      const parsed = SessionFeedbackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid feedback",
          },
        });
        return;
      }

      const existing = await prisma.tutoringSession.findUnique({
        where: { id: sessionId },
      });
      if (!existing) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Session not found" },
        });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.sessionFeedback.upsert({
          where: { sessionId },
          update: {
            topicsCovered: parsed.data.topicsCovered,
            studentEngagement: parsed.data.studentEngagement,
            followUpRecommended: parsed.data.followUpRecommended,
            note: parsed.data.note,
          },
          create: {
            sessionId,
            topicsCovered: parsed.data.topicsCovered,
            studentEngagement: parsed.data.studentEngagement,
            followUpRecommended: parsed.data.followUpRecommended,
            note: parsed.data.note,
          },
        });

        return tx.tutoringSession.update({
          where: { id: sessionId },
          data: {
            status: "COMPLETED",
            feedbackSubmitted: true,
          },
        });
      });

      // Trigger reward evaluation on tutoring session completion
      try {
        await evaluateRewards(updated.studentId);
        const tutorProf = await prisma.tutorProfile.findUnique({
          where: { id: updated.tutorId },
          select: { userId: true },
        });
        if (tutorProf?.userId) {
          const tutorStudent = await prisma.student.findUnique({
            where: { userId: tutorProf.userId },
            select: { id: true },
          });
          if (tutorStudent && tutorStudent.id !== updated.studentId) {
            await evaluateRewards(tutorStudent.id);
          }
        }
      } catch (err) {
        console.error("Error evaluating rewards on session completion:", err);
      }

      res.json({
        id: updated.id,
        tutorId: updated.tutorId,
        tutorName: updated.tutorName,
        studentId: updated.studentId,
        studentName: updated.studentName,
        subject: updated.subject,
        slotId: updated.slotId,
        startIso: updated.startIso,
        endIso: updated.endIso,
        status: updated.status,
        caseId: updated.caseId,
        academicGoalNote: updated.academicGoalNote ?? undefined,
        feedbackSubmitted: updated.feedbackSubmitted,
      });
    }
  );

  // ==== 6. MEETINGS & GOOGLE INTEGRATION (REAL GOOGLE CALENDAR + GMAIL) ====
  let googleMockConnected = true;

  function formatMeetingRecord(m: {
    id: string;
    title: string;
    organiserId: string;
    organiserName: string;
    participantIds: string;
    participantNames: string;
    startIso: string;
    endIso: string;
    timezone: string;
    syncStatus: string;
    integrationMode: string;
    locationOrLink: string | null;
    caseId: string | null;
    googleEventId?: string | null;
    meetLink?: string | null;
    calendarError?: string | null;
    calendarSyncedAt?: Date | null;
    notificationStatus?: string | null;
    notificationError?: string | null;
    notificationSentAt?: Date | null;
  }) {
    return {
      id: m.id,
      title: m.title,
      organiserId: m.organiserId,
      organiserName: m.organiserName,
      participantIds: JSON.parse(m.participantIds) as string[],
      participantNames: JSON.parse(m.participantNames) as string[],
      startIso: m.startIso,
      endIso: m.endIso,
      timezone: m.timezone,
      syncStatus:
        (m.syncStatus as "PENDING" | "SYNCED" | "FAILED") || "PENDING",
      integrationMode:
        (m.integrationMode as "LIVE" | "MOCK" | "DISABLED") || "MOCK",
      locationOrLink: m.locationOrLink ?? undefined,
      caseId: m.caseId,
      googleEventId: m.googleEventId ?? undefined,
      meetLink: m.meetLink ?? undefined,
      calendarError: m.calendarError ?? undefined,
      calendarSyncedAt: m.calendarSyncedAt?.toISOString() ?? undefined,
      notificationStatus:
        (m.notificationStatus as
          | "PENDING"
          | "SENT"
          | "FAILED"
          | "UNAVAILABLE") ?? undefined,
      notificationError: m.notificationError ?? undefined,
      notificationSentAt: m.notificationSentAt?.toISOString() ?? undefined,
    };
  }

  app.get("/api/meetings", requireAuth, async (_req: Request, res: Response) => {
    const meetings = await prisma.meeting.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.json({
      items: meetings.map(formatMeetingRecord),
      page: 1,
      pageSize: 20,
      total: meetings.length,
      synthetic: true,
    });
  });

  app.post(
    "/api/meetings",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const parsed = CreateMeetingRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid meeting payload",
          },
        });
        return;
      }

      const body = parsed.data;
      const user = req.user!;

      // Validate Start and End timestamps
      const startDate = new Date(body.startIso);
      const endDate = new Date(body.endIso);
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_DATETIME",
            message: "Start and end times must be valid ISO date strings.",
          },
        });
        return;
      }

      if (endDate <= startDate) {
        res.status(400).json({
          error: {
            code: "INVALID_INTERVAL",
            message: "Meeting end time must be strictly after start time.",
          },
        });
        return;
      }

      const student = await prisma.student.findUnique({
        where: { id: body.participantId },
      });
      if (!student) {
        res.status(404).json({
          error: {
            code: "STUDENT_NOT_FOUND",
            message: `Participant student ${body.participantId} not found.`,
          },
        });
        return;
      }

      // Duplicate submission prevention
      const duplicateWindowStart = new Date(
        startDate.getTime() - 60000
      ).toISOString();
      const duplicateWindowEnd = new Date(
        startDate.getTime() + 60000
      ).toISOString();
      const existingDuplicate = await prisma.meeting.findFirst({
        where: {
          organiserId: user.id,
          participantIds: { contains: body.participantId },
          startIso: { gte: duplicateWindowStart, lte: duplicateWindowEnd },
        },
      });

      if (existingDuplicate) {
        res.status(409).json({
          error: {
            code: "DUPLICATE_MEETING",
            message:
              "A meeting with this student at this time has already been scheduled.",
            details: { existingMeetingId: existingDuplicate.id },
          },
        });
        return;
      }

      // Check current Google Integration Status
      const gStatus = await getGoogleIntegrationStatus(user.id);
      const effectiveMode: "LIVE" | "MOCK" | "DISABLED" =
        gStatus.mode === "LIVE" && gStatus.connected
          ? "LIVE"
          : gStatus.mode === "DISABLED"
          ? "DISABLED"
          : googleMockConnected
          ? "MOCK"
          : "DISABLED";

      const newMeetingId = `MTG-${Date.now()}`;
      const defaultTz = body.timezone || "Asia/Kolkata";
      const title = "Academic Support Check-in";

      // 1. Initial persistence
      const meeting = await prisma.meeting.create({
        data: {
          id: newMeetingId,
          title,
          organiserId: user.id,
          organiserName: user.name,
          participantIds: JSON.stringify([body.participantId]),
          participantNames: JSON.stringify([student.name]),
          startIso: body.startIso,
          endIso: body.endIso,
          timezone: defaultTz,
          syncStatus: "PENDING",
          integrationMode: effectiveMode,
          locationOrLink: "Advising Office / Google Calendar Invite",
          caseId: body.caseId ?? null,
          notificationStatus: "PENDING",
        },
      });

      let updatedMeeting = meeting;

      // 2. Google Calendar Event Creation
      if (effectiveMode !== "DISABLED") {
        const calResult = await createGoogleCalendarEvent({
          title,
          startIso: body.startIso,
          endIso: body.endIso,
          timezone: defaultTz,
          organiserName: user.name,
          studentName: student.name,
          studentEmail: student.email ?? undefined,
          meetingId: newMeetingId,
          userId: user.id,
        });

        if (calResult.success) {
          updatedMeeting = await prisma.meeting.update({
            where: { id: newMeetingId },
            data: {
              syncStatus: "SYNCED",
              googleEventId: calResult.eventId ?? null,
              meetLink: calResult.meetLink ?? null,
              locationOrLink:
                calResult.meetLink ?? "Google Calendar / Advising Office",
              calendarSyncedAt: new Date(),
              calendarError: null,
            },
          });
        } else {
          updatedMeeting = await prisma.meeting.update({
            where: { id: newMeetingId },
            data: {
              syncStatus: "FAILED",
              calendarError:
                calResult.error ?? "Failed to create Google Calendar event.",
            },
          });
        }
      } else {
        updatedMeeting = await prisma.meeting.update({
          where: { id: newMeetingId },
          data: {
            syncStatus: "FAILED",
            calendarError:
              "Google Calendar integration is disabled or disconnected.",
          },
        });
      }

      // 3. Gmail Meeting Notification Dispatch
      if (student.email && student.email.includes("@")) {
        const emailResult = await sendGmailMeetingNotification({
          recipientEmail: student.email,
          studentName: student.name,
          meetingTitle: title,
          startIso: body.startIso,
          endIso: body.endIso,
          timezone: defaultTz,
          organiserName: user.name,
          meetLink: updatedMeeting.meetLink ?? undefined,
          locationOrLink: updatedMeeting.locationOrLink ?? undefined,
          userId: user.id,
        });

        if (emailResult.success) {
          updatedMeeting = await prisma.meeting.update({
            where: { id: newMeetingId },
            data: {
              notificationStatus: "SENT",
              notificationSentAt: new Date(),
              notificationError: null,
            },
          });

          // Record in-app notification
          await prisma.notification.create({
            data: {
              id: `NOTIF-${Date.now()}`,
              recipientId: student.userId ?? user.id,
              title: "Advising Meeting Scheduled",
              summary: `Advising check-in scheduled for ${new Date(
                body.startIso
              ).toLocaleDateString()} (${defaultTz}).`,
              channel: "EMAIL",
              status: "SENT",
            },
          });
        } else {
          updatedMeeting = await prisma.meeting.update({
            where: { id: newMeetingId },
            data: {
              notificationStatus: "FAILED",
              notificationError:
                emailResult.error ?? "Failed to send Gmail notification.",
            },
          });
        }
      } else {
        updatedMeeting = await prisma.meeting.update({
          where: { id: newMeetingId },
          data: {
            notificationStatus: "UNAVAILABLE",
            notificationError:
              "No verified email address registered for student.",
          },
        });
      }

      res.status(201).json(formatMeetingRecord(updatedMeeting));
    }
  );

  app.patch(
    "/api/meetings/:id",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const mtgId = String(req.params.id);
      const parsed = PatchMeetingRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Invalid meeting patch" },
        });
        return;
      }

      const existing = await prisma.meeting.findUnique({
        where: { id: mtgId },
      });
      if (!existing) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Meeting not found" },
        });
        return;
      }

      const user = req.user!;
      const newStartIso = parsed.data.startIso ?? existing.startIso;
      const newEndIso = parsed.data.endIso ?? existing.endIso;

      if (parsed.data.startIso || parsed.data.endIso) {
        const s = new Date(newStartIso);
        const e = new Date(newEndIso);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
          res.status(400).json({
            error: {
              code: "INVALID_DATETIME",
              message: "Start and end times must be valid dates.",
            },
          });
          return;
        }
        if (e <= s) {
          res.status(400).json({
            error: {
              code: "INVALID_INTERVAL",
              message: "End time must be after start time.",
            },
          });
          return;
        }
      }

      let updated = await prisma.meeting.update({
        where: { id: mtgId },
        data: {
          startIso: newStartIso,
          endIso: newEndIso,
        },
      });

      // Calendar Re-sync
      if (parsed.data.resync) {
        let calRes;
        if (updated.googleEventId) {
          calRes = await updateGoogleCalendarEvent({
            eventId: updated.googleEventId,
            startIso: newStartIso,
            endIso: newEndIso,
            timezone: updated.timezone,
            userId: user.id,
          });
        } else {
          const participantId = (
            JSON.parse(updated.participantIds) as string[]
          )[0];
          const student = participantId
            ? await prisma.student.findUnique({ where: { id: participantId } })
            : null;

          calRes = await createGoogleCalendarEvent({
            title: updated.title,
            startIso: newStartIso,
            endIso: newEndIso,
            timezone: updated.timezone,
            organiserName: updated.organiserName,
            studentName: student?.name,
            studentEmail: student?.email ?? undefined,
            meetingId: updated.id,
            userId: user.id,
          });
        }

        updated = await prisma.meeting.update({
          where: { id: mtgId },
          data: {
            syncStatus: calRes.success ? "SYNCED" : "FAILED",
            googleEventId: calRes.eventId ?? updated.googleEventId,
            meetLink: calRes.meetLink ?? updated.meetLink,
            calendarError: calRes.error ?? null,
            calendarSyncedAt: calRes.success
              ? new Date()
              : updated.calendarSyncedAt,
          },
        });
      }

      // Email Notification Resend
      if (parsed.data.resendNotification) {
        const participantId = (
          JSON.parse(updated.participantIds) as string[]
        )[0];
        const student = participantId
          ? await prisma.student.findUnique({ where: { id: participantId } })
          : null;

        if (student?.email && student.email.includes("@")) {
          const emailRes = await sendGmailMeetingNotification({
            recipientEmail: student.email,
            studentName: student.name,
            meetingTitle: updated.title,
            startIso: updated.startIso,
            endIso: updated.endIso,
            timezone: updated.timezone,
            organiserName: updated.organiserName,
            meetLink: updated.meetLink ?? undefined,
            locationOrLink: updated.locationOrLink ?? undefined,
            userId: user.id,
          });

          updated = await prisma.meeting.update({
            where: { id: mtgId },
            data: {
              notificationStatus: emailRes.success ? "SENT" : "FAILED",
              notificationSentAt: emailRes.success
                ? new Date()
                : updated.notificationSentAt,
              notificationError: emailRes.error ?? null,
            },
          });
        }
      }

      res.json(formatMeetingRecord(updated));
    }
  );

  // Google Integration Status & OAuth Management Endpoints
  app.get(
    "/api/integrations/google/status",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = req.user!;
      const canManage = user.roles.some((r) => STAFF_ROLES.includes(r));
      const gStatus = await getGoogleIntegrationStatus(user.id);

      res.json({
        connected:
          gStatus.mode === "MOCK" ? googleMockConnected : gStatus.connected,
        mode: gStatus.mode,
        organiserEmail: gStatus.organiserEmail,
        lastSyncedAt: gStatus.connected
          ? new Date().toISOString()
          : "2026-10-12T10:00:00.000Z",
        canManage,
        calendarConnected:
          gStatus.mode === "MOCK"
            ? googleMockConnected
            : gStatus.calendarConnected,
        gmailConnected:
          gStatus.mode === "MOCK"
            ? googleMockConnected
            : gStatus.gmailConnected,
        configured: gStatus.configured,
        authUrl: gStatus.authUrl,
        accountEmail: gStatus.accountEmail,
      });
    }
  );

  app.get(
    "/api/integrations/google/auth-url",
    requireRoles(STAFF_ROLES),
    (req: Request, res: Response) => {
      const authUrl = getGoogleAuthorizationUrl(req.user!.id);
      res.json({ authUrl });
    }
  );

  app.get(
    "/api/integrations/google/callback",
    async (req: Request, res: Response) => {
      const code = String(req.query.code ?? "");
      const state = String(req.query.state ?? "");

      if (!code || !state) {
        res.status(400).json({
          error: {
            code: "MISSING_OAUTH_PARAMS",
            message: "Missing code or state query parameter.",
          },
        });
        return;
      }

      const result = await handleGoogleOAuthCallback(code, state);
      if (result.success) {
        const wantsJson = req.headers.accept?.includes("application/json");
        if (wantsJson) {
          res.json({ success: true, email: result.userEmail });
        } else {
          res.redirect("/meetings?google=connected");
        }
      } else {
        const wantsJson = req.headers.accept?.includes("application/json");
        if (wantsJson) {
          res.status(400).json({
            error: {
              code: "OAUTH_CALLBACK_FAILED",
              message:
                result.error ?? "Failed to complete Google authorization.",
            },
          });
        } else {
          res.redirect(
            `/meetings?google=error&message=${encodeURIComponent(
              result.error ?? "OAuth error"
            )}`
          );
        }
      }
    }
  );

  app.post(
    "/api/integrations/google/connect",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const user = req.user!;
      const gStatus = await getGoogleIntegrationStatus(user.id);

      if (gStatus.mode === "MOCK") {
        googleMockConnected = true;
        res.json({
          connected: true,
          mode: "MOCK",
          organiserEmail: req.user?.email ?? "mentor@learntrack.edu",
          lastSyncedAt: new Date().toISOString(),
          canManage: true,
          calendarConnected: true,
          gmailConnected: true,
          configured: gStatus.configured,
          authUrl: gStatus.authUrl,
          accountEmail: req.user?.email ?? null,
        });
        return;
      }

      // In LIVE mode, returns current status including authUrl
      res.json({
        connected: gStatus.connected,
        mode: gStatus.mode,
        organiserEmail: gStatus.organiserEmail,
        lastSyncedAt: new Date().toISOString(),
        canManage: true,
        calendarConnected: gStatus.calendarConnected,
        gmailConnected: gStatus.gmailConnected,
        configured: gStatus.configured,
        authUrl: gStatus.authUrl,
        accountEmail: gStatus.accountEmail,
      });
    }
  );

  app.post(
    "/api/integrations/google/disconnect",
    requireRoles(STAFF_ROLES),
    async (req: Request, res: Response) => {
      const user = req.user!;
      googleMockConnected = false;
      await disconnectGoogleIntegration(user.id);
      const gStatus = await getGoogleIntegrationStatus(user.id);

      res.json({
        connected: false,
        mode: gStatus.mode,
        organiserEmail: req.user?.email ?? "mentor@learntrack.edu",
        lastSyncedAt: new Date().toISOString(),
        canManage: true,
        calendarConnected: false,
        gmailConnected: false,
        configured: gStatus.configured,
        authUrl: gStatus.authUrl,
        accountEmail: null,
      });
    }
  );

  // ==== 7. NOTIFICATIONS ====
  app.get(
    "/api/notifications",
    requireAuth,
    async (_req: Request, res: Response) => {
      const notifs = await prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
      });

      res.json({
        items: notifs.map((n) => ({
          id: n.id,
          recipientId: n.recipientId,
          title: n.title,
          summary: n.summary,
          channel: n.channel as "EMAIL" | "IN_APP",
          state: n.status as "PENDING" | "SENT" | "FAILED" | "CANCELLED",
          createdAt: n.createdAt.toISOString(),
        })),
        synthetic: true,
      });
    }
  );

  // ==== 8. STUDENT APP: MY SUPPORT, CHECK-INS, CONSENT ====
  app.get(
    "/api/my-support",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    async (req: Request, res: Response) => {
      const studentId = req.user?.studentId ?? "S-104";
      const cases = await prisma.supportCase.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        cases: cases.map((c) => ({
          id: c.id,
          status: c.status as CaseLifecycleStatus,
          plainLanguageReason:
            c.id === "C-104"
              ? "We noticed a recent dip in Data Structures lab attendance and midterm marks, alongside your request for peer tutoring."
              : c.plainLanguageReason,
          supportType:
            (c.approvedAction as InterventionType) ??
            (c.suggestedAction as InterventionType) ??
            "PEER_TUTOR",
          ownerName: c.ownerName ?? "Dr. Priya Nair",
          ownerRole: (c.ownerRole as Role) ?? "MENTOR",
          nextStepSummary: `Your mentor ${
            c.ownerName ?? "Dr. Priya Nair"
          } is reviewing support options for your coursework.`,
          canDeclineOrDeferOptional: true,
          updatedAt: c.updatedAt.toISOString(),
        })),
        synthetic: true,
      });
    }
  );

  app.post(
    "/api/checkins",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    async (req: Request, res: Response) => {
      const parsed = CreateCheckInRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid check-in",
          },
        });
        return;
      }

      const studentId = req.user?.studentId ?? "S-104";
      const decision = parsed.data.optionalSupportDecision ?? "ACCEPT";
      const created = await prisma.studentCheckIn.create({
        data: {
          id: `CHK-${Date.now()}`,
          studentId,
          contextNote: parsed.data.contextNote,
          supportRequested: parsed.data.supportRequested,
          optionalSupportDecision: decision,
          sharingOptionsJson: JSON.stringify(parsed.data.sharingOptions),
        },
      });

      if (decision === "DEFER" || decision === "DECLINE") {
        const activeCase = await prisma.supportCase.findFirst({
          where: {
            studentId,
            status: { in: ["NEEDS_REVIEW", "ASSIGNED"] },
          },
          orderBy: { updatedAt: "desc" },
        });
        if (activeCase) {
          const nextStatus = decision === "DEFER" ? "DEFERRED" : "DECLINED";
          await prisma.supportCase.update({
            where: { id: activeCase.id },
            data: {
              status: nextStatus,
              version: activeCase.version + 1,
            },
          });
          await prisma.caseEvent.create({
            data: {
              caseId: activeCase.id,
              actorId: req.user?.id ?? "USR-STUDENT",
              actorName: req.user?.name ?? "Student",
              actorRole: req.user?.roles[0] ?? "STUDENT",
              action: "STATUS_CHANGE",
              fromStatus: activeCase.status,
              toStatus: nextStatus,
              summary: `Student chose to ${decision.toLowerCase()} optional support via check-in`,
              metadata: parsed.data.contextNote,
            },
          });
        }
      }

      res.status(201).json({
        id: created.id,
        studentId: created.studentId,
        contextNote: created.contextNote,
        supportRequested: created.supportRequested,
        optionalSupportDecision: created.optionalSupportDecision,
        sharingOptions: JSON.parse(created.sharingOptionsJson),
        createdAt: created.createdAt.toISOString(),
      });
    }
  );

  app.get(
    "/api/checkins/:id",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    async (req: Request, res: Response) => {
      const checkInId = String(req.params.id);
      const studentId = req.user?.studentId ?? "S-104";

      const record = await prisma.studentCheckIn.findUnique({
        where: { id: checkInId },
      });

      if (!record) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Check-in not found" },
        });
        return;
      }

      if (record.studentId !== studentId) {
        res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Students can only view their own check-in notes.",
          },
        });
        return;
      }

      res.json({
        id: record.id,
        studentId: record.studentId,
        contextNote: record.contextNote,
        supportRequested: record.supportRequested,
        optionalSupportDecision: record.optionalSupportDecision,
        sharingOptions: JSON.parse(record.sharingOptionsJson),
        createdAt: record.createdAt.toISOString(),
      });
    }
  );

  app.get(
    "/api/consent",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    async (req: Request, res: Response) => {
      const studentId = req.user?.studentId ?? "S-104";
      const grants = await prisma.consentRecord.findMany({
        where: { studentId },
        orderBy: { id: "asc" },
      });

      res.json({
        studentId,
        grants: grants.map((g) => ({
          id: g.id,
          scope: g.scope,
          scopeLabel: g.scopeLabel,
          recipientRole: g.recipientRole,
          granted: g.granted,
          updatedAt: g.updatedAt.toISOString(),
        })),
        synthetic: true,
      });
    }
  );

  app.patch(
    "/api/consent",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    async (req: Request, res: Response) => {
      const parsed = PatchConsentRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Invalid consent update" },
        });
        return;
      }

      const studentId = req.user?.studentId ?? "S-104";
      const existing = await prisma.consentRecord.findUnique({
        where: {
          studentId_scope_recipientRole: {
            studentId,
            scope: parsed.data.scope,
            recipientRole: parsed.data.recipientRole,
          },
        },
      });

      if (existing) {
        await prisma.consentRecord.update({
          where: { id: existing.id },
          data: { granted: parsed.data.granted },
        });
      } else {
        const scopeLabels: Record<string, string> = {
          CHECKIN_NOTES: "Self Check-in Context Notes",
          COUNSELLING_REFERRAL_STATUS: "Counselling Referral Status",
          FINANCIAL_SUPPORT_STATUS: "Financial Support & Installment Status",
          ATTENDANCE_AND_MARKS: "Academic Attendance & Marks Summary",
        };
        await prisma.consentRecord.create({
          data: {
            id: `CON-${studentId}-${Date.now()}`,
            studentId,
            scope: parsed.data.scope,
            scopeLabel: scopeLabels[parsed.data.scope] ?? parsed.data.scope,
            recipientRole: parsed.data.recipientRole,
            granted: parsed.data.granted,
          },
        });
      }

      const grants = await prisma.consentRecord.findMany({
        where: { studentId },
        orderBy: { id: "asc" },
      });

      res.json({
        studentId,
        grants: grants.map((g) => ({
          id: g.id,
          scope: g.scope,
          scopeLabel: g.scopeLabel,
          recipientRole: g.recipientRole,
          granted: g.granted,
          updatedAt: g.updatedAt.toISOString(),
        })),
        synthetic: true,
      });
    }
  );

  // ==== 9. ANALYTICS & LEADERSHIP DASHBOARD (HOD, ADMIN ONLY) ====
  app.get(
    "/api/analytics/cohorts",
    requireRoles(["HOD", "ADMIN"]),
    async (_req: Request, res: Response) => {
      const allCases = await prisma.supportCase.findMany();
      const openCasesCount = allCases.filter(
        (c) => !["CLOSED", "DECLINED", "CANCELLED"].includes(c.status)
      ).length;
      const completedCasesCount = allCases.filter((c) =>
        ["ACTION_COMPLETED", "OUTCOME_REVIEWED", "CLOSED"].includes(c.status)
      ).length;
      const overdueCasesCount = allCases.filter(
        (c) =>
          !["CLOSED", "DECLINED", "CANCELLED"].includes(c.status) &&
          computeDeadlineStatus(c.deadline) === "OVERDUE"
      ).length;

      res.json({
        openCasesCount: Math.max(14, openCasesCount),
        completedCasesCount: Math.max(38, completedCasesCount),
        overdueCasesCount: Math.max(1, overdueCasesCount),
        medianHoursToFirstAction: 18.5,
        outcomeReviewRatePercent: 84,
        sharedDeclinePatterns: [
          {
            id: "PAT-1",
            cohort: "CS-2024-A",
            subject: "Data Structures & Algorithms",
            affectedStudentsCount: 11,
            metric: "Morning Lab Attendance (Weeks 3–5)",
            changeSummary:
              "18% aggregate dip across 8:30 AM Tuesday lab section",
          },
          {
            id: "PAT-2",
            cohort: "ECE-2024-B",
            subject: "Signal Processing",
            affectedStudentsCount: 9,
            metric: "Lab Report Submission Pacing",
            changeSummary:
              "Clustered extension requests during concurrent project week",
          },
        ],
        synthetic: true,
      });
    }
  );

  app.get(
    "/api/analytics/outcomes",
    requireRoles(["HOD", "ADMIN"]),
    async (_req: Request, res: Response) => {
      const pastOutcomes = await prisma.pastCaseOutcome.findMany();
      const recordedOutcomes = await prisma.outcomeReview.findMany({
        include: { supportCase: true },
      });

      const types: InterventionType[] = [
        "PEER_TUTOR",
        "MENTOR",
        "REMEDIAL",
        "FEE_SUPPORT",
      ];

      const byIntervention = types.map((t) => {
        const past = pastOutcomes.filter((p) => p.interventionType === t);
        const live = recordedOutcomes.filter(
          (r) =>
            (r.supportCase.approvedAction ?? r.supportCase.suggestedAction) ===
            t
        );

        const baseImproved = past.filter((p) => p.improved).length;
        const baseTotal = past.length;
        const baseUnknown = Math.min(3, Math.floor(baseTotal * 0.12));
        const baseNoChange = Math.max(0, baseTotal - baseImproved - baseUnknown);

        const liveImp = live.filter(
          (r) => r.classification === "IMPROVEMENT"
        ).length;
        const liveNoChange = live.filter(
          (r) => r.classification === "NO_CHANGE"
        ).length;
        const liveUnknown = live.filter(
          (r) => r.classification === "UNKNOWN"
        ).length;

        const improvementCount = baseImproved + liveImp;
        const noChangeCount = baseNoChange + liveNoChange;
        const unknownCount = baseUnknown + liveUnknown;

        return {
          interventionType: t,
          improvementCount,
          noChangeCount,
          unknownCount,
          totalReviewed: improvementCount + noChangeCount + unknownCount,
        };
      });

      res.json({
        byIntervention,
        synthetic: true,
      });
    }
  );

  app.get(
    "/api/analytics/impact",
    requireRoles(["HOD", "ADMIN"]),
    async (_req: Request, res: Response) => {
      res.json({
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
    }
  );

  app.get(
    "/api/analytics/fairness",
    requireRoles(["HOD", "ADMIN"]),
    async (_req: Request, res: Response) => {
      res.json({
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
    }
  );

  app.get(
    "/api/analytics/clusters",
    requireRoles(["HOD", "ADMIN"]),
    async (_req: Request, res: Response) => {
      res.json({
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
    }
  );

  // ==== 12. REWARDS & LEARNCOINS ====
  app.post(
    "/api/rewards/evaluate",
    requireRoles(["HOD", "ADMIN"]),
    requireCsrf,
    async (_req: Request, res: Response) => {
      const summary = await evaluateAllStudents();
      res.json({
        evaluatedStudents: summary.evaluatedStudents,
        newEntriesCount: summary.newEntriesCount,
        synthetic: true,
      });
    }
  );

  app.get(
    "/api/rewards/me",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    async (req: Request, res: Response) => {
      const studentId = req.user!.studentId;
      if (!studentId) {
        res.status(400).json({
          error: {
            code: "NO_STUDENT_PROFILE",
            message: "User is not linked to a student record.",
          },
        });
        return;
      }

      const ledger = await prisma.rewardLedgerEntry.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
      });

      const ledgerSum = await prisma.rewardLedgerEntry.aggregate({
        where: { studentId },
        _sum: { points: true },
      });

      const redemptionsSum = await prisma.redemption.aggregate({
        where: { studentId, status: { not: "CANCELLED" } },
        _sum: { cost: true },
      });

      const balance = Math.max(
        0,
        (ledgerSum._sum.points ?? 0) - (redemptionsSum._sum.cost ?? 0)
      );

      const myRedemptions = await prisma.redemption.findMany({
        where: { studentId, status: { not: "CANCELLED" } },
        select: { itemId: true },
      });
      const enteredItemIds = new Set(myRedemptions.map((r) => r.itemId));

      const catalogItems = await prisma.rewardItem.findMany({
        orderBy: { cost: "asc" },
      });

      const catalog = catalogItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        cost: item.cost,
        stock: item.stock,
        isDraw: item.isDraw,
        simulated: item.simulated,
        entered: item.isDraw ? enteredItemIds.has(item.id) : undefined,
      }));

      const unaffordable = catalogItems.filter((i) => i.cost > balance);
      let nextRewardName: string | null = null;
      let nextRewardCost: number | null = null;
      let pointsNeeded = 0;
      let percent = 100;

      if (unaffordable.length > 0) {
        const nextTarget = unaffordable[0];
        nextRewardName = nextTarget.name;
        nextRewardCost = nextTarget.cost;
        pointsNeeded = nextTarget.cost - balance;
        percent = Math.min(
          100,
          Math.max(0, Math.round((balance / nextTarget.cost) * 100))
        );
      }

      res.json({
        studentId,
        balance,
        ledger: ledger.map((e) => ({
          id: e.id,
          studentId: e.studentId,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          points: e.points,
          reason: e.reason,
          activityWeek: e.activityWeek ?? undefined,
          createdAt: e.createdAt.toISOString(),
        })),
        catalog,
        progress: {
          nextRewardName,
          nextRewardCost,
          pointsNeeded,
          percent,
        },
        synthetic: true,
      });
    }
  );

  app.post(
    "/api/rewards/redeem",
    requireRoles(["STUDENT", "PEER_TUTOR"]),
    requireCsrf,
    async (req: Request, res: Response) => {
      const studentId = req.user!.studentId;
      if (!studentId) {
        res.status(400).json({
          error: {
            code: "NO_STUDENT_PROFILE",
            message: "User is not linked to a student record.",
          },
        });
        return;
      }

      const parsed = RedeemRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid redeem payload.",
          },
        });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.rewardItem.findUnique({
          where: { id: parsed.data.itemId },
        });
        if (!item) {
          return {
            error: {
              status: 404,
              code: "NOT_FOUND",
              message: "Reward item not found.",
            },
          };
        }

        if (item.stock <= 0) {
          return {
            error: {
              status: 400,
              code: "OUT_OF_STOCK",
              message: "Reward item is out of stock.",
            },
          };
        }

        if (item.isDraw) {
          const existingDraw = await tx.redemption.findFirst({
            where: {
              studentId,
              itemId: item.id,
              status: { not: "CANCELLED" },
            },
          });
          if (existingDraw) {
            return {
              error: {
                status: 400,
                code: "DRAW_ENTRY_LIMIT",
                message: "You have already entered this lucky draw.",
              },
            };
          }
        }

        const ledgerSum = await tx.rewardLedgerEntry.aggregate({
          where: { studentId },
          _sum: { points: true },
        });

        const redemptionsSum = await tx.redemption.aggregate({
          where: { studentId, status: { not: "CANCELLED" } },
          _sum: { cost: true },
        });

        const currentBalance =
          (ledgerSum._sum.points ?? 0) - (redemptionsSum._sum.cost ?? 0);

        if (currentBalance < item.cost) {
          return {
            error: {
              status: 400,
              code: "INSUFFICIENT_BALANCE",
              message: "Insufficient LearnCoins balance for this item.",
            },
          };
        }

        await tx.rewardItem.update({
          where: { id: item.id },
          data: { stock: { decrement: 1 } },
        });

        const redemption = await tx.redemption.create({
          data: {
            id: `RED-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            studentId,
            itemId: item.id,
            cost: item.cost,
            status: "PENDING",
          },
          include: { item: true },
        });

        return { redemption };
      });

      if ("error" in result && result.error) {
        res.status(result.error.status).json({
          error: {
            code: result.error.code,
            message: result.error.message,
          },
        });
        return;
      }

      res.status(201).json({
        id: result.redemption.id,
        studentId: result.redemption.studentId,
        itemId: result.redemption.itemId,
        cost: result.redemption.cost,
        status: result.redemption.status,
        createdAt: result.redemption.createdAt.toISOString(),
        item: {
          id: result.redemption.item.id,
          name: result.redemption.item.name,
          description: result.redemption.item.description,
          cost: result.redemption.item.cost,
          stock: result.redemption.item.stock,
          isDraw: result.redemption.item.isDraw,
          simulated: result.redemption.item.simulated,
        },
      });
    }
  );

  app.patch(
    "/api/rewards/redemptions/:id",
    requireRoles(["FINANCE", "ADMIN"]),
    requireCsrf,
    async (req: Request, res: Response) => {
      const redemptionId = String(req.params.id);
      const parsed = PatchRedemptionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ?? "Invalid redemption patch.",
          },
        });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const redemption = await tx.redemption.findUnique({
          where: { id: redemptionId },
          include: { item: true },
        });

        if (!redemption) {
          return {
            error: {
              status: 404,
              code: "NOT_FOUND",
              message: "Redemption not found.",
            },
          };
        }

        if (redemption.status !== "PENDING") {
          return {
            error: {
              status: 400,
              code: "INVALID_STATUS_TRANSITION",
              message: `Redemption is already ${redemption.status.toLowerCase()} and cannot be updated.`,
            },
          };
        }

        if (parsed.data.status === "CANCELLED") {
          await tx.rewardItem.update({
            where: { id: redemption.itemId },
            data: { stock: { increment: 1 } },
          });
        }

        const updated = await tx.redemption.update({
          where: { id: redemptionId },
          data: { status: parsed.data.status },
          include: { item: true },
        });

        return { updated };
      });

      if ("error" in result && result.error) {
        res.status(result.error.status).json({
          error: {
            code: result.error.code,
            message: result.error.message,
          },
        });
        return;
      }

      res.json({
        id: result.updated.id,
        studentId: result.updated.studentId,
        itemId: result.updated.itemId,
        cost: result.updated.cost,
        status: result.updated.status,
        createdAt: result.updated.createdAt.toISOString(),
        item: {
          id: result.updated.item.id,
          name: result.updated.item.name,
          description: result.updated.item.description,
          cost: result.updated.item.cost,
          stock: result.updated.item.stock,
          isDraw: result.updated.item.isDraw,
          simulated: result.updated.item.simulated,
        },
      });
    }
  );

  app.get(
    "/api/rewards/redemptions",
    requireRoles(["FINANCE", "ADMIN"]),
    async (_req: Request, res: Response) => {
      const redemptions = await prisma.redemption.findMany({
        include: { item: true, student: true },
        orderBy: { createdAt: "desc" },
      });
      res.json({
        items: redemptions.map((r) => ({
          id: r.id,
          studentDisplayName: r.student.name,
          itemName: r.item.name,
          cost: r.cost,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
        synthetic: true,
      });
    }
  );

  app.get(
    "/api/rewards/summary",
    requireRoles(["HOD", "ADMIN"]),
    async (_req: Request, res: Response) => {
      const issuedAgg = await prisma.rewardLedgerEntry.aggregate({
        _sum: { points: true },
      });
      const totalPointsIssued = issuedAgg._sum.points ?? 0;

      const redeemedAgg = await prisma.redemption.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { cost: true },
      });
      const totalPointsRedeemed = redeemedAgg._sum.cost ?? 0;

      const totalRedemptions = await prisma.redemption.count();
      const fulfilledRedemptions = await prisma.redemption.count({
        where: { status: "FULFILLED" },
      });

      const students = await prisma.student.findMany({
        select: { id: true, cohort: true },
      });

      const cohortStudentMap = new Map<string, string[]>();
      for (const s of students) {
        const list = cohortStudentMap.get(s.cohort) ?? [];
        list.push(s.id);
        cohortStudentMap.set(s.cohort, list);
      }

      const cohortSummaries = [];
      for (const [cohort, studentIds] of cohortStudentMap.entries()) {
        const studentCount = studentIds.length;
        if (studentCount < MIN_REWARDS_GROUP_SIZE) {
          cohortSummaries.push({
            cohort,
            studentCount,
            pointsIssued: null,
            redemptionsCount: null,
            insufficientData: true,
            note: `Cohort size is below privacy threshold (n < ${MIN_REWARDS_GROUP_SIZE}); aggregate reward metrics are suppressed to protect student privacy.`,
          });
        } else {
          const pointsAgg = await prisma.rewardLedgerEntry.aggregate({
            where: { studentId: { in: studentIds } },
            _sum: { points: true },
          });
          const redemptionsCount = await prisma.redemption.count({
            where: { studentId: { in: studentIds } },
          });
          cohortSummaries.push({
            cohort,
            studentCount,
            pointsIssued: pointsAgg._sum.points ?? 0,
            redemptionsCount,
            insufficientData: false,
          });
        }
      }

      res.json({
        totalPointsIssued,
        totalPointsRedeemed,
        totalRedemptions,
        fulfilledRedemptions,
        cohorts: cohortSummaries,
        synthetic: true,
      });
    }
  );

  // Fallback 404 handler in standard error shape
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: err.message,
      })
    );
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected server error occurred.",
      },
    });
  });

  return app;
}

