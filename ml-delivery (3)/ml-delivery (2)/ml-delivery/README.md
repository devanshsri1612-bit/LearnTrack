# Student Success ML Delivery Package

## Quick start (Python 3.10–3.12 recommended)
```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m scripts.train
pytest -q
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The training script creates synthetic data, fits a student-level train/validation/test split, selects a model and threshold on validation data, evaluates once on the held-out test set, and exports artifacts. It does not use any paid API or GPU.

## API
- `GET /health`
- `POST /predict`

Example:
```bash
curl -X POST http://127.0.0.1:8000/predict -H "Content-Type: application/json" --data @examples/prediction-request.json
```

## Integration
Node/Express should call `POST http://127.0.0.1:8000/predict` with a configurable base URL, use a finite timeout (for example 3–5 seconds for a local demo), check `/health` at startup/readiness, and handle HTTP 503/timeouts with a graceful `prediction unavailable` state. Do not silently convert unavailable predictions to low risk. Persist the request/response according to institutional privacy and retention rules. Keep request schema and model package versions pinned together. For production, use authentication, authorization, TLS, logging controls and institution-approved data governance.

## Data and model limits
All training data are fictional. A 50/100 target threshold is a configurable demo choice. Model score is an estimate for the synthetic target, not a validated real-world probability. It is not a dropout prediction, diagnosis, causal explanation, or intervention-effect estimate. Humans must review evidence and decide next steps. Do not use for punishment or compulsory counselling.

`joblib` uses pickle-based serialization. Load `artifacts/model.joblib` only from a trusted source.
