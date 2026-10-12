import { z } from "zod";
import { EvidenceItemSchema } from "@learntrack/contracts";
import { env } from "../config/env.js";
import { prisma } from "../db.js";

export const FastApiObservationSchema = z.object({
  observedAt: z.string(),
  attendanceAttended: z.number().int().min(0).nullable(),
  attendanceTotal: z.number().int().min(0).nullable(),
  assessmentScore: z.number().min(0).nullable(),
  assessmentMax: z.number().gt(0).nullable(),
  assignmentsSubmitted: z.number().int().min(0).nullable(),
  assignmentsDue: z.number().int().min(0).nullable(),
  lmsActiveDays: z.number().int().min(0).nullable(),
  facultyAcademicConcern: z.boolean().nullable(),
});
export type FastApiObservation = z.infer<typeof FastApiObservationSchema>;

export const FastApiPredictionRequestSchema = z.object({
  studentId: z.string().min(1).max(100),
  subject: z.string().min(1).max(50),
  asOf: z.string(),
  observations: z.array(FastApiObservationSchema),
});
export type FastApiPredictionRequest = z.infer<
  typeof FastApiPredictionRequestSchema
>;

export const FastApiPredictionResponseSchema = z.object({
  studentId: z.string(),
  subject: z.string(),
  assessmentStatus: z.enum(["assessed", "insufficient_data"]),
  predictionTarget: z.string(),
  modelVersion: z.string(),
  modelScore: z.number().nullable(),
  decisionThreshold: z.number().nullable(),
  reviewSuggested: z.boolean(),
  evidence: z.array(z.string()),
  suggestedNextStep: z.string(),
  requiresHumanReview: z.boolean(),
  dataQuality: z.object({
    status: z.string(),
    reasons: z.array(z.string()),
    observation_count: z.number(),
  }),
  limitations: z.array(z.string()),
  computedAt: z.string(),
  source: z.string(),
});
export type FastApiPredictionResponse = z.infer<
  typeof FastApiPredictionResponseSchema
>;

export interface ComputedAssessmentOutput {
  modelVersion: string;
  score: number;
  needsAttention: boolean;
  signalCategory:
    | "NEEDS_ATTENTION"
    | "MONITOR"
    | "ROUTINE"
    | "INSUFFICIENT_DATA";
  attentionSummary: string;
  sourceMode: "ML" | "FALLBACK" | "UNAVAILABLE";
  limitations: string;
  observedChanges: z.infer<typeof EvidenceItemSchema>[];
  modelExplanation: z.infer<typeof EvidenceItemSchema>[];
  hypothesisedCauses: z.infer<typeof EvidenceItemSchema>[];
  studentConfirmedContext: unknown;
}

interface StoredObservationRow {
  id: string;
  subject: string;
  type: string;
  period: string;
  value: number | null;
  rating: number | null;
  observedAt: Date;
}

/**
 * Maps stored AcademicObservation rows into FastAPI's required Observation[] format.
 * Aligns weekly observations within a 6-day window of each attendance date when >= 4
 * attendance dates exist, or falls back to distinct chronological timestamps so no
 * observation rows are fabricated and duplicate timestamps never occur.
 */
