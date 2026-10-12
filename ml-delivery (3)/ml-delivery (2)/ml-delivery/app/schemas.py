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
