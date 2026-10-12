from pathlib import Path
from app.predictor import Predictor
ROOT=Path(__file__).resolve().parents[1]
def test_model_loads():
    p=Predictor(ROOT/"artifacts").load()
    assert p.model is not None
    assert p.metadata["model_version"]=="synthetic-dsa-v1"
