"""Observed-evidence explanations and simple logistic-regression contributions."""
def logistic_contributions(model_pipeline, feature_row):
    """Return signed contributions on the standardized feature scale where available."""
    try:
        prep = model_pipeline.named_steps["preprocess"]
        clf = model_pipeline.named_steps["model"]
        transformed = prep.transform(feature_row)
        names = prep.get_feature_names_out()
        coef = clf.coef_[0]
        vals = transformed[0]
        pairs = [(str(n), float(v*c)) for n,v,c in zip(names, vals, coef)]
        return sorted(pairs, key=lambda x: abs(x[1]), reverse=True)
    except Exception:
        return []
