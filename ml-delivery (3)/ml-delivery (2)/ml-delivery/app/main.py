from pathlib import Path
from fastapi import FastAPI, HTTPException
from app.schemas import PredictionRequest, PredictionResponse
from app.predictor import Predictor

BASE_DIR = Path(__file__).resolve().parents[1]
app = FastAPI(title="Student Success ML Service", version="1.0.0")
predictor = None

@app.on_event("startup")
def load_model():
    global predictor
    try:
        predictor = Predictor(BASE_DIR / "artifacts").load()
    except FileNotFoundError:
        predictor = None

@app.get("/health")
def health():
    return {"status":"ok" if predictor is not None else "degraded",
            "modelLoaded":predictor is not None,
            "modelVersion":predictor.metadata.get("model_version") if predictor else None}

@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    if predictor is None:
        raise HTTPException(status_code=503, detail="Prediction model unavailable. Check model artifact and service logs.")
    try:
        observations = []
        for o in request.observations:
            d = o.model_dump(by_alias=False)
            d["observed_at"] = d.pop("observedAt")
            d["attendance_attended"] = d.pop("attendanceAttended")
            d["attendance_total"] = d.pop("attendanceTotal")
            d["assessment_score"] = d.pop("assessmentScore")
            d["assessment_max"] = d.pop("assessmentMax")
            d["assignments_submitted"] = d.pop("assignmentsSubmitted")
            d["assignments_due"] = d.pop("assignmentsDue")
            d["lms_active_days"] = d.pop("lmsActiveDays")
            d["faculty_academic_concern"] = d.pop("facultyAcademicConcern")
            observations.append(d)
        result = predictor.predict(request.studentId, request.subject, request.asOf, observations)
        return result
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Prediction failed. Check service logs; input records were not returned.")
