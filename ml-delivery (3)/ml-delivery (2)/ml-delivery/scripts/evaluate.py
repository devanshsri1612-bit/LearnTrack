import json
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "reports/metrics.json"
if not p.exists():
    raise SystemExit("Metrics not found. Run python -m scripts.train first.")
print(json.dumps(json.loads(p.read_text()), indent=2))