export function buildMlObservations(
  rows: StoredObservationRow[],
  asOfDate: Date
): FastApiObservation[] {
  const validRows = rows
    .filter(
      (r) =>
        ["ATTENDANCE", "MARKS", "PARTICIPATION", "FACULTY_FEEDBACK"].includes(
          r.type
        ) && r.observedAt.getTime() <= asOfDate.getTime()
    )
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  if (validRows.length === 0) {
    return [];
  }

  const attendanceRows = validRows.filter(
    (r) => r.type === "ATTENDANCE" && r.value !== null
  );

  // If the student has >= 4 weekly attendance anchors (e.g., S-104), bucket marks/participation/feedback
  // into the nearest preceding/same-week attendance anchor (within 6 days) so each weekly observation
  // carries its combined signals without fabricating any values.
  if (attendanceRows.length >= 4) {
    const buckets = attendanceRows.map((att) => {
      const attPct = Math.max(0, Math.min(100, Math.round(att.value!)));
      return {
        anchorTime: att.observedAt.getTime(),
        obs: {
          observedAt: att.observedAt.toISOString(),
          attendanceAttended: attPct,
          attendanceTotal: 100,
          assessmentScore: null as number | null,
          assessmentMax: null as number | null,
          assignmentsSubmitted: null as number | null,
          assignmentsDue: null as number | null,
          lmsActiveDays: null as number | null,
          facultyAcademicConcern: null as boolean | null,
        },
      };
    });

    const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
    for (const r of validRows) {
      if (r.type === "ATTENDANCE") continue;
      const t = r.observedAt.getTime();
      // Find the closest weekly bucket within 6 days
      let bestBucket = buckets[0];
      let bestDiff = Math.abs(t - bestBucket.anchorTime);
      for (const b of buckets) {
        const diff = Math.abs(t - b.anchorTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestBucket = b;
        }
      }
      if (bestDiff <= sixDaysMs) {
        if (r.type === "MARKS" && r.value !== null) {
          bestBucket.obs.assessmentScore = Math.max(
            0,
            Math.min(100, Number(r.value))
          );
          bestBucket.obs.assessmentMax = 100;
        } else if (r.type === "PARTICIPATION" && r.value !== null) {
          bestBucket.obs.lmsActiveDays = Math.max(
            0,
            Math.min(7, Math.round((Number(r.value) / 100) * 7))
          );
        } else if (r.type === "FACULTY_FEEDBACK") {
          bestBucket.obs.facultyAcademicConcern =
            r.rating !== null ? r.rating <= 3 : true;
        }
      }
    }

    return buckets.map((b) => b.obs);
  }

  // Otherwise group strictly by unique observedAt ISO timestamp
  const byIso = new Map<string, FastApiObservation>();
  for (const r of validRows) {
    const iso = r.observedAt.toISOString();
    let entry = byIso.get(iso);
    if (!entry) {
      entry = {
        observedAt: iso,
        attendanceAttended: null,
        attendanceTotal: null,
        assessmentScore: null,
        assessmentMax: null,
        assignmentsSubmitted: null,
        assignmentsDue: null,
        lmsActiveDays: null,
        facultyAcademicConcern: null,
      };
      byIso.set(iso, entry);
    }

    if (r.type === "ATTENDANCE" && r.value !== null) {
      entry.attendanceAttended = Math.max(
        0,
        Math.min(100, Math.round(r.value))
      );
      entry.attendanceTotal = 100;
    } else if (r.type === "MARKS" && r.value !== null) {
      entry.assessmentScore = Math.max(0, Math.min(100, Number(r.value)));
      entry.assessmentMax = 100;
    } else if (r.type === "PARTICIPATION" && r.value !== null) {
      entry.lmsActiveDays = Math.max(
        0,
        Math.min(7, Math.round((Number(r.value) / 100) * 7))
      );
    } else if (r.type === "FACULTY_FEEDBACK") {
      entry.facultyAcademicConcern = r.rating !== null ? r.rating <= 3 : true;
    }
  }

  return Array.from(byIso.values()).sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt)
  );
}

/**
 * Maps a validated FastAPI PredictionResponse into LearnTrack's ComputedAssessmentOutput.
 */
