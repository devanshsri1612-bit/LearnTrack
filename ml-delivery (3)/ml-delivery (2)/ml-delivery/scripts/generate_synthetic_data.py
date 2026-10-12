import json
from pathlib import Path
from app.synthetic_data import generate_synthetic_data

ROOT = Path(__file__).resolve().parents[1]
(ROOT / "data").mkdir(exist_ok=True)
obs, outcomes, audit, config = generate_synthetic_data()
obs.to_csv(ROOT / "data/historical_observations.csv", index=False)
outcomes.to_csv(ROOT / "data/future_outcomes.csv", index=False)
audit.to_csv(ROOT / "data/audit_metadata.csv", index=False)
(ROOT / "data/generator_config.json").write_text(json.dumps(config, indent=2))
print(f"Saved {len(obs)} historical rows, {len(outcomes)} outcomes, {len(audit)} audit rows.")
