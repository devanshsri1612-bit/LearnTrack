import { prisma } from "../db.js";

// ==== 1. REWARD CONSTANTS ====
export const POINTS_COMEBACK = 30;
export const POINTS_CONSISTENCY = 20;
export const POINTS_SUPPORT_SESSION_STUDENT = 15;
export const POINTS_SUPPORT_SESSION_TUTOR = 20;

export const CONSISTENCY_ATTENDANCE_TARGET = 90;
export const COMEBACK_THRESHOLD_POINTS = 10;
export const COMEBACK_MIN_WEEKS = 6;
export const COMEBACK_MIN_INTERVAL_MS = 28 * 24 * 60 * 60 * 1000; // 4 weeks

export const WEEKLY_POINT_CAP = 60;
export const MAX_TUTOR_CREDITS_PER_WEEK = 3;
export const MIN_REWARDS_GROUP_SIZE = 30; // K-Anonymity privacy threshold for cohort summary

export function getActivityWeekKey(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  // Monday is day 1, Sunday is day 0
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10); // Monday ISO date YYYY-MM-DD
}

export interface CandidateRewardEvent {
  studentId: string;
  sourceType: "COMEBACK" | "CONSISTENCY" | "SUPPORT_SESSION" | "SUPPORT_SESSION_TUTOR";
  sourceId: string;
  rawPoints: number;
  reason: string;
  activityDate: Date;
  activityWeek: string;
}