export function mapFastApiResponseToAssessment(
  mlRes: FastApiPredictionResponse,
  studentConfirmedContext: unknown,
  attDelta: number,
  lastMark: number
): ComputedAssessmentOutput {
  const limitationsText =
    mlRes.limitations.length > 0
      ? mlRes.limitations.join(" ")
      : "Trained and evaluated only on fictional synthetic data. A review signal is not a diagnosis or final intervention decision.";

  if (
    mlRes.assessmentStatus === "insufficient_data" ||
    mlRes.modelScore === null
  ) {
    return {
      modelVersion: mlRes.modelVersion || "synthetic-dsa-v1",
      score: 0.0,
      needsAttention: false,
      signalCategory: "INSUFFICIENT_DATA",
      attentionSummary:
        "No recent observations available to compute an indicator",
      sourceMode: "UNAVAILABLE",
      limitations: limitationsText,
      observedChanges: [],
      modelExplanation: [],
      hypothesisedCauses: [],
      studentConfirmedContext: null,
    };
  }

  const score = mlRes.modelScore;
  const threshold = mlRes.decisionThreshold ?? 0.63;
  const isFlagged = mlRes.reviewSuggested || score >= threshold;
  const isMonitor = !isFlagged && (score >= 0.45 || attDelta <= -15 || lastMark < 65);
  const needsAttention = isFlagged || isMonitor;
  const signalCategory: ComputedAssessmentOutput["signalCategory"] = isFlagged
    ? "NEEDS_ATTENTION"
    : isMonitor
    ? "MONITOR"
    : "ROUTINE";

  const attentionSummary = isFlagged
    ? "Needs attention — recent shift in lab attendance and midterm performance"
    : isMonitor
    ? "Needs attention — monitor recent academic trend and review evidence with student"
    : `Routine monitoring — ${mlRes.suggestedNextStep}`;

  const observedChanges: z.infer<typeof EvidenceItemSchema>[] =
    mlRes.evidence.map((evText, idx) => {
      const isConcern =
        evText.includes("-") ||
        evText.toLowerCase().includes("concern") ||
        (evText.includes("mean:") && lastMark < 65) ||
        (evText.includes("attendance rate:") && attDelta < 0);
      const label = evText.includes(":")
        ? evText.split(":")[0]!.trim()
        : `Observed metric ${idx + 1}`;
      return {
        id: `ML-OBS-${idx + 1}`,
        label,
        detail: evText,
        direction: isConcern ? "CONCERN" : "NEUTRAL",
      };
    });

  const modelExplanation: z.infer<typeof EvidenceItemSchema>[] = [
    {
      id: "ML-EXP-1",
      label: `Model evaluation (${mlRes.modelVersion})`,
      detail: `${mlRes.predictionTarget}. Indicator score ${score.toFixed(
        2
      )} (review threshold ${threshold.toFixed(2)}).`,
      direction: isFlagged ? "CONCERN" : "NEUTRAL",
    },
    {
      id: "ML-EXP-2",
      label: "Recommended human review step",
      detail: mlRes.suggestedNextStep,
      direction: "NEUTRAL",
    },
  ];

  const hypothesisedCauses: z.infer<typeof EvidenceItemSchema>[] = [];
  if (attDelta < 0) {
    hypothesisedCauses.push({
      id: "ML-HYP-1",
      label: "Hypothesis: Schedule or transit conflict with morning lab slots",
      detail:
        "Attendance declined across recent weekly observations; requires human mentor conversation with the student to verify.",
      direction: "NEUTRAL",
    });
  }
  if (lastMark < 70) {
    hypothesisedCauses.push({
      id: "ML-HYP-2",
      label: "Hypothesis: Conceptual gap in recent coursework modules",
      detail:
        "Recent assessment scores dipped below earlier baseline; unconfirmed hypothesis requiring faculty/mentor review.",
      direction: "NEUTRAL",
    });
  }
  if (hypothesisedCauses.length === 0) {
    hypothesisedCauses.push({
      id: "ML-HYP-1",
      label: "Hypothesis: Coursework pacing check-in",
      detail:
        "No acute academic decline observed; verify workload balance during routine advising.",
      direction: "NEUTRAL",
    });
  }

  return {
    modelVersion: mlRes.modelVersion,
    score,
    needsAttention,
    signalCategory,
    attentionSummary,
    sourceMode: "ML",
    limitations: limitationsText,
    observedChanges,
    modelExplanation,
    hypothesisedCauses,
    studentConfirmedContext,
  };
}

