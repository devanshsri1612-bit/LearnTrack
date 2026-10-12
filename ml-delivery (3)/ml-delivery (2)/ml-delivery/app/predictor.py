from __future__ import annotations
from pathlib import Path
import json
import joblib
import pandas as pd
from app.feature_builder import build_features, FEATURE_COLUMNS

class Predictor:
    def __init__(self, artifact_dir="artifacts"):
        self.artifact_dir = Path(artifact_dir)
        self.model_path = self.artifact_dir / "model.joblib"
        self.metadata_path = self.artifact_dir / "metadata.json"
        self.model = None
        self.metadata = None

    def load(self):
        if not self.model_path.exists() or not self.metadata_path.exists():
            raise FileNotFoundError("Model artifact or metadata is missing. Run scripts/train.py first.")
        self.model = joblib.load(self.model_path)  # Only load artifacts from trusted sources.
        self.metadata = json.loads(self.metadata_path.read_text())
        return self

    def predict(self, student_id, subject, as_of, observations):
        if self.model is None:
            self.load()
        as_of = pd.to_datetime(as_of, utc=True)
        df = pd.DataFrame(observations)
        if df.empty:
            return self._insufficient(student_id, subject, "No observations supplied.")
        if "observed_at" not in df:
            raise ValueError("Each observation must include observed_at.")
        df["observed_at"] = pd.to_datetime(df["observed_at"], utc=True, errors="raise")
        if (df["observed_at"] > as_of).any():
            raise ValueError("Observation timestamp is later than asOf.")
        if "student_id" in df and df["student_id"].nunique() > 1:
            raise ValueError("All observations must belong to one student.")
        if df["observed_at"].duplicated().any():
            raise ValueError("Duplicate observation timestamps are not allowed.")
        feats, quality, evidence = build_features(df)
        if quality["status"] == "insufficient_data":
            return {"studentId":student_id,"subject":subject,"assessmentStatus":"insufficient_data",
                    "predictionTarget":self.metadata["prediction_target"],"modelVersion":self.metadata["model_version"],
                    "modelScore":None,"decisionThreshold":self.metadata["decision_threshold"],
                    "reviewSuggested":False,"evidence":evidence,"suggestedNextStep":"Collect sufficient recent academic observations, then review again.",
                    "requiresHumanReview":True,"dataQuality":quality,"limitations":self.metadata["limitations"],
                    "computedAt":pd.Timestamp.now(tz="UTC").isoformat(),"source":"synthetic-trained-model"}
        p = float(self.model.predict_proba(feats[FEATURE_COLUMNS])[0,1])
        threshold = float(self.metadata["decision_threshold"])
        review = p >= threshold
        next_step = "Review recent academic evidence with the student; agree on a suitable support option if warranted." if review else "Continue routine monitoring; this score is not a guarantee of future performance."
        if any("Attendance rate" in e for e in evidence) and any("trend:" in e and "+" in e for e in evidence):
            next_step = "Review the academic evidence with the student and ask for context before suggesting an intervention."
        return {"studentId":student_id,"subject":subject,"assessmentStatus":"assessed",
                "predictionTarget":self.metadata["prediction_target"],"modelVersion":self.metadata["model_version"],
                "modelScore":round(p,4),"decisionThreshold":threshold,"reviewSuggested":bool(review),
                "evidence":evidence,"suggestedNextStep":next_step,"requiresHumanReview":True,
                "dataQuality":quality,"limitations":self.metadata["limitations"],
                "computedAt":pd.Timestamp.now(tz="UTC").isoformat(),"source":"synthetic-trained-model"}

    def _insufficient(self, student_id, subject, reason):
        meta = self.metadata or {"prediction_target":"future DSA assessment below threshold","model_version":"unavailable","decision_threshold":None,"limitations":["Insufficient input data."]}
        return {"studentId":student_id,"subject":subject,"assessmentStatus":"insufficient_data",
                "predictionTarget":meta["prediction_target"],"modelVersion":meta["model_version"],
                "modelScore":None,"decisionThreshold":meta["decision_threshold"],"reviewSuggested":False,
                "evidence":["No historical observations are available."],"suggestedNextStep":"Collect sufficient recent academic observations, then review again.",
                "requiresHumanReview":True,"dataQuality":{"status":"insufficient_data","reasons":[reason],"observation_count":0},
                "limitations":meta["limitations"],"computedAt":pd.Timestamp.now(tz="UTC").isoformat(),"source":"synthetic-trained-model"}
