from pathlib import Path
import json, platform
import numpy as np
import pandas as pd
import sklearn
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.dummy import DummyClassifier
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, average_precision_score, confusion_matrix
import joblib
from app.synthetic_data import generate_synthetic_data
from app.feature_builder import build_features, FEATURE_COLUMNS

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artifacts"; REP = ROOT / "reports"; DATA = ROOT / "data"
for p in [ART, REP, DATA]: p.mkdir(exist_ok=True)
SEED = 42
LABEL_THRESHOLD = 50.0
obs, outcomes, audit, config = generate_synthetic_data(n_students=1500, seed=SEED, threshold=LABEL_THRESHOLD)
obs.to_csv(DATA/"historical_observations.csv", index=False)
outcomes.to_csv(DATA/"future_outcomes.csv", index=False)
audit.to_csv(DATA/"audit_metadata.csv", index=False)
(DATA/"generator_config.json").write_text(json.dumps(config, indent=2))
rows=[]
for sid, hist in obs.groupby("student_id"):
    feats, quality, evidence = build_features(hist)
    if feats is not None:
        rows.append({"student_id":sid, **feats.iloc[0].to_dict()})
Xdf = pd.DataFrame(rows)
dataset = Xdf.merge(outcomes[["student_id","below_threshold"]], on="student_id", validate="one_to_one")
X = dataset[FEATURE_COLUMNS]
y = dataset["below_threshold"].astype(int)
ids = dataset["student_id"]
# Two-stage split produces 70/15/15 by student. One row/student prevents leakage.
X_train, X_temp, y_train, y_temp, id_train, id_temp = train_test_split(
    X, y, ids, test_size=.30, random_state=SEED, stratify=y)
X_val, X_test, y_val, y_test, id_val, id_test = train_test_split(
    X_temp, y_temp, id_temp, test_size=.50, random_state=SEED, stratify=y_temp)
assert set(id_train).isdisjoint(set(id_val)) and set(id_train).isdisjoint(set(id_test)) and set(id_val).isdisjoint(set(id_test))

def make_pipe(estimator):
    return Pipeline([("preprocess", Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler())
    ])), ("model", estimator)])

candidates = {
    "dummy_most_frequent": make_pipe(DummyClassifier(strategy="most_frequent")),
    "logistic_regression": make_pipe(LogisticRegression(max_iter=1500, class_weight="balanced", random_state=SEED))
}
validation_results={}
for name, pipe in candidates.items():
    pipe.fit(X_train, y_train)
    if hasattr(pipe.named_steps["model"], "predict_proba"):
        p = pipe.predict_proba(X_val)[:,1]
    else:
        p = np.zeros(len(y_val))
    validation_results[name] = {"pipeline":pipe,"probabilities":p}
# Choose the model by validation average precision; if unavailable, use F1.
def safe_ap(y_true, p):
    return float(average_precision_score(y_true,p)) if len(set(y_true)) > 1 else float("nan")
best_name = max(validation_results, key=lambda n: safe_ap(y_val, validation_results[n]["probabilities"]) if np.isfinite(safe_ap(y_val, validation_results[n]["probabilities"])) else -1)
best = validation_results[best_name]["pipeline"]
val_p = validation_results[best_name]["probabilities"]
# Pick a threshold on validation set by maximizing F1; tie-break toward higher threshold.
threshold_grid = np.linspace(.15,.85,71)
if len(set(y_val)) > 1:
    threshold = max(threshold_grid, key=lambda t: (f1_score(y_val, val_p >= t, zero_division=0), t))
else:
    threshold = .5
# Final evaluation only after model/threshold selection. Test set is not used for selection.
test_p = best.predict_proba(X_test)[:,1]
test_pred = test_p >= threshold
def metric_pack(y_true, p, pred):
    cm = confusion_matrix(y_true, pred, labels=[0,1]).tolist()
    return {
        "n":int(len(y_true)), "positive_rate":float(np.mean(y_true)),
        "precision":float(precision_score(y_true,pred,zero_division=0)),
        "recall":float(recall_score(y_true,pred,zero_division=0)),
        "f1":float(f1_score(y_true,pred,zero_division=0)),
        "roc_auc":float(roc_auc_score(y_true,p)) if len(set(y_true)) > 1 else None,
        "average_precision":float(average_precision_score(y_true,p)) if len(set(y_true)) > 1 else None,
        "confusion_matrix_labels_0_1":cm,
        "flag_fraction":float(np.mean(pred))
    }
metrics = {"selected_model":best_name,"validation_threshold":float(threshold),
           "validation":metric_pack(y_val,val_p,val_p>=threshold),
           "test":metric_pack(y_test,test_p,test_pred),
           "split_sizes":{"train":len(y_train),"validation":len(y_val),"test":len(y_test)},
           "student_split_overlap":False,
           "warning":"Synthetic data only; metrics are not real-world validation."}
joblib.dump(best, ART/"model.joblib")
metadata = {
    "model_version":"synthetic-dsa-v1",
    "prediction_target":f"Future week-9 DSA assessment below {LABEL_THRESHOLD}/100, using weeks 1-8 observations",
    "label_threshold_score":LABEL_THRESHOLD,
    "decision_threshold":float(threshold),
    "selected_model":best_name,
    "feature_columns":FEATURE_COLUMNS,
    "training_seed":SEED,
    "training_students":int(len(y_train)),
    "validation_students":int(len(y_val)),
    "test_students":int(len(y_test)),
    "python_version":platform.python_version(),
    "pandas_version":pd.__version__,
    "numpy_version":np.__version__,
    "scikit_learn_version":sklearn.__version__,
    "limitations":[
        "Trained and evaluated only on fictional synthetic data.",
        "Model scores are not validated real-world probabilities.",
        "A review signal is not a diagnosis or final intervention decision.",
        "Synthetic evaluation does not establish fairness or intervention effectiveness."
    ]
}
(ART/"metadata.json").write_text(json.dumps(metadata,indent=2))
(REP/"metrics.json").write_text(json.dumps(metrics,indent=2))
pd.DataFrame(metrics["test"]["confusion_matrix_labels_0_1"],index=["actual_0","actual_1"],columns=["predicted_0","predicted_1"]).to_csv(REP/"confusion-matrix.csv")
pd.DataFrame([{"model":k,"validation_average_precision":safe_ap(y_val,v["probabilities"])} for k,v in validation_results.items()]).to_csv(REP/"model-comparison.csv",index=False)
print(json.dumps(metrics,indent=2))
print(f"\nSaved model: {ART/'model.joblib'}")
