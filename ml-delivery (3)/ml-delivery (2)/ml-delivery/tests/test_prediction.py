from pathlib import Path
import pandas as pd
import pytest
from app.predictor import Predictor

ROOT=Path(__file__).resolve().parents[1]
def records(n=8):
    return [{"observed_at":(pd.Timestamp("2026-09-01",tz="UTC")+pd.Timedelta(days=7*i)).isoformat(),
      "attendance_attended":8 if i<5 else 6,"attendance_total":10,
      "assessment_score":75-i*2,"assessment_max":100,
      "assignments_submitted":2,"assignments_due":3,"lms_active_days":4,
      "faculty_academic_concern":False} for i in range(n)]

def test_prediction_or_insufficient():
    p=Predictor(ROOT/"artifacts").load()
    result=p.predict("S-TEST","DSA","2026-12-01T00:00:00Z",records())
    assert result["assessmentStatus"] == "assessed"
    assert result["requiresHumanReview"] is True

def test_future_observation_rejected():
    p=Predictor(ROOT/"artifacts").load()
    with pytest.raises(ValueError):
        p.predict("S-TEST","DSA","2026-09-01T00:00:00Z",records())

def test_empty_history():
    p=Predictor(ROOT/"artifacts").load()
    result=p.predict("S-EMPTY","DSA","2026-12-01T00:00:00Z",[])
    assert result["modelScore"] is None
