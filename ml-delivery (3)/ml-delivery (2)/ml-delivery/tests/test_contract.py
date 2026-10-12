from app.schemas import PredictionRequest

def test_request_schema_accepts_example():
    payload={"studentId":"S-104","subject":"DSA","asOf":"2026-10-12T00:00:00Z","observations":[
      {"observedAt":"2026-10-01T00:00:00Z","attendanceAttended":8,"attendanceTotal":10,
       "assessmentScore":68,"assessmentMax":100,"assignmentsSubmitted":2,"assignmentsDue":3,
       "lmsActiveDays":3,"facultyAcademicConcern":False}]}
    req=PredictionRequest.model_validate(payload)
    assert req.studentId=="S-104"