export async function evaluateRewards(studentId: string): Promise<number> {
  const candidateEvents: CandidateRewardEvent[] = [];

  // 1. Process Attendance
  const obs = await prisma.academicObservation.findMany({
    where: {
      studentId,
      type: "ATTENDANCE",
      isMissing: false,
      value: { not: null },
    },
    orderBy: { observedAt: "asc" },
  });

  // Group by period: average subjects per period, ignore isMissing rows, never treat missing as 0
  const periodMap = new Map<string, { sum: number; count: number; date: Date }>();
  for (const o of obs) {
    if (o.value === null || o.isMissing) continue;
    const existing = periodMap.get(o.period);
    if (!existing) {
      periodMap.set(o.period, { sum: o.value, count: 1, date: o.observedAt });
    } else {
      existing.sum += o.value;
      existing.count += 1;
      if (o.observedAt < existing.date) existing.date = o.observedAt;
    }
  }

  const weeklyData: Array<{ period: string; avg: number; date: Date }> = [];
  for (const [period, data] of periodMap.entries()) {
    weeklyData.push({
      period,
      avg: data.sum / data.count,
      date: data.date,
    });
  }
  weeklyData.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Consistency rule (+20 per week with attendance >= 90)
  for (const week of weeklyData) {
    if (week.avg >= CONSISTENCY_ATTENDANCE_TARGET) {
      candidateEvents.push({
        studentId,
        sourceType: "CONSISTENCY",
        sourceId: week.period,
        rawPoints: POINTS_CONSISTENCY,
        reason: `Weekly attendance consistency (>= 90%) in ${week.period}`,
        activityDate: week.date,
        activityWeek: getActivityWeekKey(week.date),
      });
    }
  }

  // Comeback rule (+30): non-overlapping 3-week windows, key = last period of the window,
  // at most one per student per 4 weeks. Needs at least 6 weekly values.
  if (weeklyData.length >= COMEBACK_MIN_WEEKS) {
    let lastComebackDate: Date | null = null;
    const existingComebacks = await prisma.rewardLedgerEntry.findMany({
      where: { studentId, sourceType: "COMEBACK" },
      orderBy: { createdAt: "desc" },
    });
    if (existingComebacks.length > 0) {
      lastComebackDate = existingComebacks[0].createdAt;
    }

    for (let i = 0; i + 5 < weeklyData.length; i += 3) {
      const prev3 = [weeklyData[i], weeklyData[i + 1], weeklyData[i + 2]];
      const prevAvg = (prev3[0].avg + prev3[1].avg + prev3[2].avg) / 3;

      const latest3 = [weeklyData[i + 3], weeklyData[i + 4], weeklyData[i + 5]];
      const latestAvg = (latest3[0].avg + latest3[1].avg + latest3[2].avg) / 3;

      const diff = latestAvg - prevAvg;
      const lastPeriodOfWindow = latest3[2];
      if (diff >= COMEBACK_THRESHOLD_POINTS) {
        const canAward =
          !lastComebackDate ||
          Math.abs(lastPeriodOfWindow.date.getTime() - lastComebackDate.getTime()) >= COMEBACK_MIN_INTERVAL_MS;

        if (canAward) {
          candidateEvents.push({
            studentId,
            sourceType: "COMEBACK",
            sourceId: lastPeriodOfWindow.period,
            rawPoints: POINTS_COMEBACK,
            reason: `Significant attendance recovery (+${Math.round(diff)}% over prior 3-week baseline)`,
            activityDate: lastPeriodOfWindow.date,
            activityWeek: getActivityWeekKey(lastPeriodOfWindow.date),
          });
          lastComebackDate = lastPeriodOfWindow.date;
        }
      }
    }
  }

  // 2. Process Tutoring Sessions for Student (+15)
  const studentSessions = await prisma.tutoringSession.findMany({
    where: {
      studentId,
      status: "COMPLETED",
      feedbackSubmitted: true,
    },
    orderBy: { endIso: "asc" },
  });

  const now = Date.now();
  for (const s of studentSessions) {
    const endDate = new Date(s.endIso);
    if (endDate.getTime() > now) continue; // Past sessions only
    candidateEvents.push({
      studentId,
      sourceType: "SUPPORT_SESSION",
      sourceId: s.id,
      rawPoints: POINTS_SUPPORT_SESSION_STUDENT,
      reason: `Completed peer tutoring session: ${s.subject}`,
      activityDate: endDate,
      activityWeek: getActivityWeekKey(endDate),
    });
  }

  // 3. Process Tutoring Sessions for Tutor (+20) if student is a peer tutor
  const studentRecord = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, userId: true },
  });

  if (studentRecord?.userId) {
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: studentRecord.userId },
    });
    if (tutorProfile) {
      const tutorSessions = await prisma.tutoringSession.findMany({
        where: {
          tutorId: tutorProfile.id,
          status: "COMPLETED",
          feedbackSubmitted: true,
        },
        orderBy: { endIso: "asc" },
      });

      const weeklyPairRewarded = new Set<string>();
      const weeklyCreditsCount = new Map<string, number>();

      const existingTutorLedger = await prisma.rewardLedgerEntry.findMany({
        where: { studentId, sourceType: "SUPPORT_SESSION_TUTOR" },
      });
      for (const entry of existingTutorLedger) {
        if (entry.activityWeek) {
          weeklyCreditsCount.set(
            entry.activityWeek,
            (weeklyCreditsCount.get(entry.activityWeek) ?? 0) + 1
          );
        }
      }

      for (const s of tutorSessions) {
        // Reject tutor == student
        if (s.studentId === studentId) {
          console.log(`[rewards] Rejecting session ${s.id}: tutor equals student`);
          continue;
        }

        const endDate = new Date(s.endIso);
        if (endDate.getTime() > now) continue; // Past sessions only

        const week = getActivityWeekKey(endDate);
        const pairKey = `${week}_${s.studentId}`;

        // Max 1 rewarded session per tutor-student pair per week
        if (weeklyPairRewarded.has(pairKey)) continue;

        // Max 3 tutor credits per week
        const currentCredits = weeklyCreditsCount.get(week) ?? 0;
        if (currentCredits >= MAX_TUTOR_CREDITS_PER_WEEK) continue;

        weeklyPairRewarded.add(pairKey);
        weeklyCreditsCount.set(week, currentCredits + 1);

        candidateEvents.push({
          studentId,
          sourceType: "SUPPORT_SESSION_TUTOR",
          sourceId: s.id,
          rawPoints: POINTS_SUPPORT_SESSION_TUTOR,
          reason: `Peer tutor service credit for completed session: ${s.subject}`,
          activityDate: endDate,
          activityWeek: week,
        });
      }
    } else {
      console.log(`[rewards] Student ${studentId} userId ${studentRecord.userId} has no TutorProfile`);
    }
  }

  // 4. Process in activityDate order to enforce deterministic weekly cap
  candidateEvents.sort((a, b) => a.activityDate.getTime() - b.activityDate.getTime());

  const existingLedger = await prisma.rewardLedgerEntry.findMany({
    where: { studentId },
  });
  const existingKeys = new Set(existingLedger.map((e) => `${e.sourceType}_${e.sourceId}`));

  const weekPointsMap = new Map<string, number>();
  for (const e of existingLedger) {
    const w = e.activityWeek ?? getActivityWeekKey(e.createdAt);
    weekPointsMap.set(w, (weekPointsMap.get(w) ?? 0) + e.points);
  }

  let newEntriesCount = 0;
  for (const ev of candidateEvents) {
    const key = `${ev.sourceType}_${ev.sourceId}`;
    if (existingKeys.has(key)) {
      continue; // Idempotent skip
    }

    const currentWeekPoints = weekPointsMap.get(ev.activityWeek) ?? 0;
    const remainingAllowance = Math.max(0, WEEKLY_POINT_CAP - currentWeekPoints);
    if (remainingAllowance <= 0) {
      continue; // Weekly cap reached for this activity week
    }

    const pointsToAward = Math.min(ev.rawPoints, remainingAllowance);
    if (pointsToAward <= 0) continue;

    try {
      await prisma.rewardLedgerEntry.create({
        data: {
          studentId: ev.studentId,
          sourceType: ev.sourceType,
          sourceId: ev.sourceId,
          points: pointsToAward,
          reason: ev.reason,
          activityWeek: ev.activityWeek,
          createdAt: new Date(),
        },
      });
      weekPointsMap.set(ev.activityWeek, currentWeekPoints + pointsToAward);
      existingKeys.add(key);
      newEntriesCount++;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== "P2002") {
        throw err;
      }
    }
  }

  return newEntriesCount;
}

export async function evaluateAllStudents(): Promise<{ evaluatedStudents: number; newEntriesCount: number }> {
  const students = await prisma.student.findMany({ select: { id: true } });
  let totalNew = 0;
  for (const s of students) {
    totalNew += await evaluateRewards(s.id);
  }
  return { evaluatedStudents: students.length, newEntriesCount: totalNew };
}