export async function evaluateStudentRisk(
  studentId: string
): Promise<ComputedAssessmentOutput> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      observations: {
        orderBy: { observedAt: "asc" },
      },
      checkIns: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!student) {
    throw new Error(`Student ${studentId} not found`);
  }

  const attendanceObs = student.observations.filter(
    (o) => o.type === "ATTENDANCE" && o.value !== null
  );
  const marksObs = student.observations.filter(
    (o) => o.type === "MARKS" && o.value !== null
  );

  const asOfDate = new Date();
  const mlObservations = buildMlObservations(student.observations, asOfDate);

  // S-107 or any student with fewer than 4 observations -> explicit INSUFFICIENT_DATA without inventing a score
  if (
    !student.hasRecentObservations ||
    mlObservations.length < 4 ||
    (attendanceObs.length === 0 && marksObs.length === 0)
  ) {
    return {
      modelVersion:
        env.ML_MODE === "LIVE" ? "synthetic-dsa-v1" : "lt-ordinal-v2.4.1",
      score: 0.0,
      needsAttention: false,
      signalCategory: "INSUFFICIENT_DATA",
      attentionSummary: "No recent observations available to compute an indicator",
      sourceMode: "UNAVAILABLE",
      limitations:
        "Minimum observation threshold (4 observations) not met. No missing records are fabricated; manual human review option is available.",
      observedChanges: [],
      modelExplanation: [],
      hypothesisedCauses: [],
      studentConfirmedContext: null,
    };
  }

  const firstAtt = attendanceObs[0]?.value ?? 90;
  const lastAtt = attendanceObs[attendanceObs.length - 1]?.value ?? 90;
  const attDelta = Math.round(lastAtt - firstAtt);

  const firstMark = marksObs[0]?.value ?? 80;
  const lastMark = marksObs[marksObs.length - 1]?.value ?? 80;

  const latestCheckIn = student.checkIns[0];
  const studentConfirmedContext = latestCheckIn
    ? [
        {
          id: `CTX-${student.id}`,
          label: `Check-in (${latestCheckIn.createdAt.toISOString().slice(0, 10)})`,
          detail: latestCheckIn.contextNote,
          direction: "NEUTRAL" as const,
        },
      ]
    : [];

  // Administrative-only flag (e.g. S-105 where attendance >= 85 and marks >= 75, but fee support requested)
  if (
    lastAtt >= 85 &&
    lastMark >= 75 &&
    student.feeStatus === "FEE_SUPPORT_REQUESTED"
  ) {
    return {
      modelVersion: "rule-fallback-v1.0",
      score: 0.4,
      needsAttention: true,
      signalCategory: "MONITOR",
      attentionSummary: "Needs attention — administrative fee support follow-up",
      sourceMode: "FALLBACK",
      limitations:
        "Rule-based checklist fallback used while ML scoring service was skipped for administrative-only flag.",
      observedChanges: [
        {
          id: `OBS-${student.id}-FEE`,
          label: "Fee installment status",
          detail:
            student.feeNote ??
            "Scholarship renewal documentation pending verification.",
          direction: "NEUTRAL",
        },
      ],
      modelExplanation: [
        {
          id: `EXP-${student.id}-1`,
          label: "Academic stability",
          detail: `Attendance (${lastAtt}%) and Midterm (${lastMark}%) remain strong.`,
          direction: "PROTECTIVE",
        },
      ],
      hypothesisedCauses: [
        {
          id: `HYP-${student.id}-1`,
          label: "Hypothesis: Administrative processing delay on scholarship renewal",
          detail:
            "Requires Finance office verification, not academic remediation.",
          direction: "NEUTRAL",
        },
      ],
      studentConfirmedContext: {
        restricted: true,
        reason: "Restricted by role or consent",
      },
    };
  }

  // If ML_MODE=LIVE, call FastAPI POST /predict with finite timeout; fallback safely on failure
  if (env.ML_MODE === "LIVE") {
    const subject = student.cohort.startsWith("ECE")
      ? "Signal Processing"
      : "DSA";
    const requestPayload: FastApiPredictionRequest = {
      studentId: student.id,
      subject,
      asOf: asOfDate.toISOString(),
      observations: mlObservations,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.ML_TIMEOUT_MS);
    try {
      const baseUrl = env.ML_SERVICE_URL.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        const raw: unknown = await response.json();
        const parsed = FastApiPredictionResponseSchema.safeParse(raw);
        if (parsed.success) {
          return mapFastApiResponseToAssessment(
            parsed.data,
            studentConfirmedContext,
            attDelta,
            lastMark
          );
        }
      }
    } catch {
      clearTimeout(timer);
    }

    // Live ML failed, returned 503, or timed out -> explicit FALLBACK (never fabricate an ML model result)
    return {
      modelVersion: "rule-fallback-v1.0",
      score: 0.65,
      needsAttention: attDelta <= -15 || lastMark < 65,
      signalCategory:
        attDelta <= -15 || lastMark < 65 ? "NEEDS_ATTENTION" : "MONITOR",
      attentionSummary:
        "Needs attention — rule-based fallback indicator (ML service unreachable)",
      sourceMode: "FALLBACK",
      limitations:
        "ML service timed out or was unreachable; rule-based observation checklist used instead. Not a model result.",
      observedChanges: [
        {
          id: `OBS-${student.id}-ATT`,
          label: "Recorded attendance trend",
          detail: `Moved from ${firstAtt}% to ${lastAtt}% (${attDelta} percentage points).`,
          direction: attDelta < 0 ? "CONCERN" : "NEUTRAL",
        },
      ],
      modelExplanation: [
        {
          id: `EXP-${student.id}-FB`,
          label: "Fallback rule check",
          detail:
            "Evaluated multi-week attendance and assessment delta thresholds.",
          direction: "CONCERN",
        },
      ],
      hypothesisedCauses: [
        {
          id: `HYP-${student.id}-FB`,
          label: "Hypothesis: Schedule or coursework pacing barrier",
          detail: "Requires human mentor conversation to verify.",
          direction: "NEUTRAL",
        },
      ],
      studentConfirmedContext,
    };
  }

  // ML_MODE === "MOCK" -> deterministic mock ML adapter matching recorded observations
  return {
    modelVersion: "lt-ordinal-v2.4.1",
    score: 0.78,
    needsAttention: true,
    signalCategory: "NEEDS_ATTENTION",
    attentionSummary:
      student.id === "S-106"
        ? "Needs attention — lab workload and attendance dip"
        : "Needs attention — recent shift in lab attendance and midterm performance",
    sourceMode: "ML",
    limitations:
      "Trained on historical cohort patterns; cannot observe external personal obligations unless shared by the student. Does not predict individual outcomes.",
    observedChanges: [
      {
        id: "OBS-1",
        label: `Attendance trend (Weeks 1–${attendanceObs.length})`,
        detail: `Decreased from ${firstAtt}% in Week 1 to ${lastAtt}% (${attDelta} percentage points).`,
        direction: "CONCERN",
      },
      {
        id: "OBS-2",
        label: "Midterm marks observation",
        detail: `Latest assessment score of ${lastMark}% compared to baseline of ${firstMark}%.`,
        direction: "CONCERN",
      },
    ],
    modelExplanation: [
      {
        id: "EXP-1",
        label: "Multi-week attendance delta",
        detail:
          "Primary contributor to attention indicator based on rolling window.",
        direction: "CONCERN",
      },
      {
        id: "EXP-2",
        label: "Prior semester baseline",
        detail:
          "Consistent prior semester completion acts as a protective factor.",
        direction: "PROTECTIVE",
      },
    ],
    hypothesisedCauses: [
      {
        id: "HYP-1",
        label: "Hypothesis: Schedule or transit conflict with morning lab slots",
        detail:
          "Missed sessions cluster in morning lab blocks; requires conversation to verify.",
        direction: "NEUTRAL",
      },
      {
        id: "HYP-2",
        label: "Hypothesis: Conceptual gap in pointer/recursion modules",
        detail:
          "Midterm subsections show lower completion on recursion problems.",
        direction: "NEUTRAL",
      },
    ],
    studentConfirmedContext,
  };
}
