"""Deterministic fictional longitudinal academic data generator."""
from __future__ import annotations
import numpy as np
import pandas as pd

def generate_synthetic_data(n_students=1500, seed=42, threshold=50.0):
    rng = np.random.default_rng(seed)
    students, observations, outcomes, audit = [], [], [], []
    n_cohorts = max(5, n_students // 150)
    cohort_ids = [f"C{i+1:02d}" for i in range(n_cohorts)]
    for i in range(n_students):
        sid = f"S-{i+1:04d}"
        cohort = cohort_ids[i % n_cohorts]
        profile = rng.choice(["stable", "decline", "improve", "attendance_decline", "difficulty"], p=[.38,.20,.14,.14,.14])
        base_score = rng.normal(67, 10)
        base_att = np.clip(rng.normal(.86, .08), .50, .99)
        cohort_effect = rng.normal(0, 3)
        latent = rng.normal(0, 1)
        missing_recent = rng.random() < .07
        records = []
        for week in range(1, 9):
            score_trend = {"stable":0, "decline":-2.2, "improve":1.7, "attendance_decline":-.15, "difficulty":-.8}[profile]
            att_trend = {"stable":0, "decline":-.01, "improve":.005, "attendance_decline":-.055, "difficulty":-.01}[profile]
            score = base_score + cohort_effect + score_trend*(week-1) + latent*1.8 + rng.normal(0, 8)
            if profile == "difficulty":
                score -= max(0, week-3)*1.3
            score = float(np.clip(score, 0, 100))
            att_rate = float(np.clip(base_att + att_trend*(week-1) + rng.normal(0,.055), 0, 1))
            total = int(rng.integers(8, 13))
            attended = int(rng.binomial(total, att_rate))
            due = int(rng.integers(1, 4))
            submitted = int(rng.binomial(due, np.clip(.85 + (latent*.03) - max(0, -score_trend)*.015 + rng.normal(0,.1), .1, 1)))
            lms = int(np.clip(round(rng.normal(4 + (score-60)/20, 1.6)), 0, 7))
            is_missing = missing_recent and week >= 7 and rng.random() < .7
            records.append({
                "student_id": sid, "cohort_id": cohort, "subject": "DSA", "week": week,
                "observed_at": (pd.Timestamp("2026-08-03", tz="UTC") + pd.Timedelta(days=7*(week-1))).isoformat(),
                "attendance_attended": np.nan if is_missing and rng.random()<.5 else attended,
                "attendance_total": np.nan if is_missing and rng.random()<.5 else total,
                "assessment_score": np.nan if is_missing and rng.random()<.65 else round(score, 1),
                "assessment_max": 100.0,
                "assignments_submitted": np.nan if is_missing and rng.random()<.5 else submitted,
                "assignments_due": np.nan if is_missing and rng.random()<.5 else due,
                "lms_active_days": np.nan if is_missing and rng.random()<.5 else lms,
                "faculty_academic_concern": bool((score < 48 and rng.random()<.25) or rng.random()<.025),
            })
        # Future outcome depends on underlying trajectory, noise, and an unpredictable event.
        last_scores = [r["assessment_score"] for r in records[-3:] if pd.notna(r["assessment_score"])]
        score_mean = np.mean(last_scores) if last_scores else base_score
        trend_effect = {"stable":0, "decline":-8, "improve":5, "attendance_decline":-1, "difficulty":-5}[profile]
        future_score = float(np.clip(.55*score_mean + .45*(base_score+cohort_effect) + trend_effect + rng.normal(0, 13) - (rng.random()<.08)*rng.uniform(0,20), 0, 100))
        observations.extend(records)
        outcomes.append({"student_id":sid,"subject":"DSA","outcome_week":9,"assessment_score":round(future_score,1),"assessment_max":100.0,"below_threshold":int(future_score < threshold)})
        # Audit-only fictional group, independent of profile and outcome generation.
        audit.append({"student_id":sid,"audit_group":str(rng.choice(["Group A","Group B","Group C"]))})
    return pd.DataFrame(observations), pd.DataFrame(outcomes), pd.DataFrame(audit), {
        "seed": seed, "n_students": n_students, "subject": "DSA",
        "historical_weeks": list(range(1,9)), "future_outcome_week": 9,
        "positive_label": f"future assessment score < {threshold}", "threshold": threshold,
        "synthetic_only": True
    }
