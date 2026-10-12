import pandas as pd
import pytest
from app.feature_builder import build_features, FEATURE_COLUMNS

def history(n=5):
    return pd.DataFrame([{"observed_at":f"2026-09-{i+1:02d}T00:00:00Z",
      "attendance_attended":8,"attendance_total":10,"assessment_score":60+i,
      "assessment_max":100,"assignments_submitted":2,"assignments_due":3,
      "lms_active_days":4,"faculty_academic_concern":False} for i in range(n)])

def test_feature_columns():
    x,q,e = build_features(history())
    assert list(x.columns) == FEATURE_COLUMNS
    assert q["status"] == "available"

def test_invalid_attendance():
    h=history()
    h.loc[0,"attendance_attended"]=12
    with pytest.raises(ValueError):
        build_features(h)

def test_zero_denominators_do_not_infinite():
    h=history()
    h["attendance_total"]=0
    h["attendance_attended"]=0
    x,q,e=build_features(h)
    assert x["recent_attendance_rate"].isna().all()
