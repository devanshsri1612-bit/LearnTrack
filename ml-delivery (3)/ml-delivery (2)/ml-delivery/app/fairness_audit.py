import pandas as pd
def fairness_screen(predictions, audit_metadata, minimum_group_size=30):
    """Descriptive synthetic-data screening only; never a proof of fairness."""
    df = predictions.merge(audit_metadata, on="student_id", how="left", validate="one_to_one")
    rows = []
    for group, g in df.groupby("audit_group", dropna=False):
        n = len(g)
        rows.append({"audit_group":str(group),"group_size":n,
                     "flag_rate":float(g["prediction"].mean()) if n else None,
                     "display_status":"insufficient_group_size" if n < minimum_group_size else "descriptive_only"})
    return pd.DataFrame(rows)
