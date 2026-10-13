from pathlib import Path
from fastapi import FastAPI, HTTPException
from app.schemas import PredictionRequest, PredictionResponse
from contextlib import asynccontextmanager
from app.predictor import Predictor
from app.bhashini_ocr import ocr_router, get_ocr_settings

BASE_DIR = Path(__file__).resolve().parents[1]
predictor = None

@asynccontextmanager
async def lifespan(fastapi_app: FastAPI):
    global predictor
    try:
        predictor = Predictor(BASE_DIR / "artifacts").load()
    except FileNotFoundError:
        predictor = None
    yield

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="LearnTrack Student Success & OCR Service",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr_router)

@app.get("/")
def root():
    return {
        "service": "LearnTrack Student Success & OCR Service",
        "status": "running",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
def health():
    ocr_settings = get_ocr_settings()
    return {
        "status": "ok" if predictor is not None else "degraded",
        "modelLoaded": predictor is not None,
        "modelVersion": predictor.metadata.get("model_version") if predictor else None,
        "ocr": {
            "configured": bool(ocr_settings["api_key"]),
            "endpoint": ocr_settings["url"],
            "language": ocr_settings["language"],
            "serviceId": ocr_settings["service_id"],
            "maxUploadMb": ocr_settings["max_upload_mb"]
        }
    }

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


# Document Persistence, Analytics, and Prediction Bridge
from app.schemas import (
    DocumentConfirmationRequest,
    ConfirmedDocumentRecord,
    SubjectMark,
)
from app.document_store import (
    save_confirmed_document,
    list_confirmed_documents,
    get_confirmed_document,
)


@app.post("/documents/confirm", response_model=ConfirmedDocumentRecord)
def confirm_document(request: DocumentConfirmationRequest):
    """Save human-verified student document data into persistent storage."""
    record = save_confirmed_document(request)
    return record


@app.get("/documents", response_model=list[ConfirmedDocumentRecord])
def get_documents(rollNumber: str = None, limit: int = 100):
    """List confirmed student document records with optional filter."""
    return list_confirmed_documents(limit=limit, roll_number=rollNumber)


@app.get("/documents/{doc_id}", response_model=ConfirmedDocumentRecord)
def get_document_by_id(doc_id: str):
    """Retrieve confirmed document by ID."""
    doc = get_confirmed_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document record not found.")
    return doc


@app.get("/analytics/summary")
def get_analytics_summary():
    """Generate overall summary analytics from verified student records."""
    docs = list_confirmed_documents(limit=500)
    total_docs = len(docs)
    unique_students = len(set(d.rollNumber for d in docs))
    
    # Calculate subject distribution
    subject_marks: dict[str, list[float]] = {}
    for d in docs:
        for sm in d.subjectMarks:
            if sm.obtainedMarks is not None and sm.maxMarks:
                pct = (sm.obtainedMarks / sm.maxMarks) * 100.0
                subject_marks.setdefault(sm.subject.lower(), []).append(pct)

    subject_averages = {
        subj: round(sum(scores) / len(scores), 2)
        for subj, scores in subject_marks.items()
    }

    return {
        "totalRecords": total_docs,
        "uniqueStudents": unique_students,
        "subjectAverages": subject_averages,
        "hasData": total_docs > 0
    }


@app.post("/documents/{doc_id}/predict-compatibility")
def check_and_predict_from_document(doc_id: str, asOf: str = None):
    """Bridge verified document data with the student success ML predictor."""
    doc = get_confirmed_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document record not found.")

    if predictor is None:
        raise HTTPException(status_code=503, detail="Prediction model unavailable.")

    # Find candidate subjects with assessment marks
    candidate_subjects = [
        sm for sm in doc.subjectMarks
        if sm.obtainedMarks is not None and sm.maxMarks is not None
    ]

    if not candidate_subjects:
        return {
            "compatible": False,
            "reason": "Document has no subjects with valid obtained and maximum marks.",
            "prediction": None
        }

    # Use first available subject or DSA if present
    target_subject = next((sm for sm in candidate_subjects if "dsa" in sm.subject.lower()), candidate_subjects[0])

    from datetime import datetime, timezone, timedelta
    from dateutil import parser as dt_parser

    # Parse document observed date
    obs_date_str = doc.examDate
    try:
        obs_dt = dt_parser.parse(obs_date_str) if obs_date_str else datetime.now(timezone.utc)
    except Exception:
        obs_dt = datetime.now(timezone.utc)

    # Ensure as_of_dt is strictly >= observed_at
    if asOf:
        try:
            as_of_parsed = dt_parser.parse(asOf)
        except Exception:
            as_of_parsed = obs_dt + timedelta(days=1)
    else:
        as_of_parsed = obs_dt + timedelta(days=1)

    obs_iso = obs_dt.isoformat()
    as_of_iso = as_of_parsed.isoformat()

    # Form observation compatible with predictor
    obs_dict = {
        "observed_at": obs_iso,
        "attendance_attended": doc.attendanceAttended if doc.attendanceAttended is not None else 8,
        "attendance_total": doc.attendanceTotal if doc.attendanceTotal is not None else 10,
        "assessment_score": target_subject.obtainedMarks,
        "assessment_max": target_subject.maxMarks,
        "assignments_submitted": 4,
        "assignments_due": 5,
        "lms_active_days": 10,
        "faculty_academic_concern": False,
    }

    try:
        prediction_result = predictor.predict(
            student_id=doc.rollNumber,
            subject=target_subject.subject,
            as_of=as_of_iso,
            observations=[obs_dict]
        )
        return {
            "compatible": True,
            "subjectEvaluated": target_subject.subject,
            "prediction": prediction_result
        }
    except Exception as e:
        return {
            "compatible": False,
            "reason": f"Prediction error: {str(e)}",
            "prediction": None
        }
