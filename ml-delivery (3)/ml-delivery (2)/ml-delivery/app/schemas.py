from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    observedAt: datetime
    attendanceAttended: Optional[int] = Field(default=None, ge=0)
    attendanceTotal: Optional[int] = Field(default=None, ge=0)
    assessmentScore: Optional[float] = Field(default=None, ge=0)
    assessmentMax: Optional[float] = Field(default=None, gt=0)
    assignmentsSubmitted: Optional[int] = Field(default=None, ge=0)
    assignmentsDue: Optional[int] = Field(default=None, ge=0)
    lmsActiveDays: Optional[int] = Field(default=None, ge=0)
    facultyAcademicConcern: Optional[bool] = None

class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    studentId: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=50)
    asOf: datetime
    observations: List[Observation]

class PredictionResponse(BaseModel):
    studentId: str
    subject: str
    assessmentStatus: str
    predictionTarget: str
    modelVersion: str
    modelScore: Optional[float]
    decisionThreshold: Optional[float]
    reviewSuggested: bool
    evidence: list[str]
    suggestedNextStep: str
    requiresHumanReview: bool
    dataQuality: dict
    limitations: list[str]
    computedAt: str
    source: str


class OCRResultItem(BaseModel):
    source: str = ""
    target: Optional[str] = ""


class OCRResponse(BaseModel):
    success: bool
    language: str
    serviceId: str
    extractedText: str
    rawOutputs: List[OCRResultItem] = []


class SubjectMark(BaseModel):
    subject: str = Field(..., min_length=1)
    obtainedMarks: Optional[float] = Field(default=None, ge=0)
    maxMarks: Optional[float] = Field(default=None, gt=0)
    grade: Optional[str] = None


class ParsedStudentDocument(BaseModel):
    documentId: str
    studentName: Optional[str] = None
    rollNumber: Optional[str] = None
    institution: Optional[str] = None
    academicYearOrClass: Optional[str] = None
    examName: Optional[str] = None
    examDate: Optional[str] = None
    subjectMarks: List[SubjectMark] = []
    totalObtained: Optional[float] = None
    totalMax: Optional[float] = None
    percentage: Optional[float] = None
    attendanceAttended: Optional[int] = None
    attendanceTotal: Optional[int] = None
    documentHash: Optional[str] = None
    rawText: str = ""
    warnings: List[str] = []
    requiresReview: bool = False


class DocumentConfirmationRequest(BaseModel):
    documentId: str
    studentName: str = Field(..., min_length=1)
    rollNumber: str = Field(..., min_length=1)
    institution: Optional[str] = None
    academicYearOrClass: Optional[str] = None
    examName: Optional[str] = None
    examDate: Optional[str] = None
    subjectMarks: List[SubjectMark] = []
    totalObtained: Optional[float] = None
    totalMax: Optional[float] = None
    percentage: Optional[float] = None
    attendanceAttended: Optional[int] = None
    attendanceTotal: Optional[int] = None
    notes: Optional[str] = None


class ConfirmedDocumentRecord(BaseModel):
    id: str
    documentId: str
    studentName: str
    rollNumber: str
    institution: Optional[str] = None
    academicYearOrClass: Optional[str] = None
    examName: Optional[str] = None
    examDate: Optional[str] = None
    subjectMarks: List[SubjectMark] = []
    totalObtained: Optional[float] = None
    totalMax: Optional[float] = None
    percentage: Optional[float] = None
    attendanceAttended: Optional[int] = None
    attendanceTotal: Optional[int] = None
    documentHash: Optional[str] = None
    rawText: str = ""
    confirmedAt: str
    notes: Optional[str] = None
