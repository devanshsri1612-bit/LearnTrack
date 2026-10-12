import pandas as pd
def cohort_trends(observations, minimum_size=10):
    df = observations.copy()
    df["score_pct"] = pd.to_numeric(df["assessment_score"], errors="coerce") / pd.to_numeric(df["assessment_max"], errors="coerce") * 100
    df["attendance_rate"] = pd.to_numeric(df["attendance_attended"], errors="coerce") / pd.to_numeric(df["attendance_total"], errors="coerce").replace(0, float("nan"))
    result = df.groupby(["cohort_id","subject","week"], dropna=False).agg(
        student_count=("student_id","nunique"), mean_score_pct=("score_pct","mean"),
        mean_attendance_rate=("attendance_rate","mean")).reset_index()
    result["display_status"] = result["student_count"].map(lambda n: "insufficient_group_size" if n < minimum_size else "descriptive_only")
    return result
