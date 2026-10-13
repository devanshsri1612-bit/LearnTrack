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
- `GET /`: Fast service status and API catalog.
- `GET /health`: System readiness, model status, and non-sensitive OCR configuration.
- `POST /predict`: Predict student performance risk from time-series observations.
- `POST /ocr`: Extract printed text from uploaded student document images via BHASHINI OCR.
- `POST /documents/parse`: Extract text via BHASHINI and dynamically parse academic fields (name, roll, marks, total, percentage) with SHA-256 integrity hash.
- `POST /documents/confirm`: Persist human-verified student document records to local SQLite store with duplicate detection.
- `GET /documents`: List verified student records with optional roll-number filter.
- `GET /documents/{id}`: Fetch verified document record by ID.
- `GET /analytics/summary`: Aggregate metrics, record counts, and subject-wise averages.
- `POST /documents/{id}/predict-compatibility`: Bridge verified marks to the ML prediction engine.

### Prediction Example:
```bash
curl -X POST http://127.0.0.1:8000/predict -H "Content-Type: application/json" --data @examples/prediction-request.json
```

### Document Parsing Example:
```bash
curl -X POST "http://127.0.0.1:8000/documents/parse?language=hi" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@path/to/student_document.png"
```

## Frontend Web Application & Node API
The monorepo includes a Node.js Express backend (`apps/api`) on port 4000 and a React/Vite web application (`apps/web`) on port 5173.

From the repository root (`C:\Users\himan\a21\LearnTrack`):
```bash
# Run both the Node backend and frontend together:
npm run dev

# Or run separately:
npm run dev:api  # Runs API on http://localhost:4000
npm run dev:web  # Runs Vite web app on http://localhost:5173
```
- Open `http://localhost:5173/login` in your browser.
- Use any demo account (e.g. `mentor@learntrack.edu` with password `demo-password` or click the demo buttons).
- Navigate to **Document OCR** in the sidebar to upload student documents, review extracted fields in real-time, correct values, and save confirmed records.

## OCR Configuration (.env)
Copy `.env.example` to `.env` and provide your credentials:
- `BHASHINI_OCR_URL`: Defaults to `https://dhruva-api.bhashini.gov.in/services/inference/pipeline`
- `BHASHINI_INFERENCE_API_KEY`: Your private inference API key.
- `BHASHINI_OCR_LANGUAGE`: Default language code (`hi` or `en`).
- `BHASHINI_OCR_SERVICE_ID`: Upstream OCR service ID (default: `bhashini/bodhan/indic-doc/ocr`).
- `MAX_IMAGE_UPLOAD_MB`: Maximum permitted upload size (default: 5 MB).

## Integration
Node/Express should call `POST http://127.0.0.1:8000/predict` with a configurable base URL, use a finite timeout (for example 3–5 seconds for a local demo), check `/health` at startup/readiness, and handle HTTP 503/timeouts with a graceful `prediction unavailable` state. Do not silently convert unavailable predictions to low risk. Persist the request/response according to institutional privacy and retention rules. Keep request schema and model package versions pinned together. For production, use authentication, authorization, TLS, logging controls and institution-approved data governance.

## Data and model limits
All training data are fictional. A 50/100 target threshold is a configurable demo choice. Model score is an estimate for the synthetic target, not a validated real-world probability. It is not a dropout prediction, diagnosis, causal explanation, or intervention-effect estimate. Humans must review evidence and decide next steps. Do not use for punishment or compulsory counselling.

`joblib` uses pickle-based serialization. Load `artifacts/model.joblib` only from a trusted source.
