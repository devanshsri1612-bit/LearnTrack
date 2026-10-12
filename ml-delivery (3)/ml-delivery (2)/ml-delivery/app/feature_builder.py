"""Shared feature engineering for training and inference."""
from __future__ import annotations
import pandas as pd
import numpy as np

FEATURE_COLUMNS = [
    "recent_score_mean", "score_trend", "recent_attendance_rate",
    "attendance_change", "assignment_completion_rate",
    "recent_lms_active_days_mean", "available_observations",
    "score_missing_rate", "attendance_missing_rate",
    "assignment_missing_rate", "academic_concern_count",
]

OBSERVATION_COLUMNS = [
    "student_id", "cohort_id", "subject", "week", "observed_at",
    "attendance_attended", "attendance_total", "assessment_score",
    "assessment_max", "assignments_submitted", "assignments_due",
    "lms_active_days", "faculty_academic_concern",
]

def _safe_rate(numerator, denominator):
    n = pd.to_numeric(numerator, errors="coerce")
    d = pd.to_numeric(denominator, errors="coerce")
    if np.isscalar(d):
        return (n / d) if pd.notna(d) and d > 0 else np.nan
    out = n / d.where(d > 0)
    return out.replace([np.inf, -np.inf], np.nan)

def build_features(history: pd.DataFrame, min_observations: int = 4):
    """Return (one-row feature frame, quality dict, evidence list).

    Recent = last four dated records. Trend = OLS slope of valid score
    percentages over chronological record index; needs >=2 valid scores.
    Rates use only rows with valid positive denominators. No rows are fabricated.
    """
    if history is None or len(history) == 0:
        return None, {"status": "insufficient_data", "reasons": ["No observations supplied."],
                      "observation_count": 0}, ["No historical observations are available."]
    df = history.copy()
    required = ["observed_at", "attendance_attended", "attendance_total",
                "assessment_score", "assessment_max", "assignments_submitted",
                "assignments_due", "lms_active_days", "faculty_academic_concern"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError("Missing required observation fields: " + ", ".join(missing))
    df["observed_at"] = pd.to_datetime(df["observed_at"], utc=True, errors="raise")
    df = df.sort_values("observed_at").reset_index(drop=True)
    if df["observed_at"].duplicated().any():
        raise ValueError("Duplicate observed_at timestamps in one student's history.")
    for col in ["attendance_attended", "attendance_total", "assessment_score",
                "assessment_max", "assignments_submitted", "assignments_due", "lms_active_days"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if ((df["attendance_attended"].dropna() < 0).any() or
        (df["attendance_total"].dropna() < 0).any()):
        raise ValueError("Attendance counts must be nonnegative.")
    valid_att = df["attendance_attended"].notna() & df["attendance_total"].notna()
    if (df.loc[valid_att, "attendance_attended"] > df.loc[valid_att, "attendance_total"]).any():
        raise ValueError("attendance_attended cannot exceed attendance_total.")
    valid_score = df["assessment_score"].notna() & df["assessment_max"].notna()
    if (df.loc[valid_score, "assessment_max"] <= 0).any():
        raise ValueError("assessment_max must be positive when a score is present.")
    if ((df.loc[valid_score, "assessment_score"] < 0) |
        (df.loc[valid_score, "assessment_score"] > df.loc[valid_score, "assessment_max"])).any():
        raise ValueError("Assessment score must be between 0 and assessment_max.")
    valid_asg = df["assignments_submitted"].notna() & df["assignments_due"].notna()
    if ((df.loc[valid_asg, "assignments_submitted"] < 0) |
        (df.loc[valid_asg, "assignments_due"] < 0)).any():
        raise ValueError("Assignment counts must be nonnegative.")
    if (df.loc[valid_asg, "assignments_submitted"] > df.loc[valid_asg, "assignments_due"]).any():
        raise ValueError("assignments_submitted cannot exceed assignments_due.")
    if (df["lms_active_days"].dropna() < 0).any():
        raise ValueError("lms_active_days must be nonnegative.")

    recent = df.tail(4)
    score_pct = _safe_rate(recent["assessment_score"], recent["assessment_max"]) * 100
    all_score_pct = _safe_rate(df["assessment_score"], df["assessment_max"]) * 100
    valid_trend = all_score_pct.dropna()
    trend = float(np.polyfit(np.arange(len(valid_trend)), valid_trend.to_numpy(), 1)[0]) if len(valid_trend) >= 2 else np.nan
    att_rate = _safe_rate(recent["attendance_attended"].sum(min_count=1),
                          recent["attendance_total"].sum(min_count=1))
    # Change compares the latest two nonempty rolling two-record attendance rates.
    att_rows = df[["attendance_attended", "attendance_total"]].copy()
    rolling_num = att_rows["attendance_attended"].rolling(2, min_periods=1).sum()
    rolling_den = att_rows["attendance_total"].rolling(2, min_periods=1).sum()
    rolling_att = _safe_rate(rolling_num, rolling_den).dropna()
    att_change = float(rolling_att.iloc[-1] - rolling_att.iloc[-2]) if len(rolling_att) >= 2 else np.nan
    asg_rate = _safe_rate(recent["assignments_submitted"].sum(min_count=1),
                          recent["assignments_due"].sum(min_count=1))
    concern = recent["faculty_academic_concern"].fillna(False).astype(bool).sum()
    values = {
        "recent_score_mean": float(score_pct.mean()) if score_pct.notna().any() else np.nan,
        "score_trend": trend,
        "recent_attendance_rate": float(att_rate) if pd.notna(att_rate) else np.nan,
        "attendance_change": att_change,
        "assignment_completion_rate": float(asg_rate) if pd.notna(asg_rate) else np.nan,
        "recent_lms_active_days_mean": float(recent["lms_active_days"].mean()) if recent["lms_active_days"].notna().any() else np.nan,
        "available_observations": int(len(df)),
        "score_missing_rate": float(recent["assessment_score"].isna().mean()),
        "attendance_missing_rate": float((recent["attendance_attended"].isna() | recent["attendance_total"].isna()).mean()),
        "assignment_missing_rate": float((recent["assignments_submitted"].isna() | recent["assignments_due"].isna()).mean()),
        "academic_concern_count": int(concern),
    }
    reasons = []
    if len(df) < min_observations:
        reasons.append(f"Only {len(df)} observations; {min_observations} are required.")
    if recent["assessment_score"].notna().sum() < 2:
        reasons.append("Fewer than two recent assessment scores are available.")
    if recent["attendance_total"].fillna(0).sum() == 0:
        reasons.append("No valid attendance denominator in the recent window.")
    quality = {"status": "insufficient_data" if len(df) < min_observations else "available",
               "reasons": reasons, "observation_count": int(len(df))}
    evidence = []
    if len(valid_trend) >= 2:
        evidence.append(f"Historical assessment-score trend: {trend:+.1f} percentage points per observed assessment.")
    if len(score_pct.dropna()) >= 2:
        evidence.append(f"Recent assessment mean: {score_pct.mean():.1f}% across {len(score_pct.dropna())} available scores.")
    if pd.notna(att_rate):
        evidence.append(f"Recent attendance rate: {float(att_rate)*100:.1f}%.")
    if pd.notna(att_change):
        evidence.append(f"Attendance change between the latest two rolling windows: {float(att_change)*100:+.1f} percentage points.")
    if pd.notna(asg_rate):
        evidence.append(f"Recent assignment completion: {float(asg_rate)*100:.1f}%.")
    if concern:
        evidence.append(f"{int(concern)} structured academic concern flag(s) in the recent window.")
    if not evidence:
        evidence.append("Available records do not support a reliable descriptive trend.")
    return pd.DataFrame([values], columns=FEATURE_COLUMNS), quality, evidence
