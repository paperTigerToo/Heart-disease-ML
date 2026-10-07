"""Reproducible port of HeartDiseaseML.py that exports JSON for the website.

Run from anywhere:
    python analysis/export_results.py            # uses cached model results when present
    python analysis/export_results.py --fresh    # clears the cache and refits everything

Outputs go to site/public/data/*.json plus analysis/model_summary.md.
Every fitted model's test-set probabilities are cached in analysis/.cache/, so changing
the export format later only takes seconds.
"""

import argparse
import json
import platform
import shutil
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import imblearn
from imblearn.combine import SMOTEENN
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import EditedNearestNeighbours, RandomUnderSampler
from sklearn import metrics
from sklearn.decomposition import PCA
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import AdaBoostClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.neighbors import KNeighborsClassifier, NearestNeighbors
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", module="sklearn.neural_network")  # MLP ConvergenceWarning at max_iter=200

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "heart_2020_cleaned.csv"
OUT = ROOT / "site" / "public" / "data"
CACHE = Path(__file__).resolve().parent / ".cache"
SUMMARY = Path(__file__).resolve().parent / "model_summary.md"
SEED = 42
CURVE_POINTS = 101

# ---------------------------------------------------------------------------
# Feature dictionary (descriptions follow the Kaggle / CDC BRFSS 2020 codebook)
# ---------------------------------------------------------------------------
FEATURES = {
    "BMI": ("Health status", "numeric", "Body Mass Index"),
    "Smoking": ("Behaviors", "binary", "Smoked at least 100 cigarettes in their life"),
    "AlcoholDrinking": ("Behaviors", "binary", "Heavy drinker (men >14, women >7 drinks a week)"),
    "Stroke": ("Conditions", "binary", "Ever told they had a stroke"),
    "PhysicalHealth": ("Health status", "numeric", "Days of poor physical health in the past 30"),
    "MentalHealth": ("Health status", "numeric", "Days of poor mental health in the past 30"),
    "DiffWalking": ("Health status", "binary", "Serious difficulty walking or climbing stairs"),
    "Sex": ("Demographics", "binary", "Sex"),
    "AgeCategory": ("Demographics", "ordinal", "Age group (13 five-year bands)"),
    "Race": ("Demographics", "categorical", "Race / ethnicity"),
    "Diabetic": ("Conditions", "categorical", "Ever told they had diabetes"),
    "PhysicalActivity": ("Behaviors", "binary", "Exercised in the past 30 days outside of work"),
    "GenHealth": ("Health status", "ordinal", "Self-rated general health"),
    "SleepTime": ("Behaviors", "numeric", "Average hours of sleep a day"),
    "Asthma": ("Conditions", "binary", "Ever told they had asthma"),
    "KidneyDisease": ("Conditions", "binary", "Ever told they had kidney disease"),
    "SkinCancer": ("Conditions", "binary", "Ever told they had skin cancer"),
}
BINARY = ["HeartDisease", "Smoking", "AlcoholDrinking", "Stroke", "DiffWalking",
          "PhysicalActivity", "Asthma", "KidneyDisease", "SkinCancer"]
GENHEALTH = {"Poor": 0, "Fair": 1, "Good": 2, "Very good": 3, "Excellent": 4}
AGE = {"18-24": 0, "25-29": 1, "30-34": 2, "35-39": 3, "40-44": 4, "45-49": 5, "50-54": 6,
       "55-59": 7, "60-64": 8, "65-69": 9, "70-74": 10, "75-79": 11, "80 or older": 12}
DIABETIC = {"Yes": 1, "No": 0, "No, borderline diabetes": 0, "Yes (during pregnancy)": 0}
SCALED = ["BMI", "PhysicalHealth", "MentalHealth", "SleepTime"]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def r4(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 4)


def cached(key, fn):
    """Return fn()'s result from analysis/.cache/<key>.joblib, computing it once."""
    path = CACHE / f"{key}.joblib"
    if path.exists():
        return joblib.load(path)
    t = time.time()
    result = fn()
    log(f"  fitted {key} in {time.time() - t:.0f}s")
    joblib.dump(result, path)
    return result


# ---------------------------------------------------------------------------
# Preprocessing: same encoding as HeartDiseaseML.py lines 19-45
# ---------------------------------------------------------------------------
def preprocess(raw):
    df = raw.copy()
    for col in BINARY:
        df[col] = df[col].map({"Yes": 1, "No": 0})
    df["Sex"] = df["Sex"].astype(str).str.strip().str.lower().map({"female": 0, "male": 1})
    df["GenHealth"] = df["GenHealth"].map(GENHEALTH)
    df["AgeCategory"] = df["AgeCategory"].map(AGE)
    df = pd.get_dummies(df, columns=["Race"], dtype=int)
    df["Diabetic"] = df["Diabetic"].map(DIABETIC)
    assert not df.isna().any().any(), "unmapped category during encoding"
    return df.astype({c: int for c in df.columns if c not in SCALED})


# ---------------------------------------------------------------------------
# Evaluation: HeartDiseaseML.py evaluate_model(), extended with PR-AUC and curves
# ---------------------------------------------------------------------------
def confusion(y_true, y_pred):
    tn, fp, fn, tp = metrics.confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}


def scores(y_true, proba, threshold=0.5):
    # predict() in sklearn's binary classifiers is proba > 0.5, so ">" keeps parity at the default
    y_pred = (proba > threshold).astype(int)
    return {
        "acc": r4(metrics.accuracy_score(y_true, y_pred)),
        "prec": r4(metrics.precision_score(y_true, y_pred, zero_division=0)),
        "rec": r4(metrics.recall_score(y_true, y_pred)),
        "f1": r4(metrics.f1_score(y_true, y_pred, zero_division=0)),
        "kappa": r4(metrics.cohen_kappa_score(y_true, y_pred)),
        "bal_acc": r4(metrics.balanced_accuracy_score(y_true, y_pred)),
    }, confusion(y_true, y_pred)


def curves(y_true, proba):
    grid = np.linspace(0, 1, CURVE_POINTS)
    fpr, tpr, _ = metrics.roc_curve(y_true, proba)
    roc_tpr = np.interp(grid, fpr, tpr)
    roc_tpr[0] = 0.0
    prec, rec, _ = metrics.precision_recall_curve(y_true, proba)
    # interpolated precision: best precision achievable at recall >= r
    pr_prec = [float(prec[rec >= r].max()) if (rec >= r).any() else 0.0 for r in grid]
    return {
        "roc": [[r4(f), r4(t)] for f, t in zip(grid, roc_tpr)],
        "pr": [[r4(r), r4(p)] for r, p in zip(grid, pr_prec)],
    }


def evaluate(y_true, proba, threshold=0.5, with_curves=True):
    s, cm = scores(y_true, proba, threshold)
    if np.unique(proba).size > 1:
        s["roc_auc"] = r4(metrics.roc_auc_score(y_true, proba))
        s["pr_auc"] = r4(metrics.average_precision_score(y_true, proba))
    else:  # constant scores (the dummy): ranking is a coin flip, PR-AUC is the positive rate
        s["roc_auc"] = 0.5
        s["pr_auc"] = r4(np.mean(y_true))
    out = {"metrics": s, "cm": cm, "threshold": threshold}
    if with_curves:
        out["curves"] = curves(y_true, proba)
    return out


def fit_proba(make_model, X_tr, y_tr, X_te):
    def run():
        t = time.time()
        model = make_model()
        model.fit(X_tr, y_tr)
        proba = model.predict_proba(X_te)[:, 1].astype(np.float32)
        return {"proba": proba, "seconds": round(time.time() - t, 1)}
    return run


# ---------------------------------------------------------------------------
# dataset.json helpers
# ---------------------------------------------------------------------------
def rate_table(raw, col, order=None):
    g = raw.groupby(col)["HeartDisease"].agg(n="size", yes=lambda s: int((s == "Yes").sum()))
    if order:
        g = g.reindex(order)
    return [{"value": str(k), "n": int(r.n), "yes": int(r.yes), "rate": r4(r.yes / r.n)}
            for k, r in g.iterrows()]


def hist_table(raw, col, edges):
    cut = pd.cut(raw[col].clip(edges[0], edges[-1] - 1e-9), edges, right=False)
    g = raw.groupby(cut, observed=False)["HeartDisease"].agg(
        n="size", yes=lambda s: int((s == "Yes").sum()))
    return [{"x0": float(iv.left), "x1": float(iv.right), "n": int(r.n), "yes": int(r.yes),
             "rate": r4(r.yes / r.n) if r.n else None} for iv, r in g.iterrows()]


def build_dataset_json(raw, encoded):
    counts = raw["HeartDisease"].value_counts()
    features = []
    for name, (group, kind, desc) in FEATURES.items():
        f = {"name": name, "group": group, "type": kind, "description": desc}
        if name == "BMI":
            f["bins"] = hist_table(raw, name, list(range(12, 62, 2)))
        elif name in ("PhysicalHealth", "MentalHealth"):
            f["bins"] = hist_table(raw, name, [0, 1, 3, 6, 11, 16, 21, 26, 30, 31])
        elif name == "SleepTime":
            f["bins"] = hist_table(raw, name, list(range(1, 26)))
        elif name == "AgeCategory":
            f["categories"] = rate_table(raw, name, list(AGE))
        elif name == "GenHealth":
            f["categories"] = rate_table(raw, name, list(GENHEALTH))
        else:
            f["categories"] = rate_table(raw, name)
        features.append(f)
    sample = raw.iloc[0]
    return {
        "rows": int(len(raw)),
        "classes": {"No": int(counts["No"]), "Yes": int(counts["Yes"])},
        "positive_rate": r4(counts["Yes"] / len(raw)),
        "source": {
            "name": "Personal Key Indicators of Heart Disease (2020 cleaned)",
            "origin": "CDC Behavioral Risk Factor Surveillance System (BRFSS) 2020",
            "via": "Kaggle, Kamil Pytlak",
        },
        "features": features,
        "encoding_example": {
            "raw": {k: (v.item() if hasattr(v, "item") else v) for k, v in sample.items()},
            "encoded": {k: (v.item() if hasattr(v, "item") else v) for k, v in encoded.iloc[0].items()},
        },
    }


# ---------------------------------------------------------------------------
# SMOTE / ENN illustration (traced by hand so every synthetic point knows its parents)
# ---------------------------------------------------------------------------
def smote_illustration(X_scaled_train, y_train, pca, n=1500, k=5):
    rng = np.random.default_rng(SEED)
    idx = train_test_split(np.arange(len(y_train)), train_size=n, stratify=y_train,
                           random_state=SEED)[0]
    X, y = X_scaled_train[idx], y_train[idx]
    minority = np.where(y == 1)[0]
    need = int((y == 0).sum() - (y == 1).sum())
    nn = NearestNeighbors(n_neighbors=k + 1).fit(X[minority])
    neigh = nn.kneighbors(X[minority], return_distance=False)[:, 1:]
    synth, parents = [], []
    for _ in range(need):  # the SMOTE rule: x_new = x_i + gap * (x_neighbor - x_i)
        a = rng.integers(len(minority))
        b = neigh[a, rng.integers(k)]
        gap = rng.random()
        synth.append(X[minority[a]] + gap * (X[minority[b]] - X[minority[a]]))
        parents.append((int(minority[a]), int(minority[b])))
    X_all = np.vstack([X, np.array(synth)])
    y_all = np.concatenate([y, np.ones(need, dtype=int)])
    enn = EditedNearestNeighbours()
    enn.fit_resample(X_all, y_all)
    kept = np.zeros(len(y_all), dtype=bool)
    kept[enn.sample_indices_] = True
    xy = pca.transform(X_all)[:, :2]
    points = []
    for i in range(len(y_all)):
        p = {"x": r4(xy[i, 0]), "y": r4(xy[i, 1]), "cls": int(y_all[i]),
             "kind": "original" if i < len(y) else "synthetic", "kept": bool(kept[i])}
        if i >= len(y):
            p["parents"] = parents[i - len(y)]
        points.append(p)
    return {
        "n_original": int(len(y)), "n_original_yes": int(y.sum()),
        "n_synthetic": need, "n_removed_by_enn": int((~kept).sum()),
        "explained_variance_2d": [r4(v) for v in pca.explained_variance_ratio_[:2]],
        "points": points,
    }


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fresh", action="store_true", help="delete the cache and refit everything")
    args = ap.parse_args()
    if args.fresh and CACHE.exists():
        shutil.rmtree(CACHE)
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    started = time.time()

    log(f"loading {CSV.name}")
    raw = pd.read_csv(CSV)
    counts = raw["HeartDisease"].value_counts()
    assert len(raw) == 319_795 and counts["No"] == 292_422 and counts["Yes"] == 27_373

    df = preprocess(raw)
    y = df["HeartDisease"]
    X = df.drop("HeartDisease", axis=1)
    assert X.shape[1] == 22

    # Fix vs notebook: seeded + stratified split (the notebook's split was random on every run)
    x_train, x_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=SEED)
    assert len(y_test) == 79_949
    scaler = StandardScaler()
    x_train = x_train.copy()
    x_test = x_test.copy()
    x_train[SCALED] = scaler.fit_transform(x_train[SCALED])
    x_test[SCALED] = scaler.transform(x_test[SCALED])
    yt = y_test.to_numpy()

    log("writing dataset.json")
    dataset = build_dataset_json(raw, df)

    # --- Random forest feature importance (notebook lines 74-90) -----------------------
    imp_before = cached("rf100_importance", lambda: RandomForestClassifier(
        n_estimators=100, random_state=SEED, n_jobs=-1).fit(x_train, y_train).feature_importances_)
    order = np.argsort(imp_before)[::-1]
    top = list(x_train.columns[order])

    # --- Accuracy vs top-k features loop (notebook lines 101-118) ----------------------
    # RandomForest(50) on the top-k features is also the notebook's RF1/RF6/RF15/RF22.
    log("accuracy vs number of top features (22 random forests)")
    sweep, results = [], {}
    for k in range(1, len(top) + 1):
        cols = top[:k]
        res = cached(f"rf50_top{k}", fit_proba(
            lambda: RandomForestClassifier(n_estimators=50, random_state=SEED, n_jobs=-1),
            x_train[cols], y_train, x_test[cols]))
        ev = evaluate(yt, res["proba"], with_curves=False)
        sweep.append({"k": k, "feature": top[k - 1], **ev["metrics"]})
        if k in (1, 6, 15, 22):
            results[f"rf-{k}"] = res

    # --- Spec of every model on the website --------------------------------------------
    specs = {}

    def spec(mid, label, family, features, balancing, train_rows, notebook, group):
        specs[mid] = {"id": mid, "label": label, "family": family, "features": features,
                      "balancing": balancing, "train_rows": int(train_rows),
                      "in_notebook": notebook, "group": group}

    n_tr = len(y_train)
    spec("dummy", "Always say No", "Baseline", 0, "none", n_tr, False, "baseline")
    results["dummy"] = cached("dummy", fit_proba(
        lambda: DummyClassifier(strategy="most_frequent"), x_train, y_train, x_test))

    # Notebook lines 170-249: LogReg / RF / KNN on the top 1, 6, 15 and 22 features
    log("logistic regression, random forest and KNN on top 1 / 6 / 15 / 22 features")
    for k in (1, 6, 15, 22):
        cols = top[:k]
        spec(f"logreg-{k}", f"Logistic regression ({k})", "Logistic regression", k, "none", n_tr, True, "naive")
        spec(f"rf-{k}", f"Random forest ({k})", "Random forest", k, "none", n_tr, True, "naive")
        spec(f"knn-{k}", f"KNN ({k})", "KNN", k, "none", n_tr, True, "naive")
        results[f"logreg-{k}"] = cached(f"logreg_top{k}", fit_proba(
            lambda: LogisticRegression(max_iter=1000, random_state=SEED),
            x_train[cols], y_train, x_test[cols]))
        results[f"knn-{k}"] = cached(f"knn5_top{k}", fit_proba(
            lambda: KNeighborsClassifier(n_neighbors=5, n_jobs=-1),
            x_train[cols], y_train, x_test[cols]))

    # Notebook lines 251-261: AdaBoost on decision stumps
    log("AdaBoost (750 stumps)")
    spec("adaboost", "AdaBoost", "AdaBoost", 22, "none", n_tr, True, "naive")
    results["adaboost"] = cached("adaboost750", fit_proba(
        lambda: AdaBoostClassifier(
            estimator=DecisionTreeClassifier(criterion="entropy", max_depth=1, random_state=1),
            n_estimators=750, learning_rate=0.1, random_state=1),
        x_train, y_train, x_test))

    # Notebook lines 300-323: scaler + PCA(90%) + MLP on the full training set
    log("MLP pipelines")

    def mlp(hidden):
        return lambda: Pipeline([
            ("scaler", StandardScaler()),
            ("pca", PCA(n_components=0.90, random_state=SEED)),
            ("mlp", MLPClassifier(hidden_layer_sizes=hidden, max_iter=200, random_state=SEED)),
        ])

    spec("mlp-50-25", "Neural net (50, 25)", "Neural net (MLP)", 22, "none", n_tr, True, "naive")
    spec("mlp-100", "Neural net (100)", "Neural net (MLP)", 22, "none", n_tr, True, "naive")
    results["mlp-50-25"] = cached("mlp_50_25", fit_proba(mlp((50, 25)), x_train, y_train, x_test))
    results["mlp-100"] = cached("mlp_100", fit_proba(mlp((100,)), x_train, y_train, x_test))

    # --- Balancing comparison --------------------------------------------------------
    # Notebook lines 272-276: SMOTEENN runs on a stratified 50% sample of the training set.
    # Every balancing method uses that same sample so the comparison is apples to apples.
    x_bal, _, y_bal, _ = train_test_split(x_train, y_train, train_size=0.5,
                                          stratify=y_train, random_state=SEED)
    log(f"balancing comparison on {len(y_bal):,} training rows")

    def resample(name, sampler):
        return cached(f"resample_{name}", lambda: sampler.fit_resample(x_bal, y_bal))

    X_rus, y_rus = resample("rus", RandomUnderSampler(random_state=SEED))
    X_smote, y_smote = resample("smote", SMOTE(random_state=SEED))
    X_res, y_res = resample("smoteenn", SMOTEENN(random_state=SEED))

    def logreg(**kw):
        return lambda: LogisticRegression(max_iter=1000, random_state=SEED, **kw)

    def rf(**kw):
        return lambda: RandomForestClassifier(n_estimators=50, random_state=SEED, n_jobs=-1, **kw)

    n_bal = len(y_bal)
    spec("logreg-sample", "Logistic regression", "Logistic regression", 22, "none", n_bal, False, "balancing")
    spec("logreg-classweight", "Logistic regression + class weights", "Logistic regression", 22, "class weights", n_bal, False, "balancing")
    spec("logreg-rus", "Logistic regression + undersampling", "Logistic regression", 22, "undersampling", len(y_rus), False, "balancing")
    spec("logreg-smote", "Logistic regression + SMOTE", "Logistic regression", 22, "SMOTE", len(y_smote), False, "balancing")
    spec("logreg-smoteenn", "Logistic regression + SMOTEENN", "Logistic regression", 22, "SMOTEENN", len(y_res), True, "balancing")
    spec("knn-smoteenn", "KNN + SMOTEENN", "KNN", 22, "SMOTEENN", len(y_res), True, "balancing")
    spec("rf-classweight", "Random forest + class weights", "Random forest", 22, "class weights", n_bal, False, "balancing")
    spec("rf-smoteenn", "Random forest + SMOTEENN", "Random forest", 22, "SMOTEENN", len(y_res), False, "balancing")
    spec("mlp-80-40-smoteenn", "Neural net (80, 40) + SMOTEENN", "Neural net (MLP)", 22, "SMOTEENN", len(y_res), True, "balancing")

    results["logreg-sample"] = cached("logreg_sample", fit_proba(logreg(), x_bal, y_bal, x_test))
    results["logreg-classweight"] = cached("logreg_classweight", fit_proba(logreg(class_weight="balanced"), x_bal, y_bal, x_test))
    results["logreg-rus"] = cached("logreg_rus", fit_proba(logreg(), X_rus, y_rus, x_test))
    results["logreg-smote"] = cached("logreg_smote", fit_proba(logreg(), X_smote, y_smote, x_test))
    results["logreg-smoteenn"] = cached("logreg_smoteenn", fit_proba(logreg(), X_res, y_res, x_test))
    results["knn-smoteenn"] = cached("knn5_smoteenn", fit_proba(
        lambda: KNeighborsClassifier(n_neighbors=5, n_jobs=-1), X_res, y_res, x_test))
    results["rf-classweight"] = cached("rf50_classweight", fit_proba(rf(class_weight="balanced"), x_bal, y_bal, x_test))
    results["rf-smoteenn"] = cached("rf50_smoteenn", fit_proba(rf(), X_res, y_res, x_test))
    results["mlp-80-40-smoteenn"] = cached("mlp_80_40_smoteenn", fit_proba(mlp((80, 40)), X_res, y_res, x_test))

    # --- Threshold tuning: pick the cut-off from cross-validated TRAINING predictions ----
    log("threshold tuning (5-fold cross-validation on the training set)")
    cv_proba = cached("logreg_cv_proba", lambda: cross_val_predict(
        LogisticRegression(max_iter=1000, random_state=SEED), x_train, y_train,
        cv=StratifiedKFold(5, shuffle=True, random_state=SEED), method="predict_proba")[:, 1])
    grid = np.round(np.arange(0.01, 1.0, 0.01), 2)
    cv_f1 = [metrics.f1_score(y_train, (cv_proba > t).astype(int), zero_division=0) for t in grid]
    best_t = float(grid[int(np.argmax(cv_f1))])
    spec("logreg-threshold", f"Logistic regression, threshold {best_t:.2f}", "Logistic regression", 22, "threshold", n_tr, False, "balancing")
    results["logreg-threshold"] = {**results["logreg-22"]}  # same fitted model, new cut-off

    # --- Evaluate everything -------------------------------------------------------------
    models = []
    for mid, s in specs.items():
        t = best_t if mid == "logreg-threshold" else 0.5
        ev = evaluate(yt, results[mid]["proba"], threshold=t)
        cm = ev["cm"]
        assert sum(cm.values()) == 79_949, mid
        assert all(0 <= v <= 1 for k, v in ev["metrics"].items() if k != "kappa"), mid
        assert -1 <= ev["metrics"]["kappa"] <= 1, mid
        models.append({**s, **ev, "fit_seconds": results[mid].get("seconds")})
    by_id = {m["id"]: m for m in models}
    assert abs(by_id["dummy"]["metrics"]["acc"] - 0.9144) < 0.001
    assert by_id["dummy"]["metrics"]["rec"] == 0 and by_id["dummy"]["metrics"]["kappa"] == 0

    # --- Threshold sweep for the interactive slider (plain logistic regression) ---------
    p = results["logreg-22"]["proba"]
    sweep_t = []
    for t in np.round(np.linspace(0, 1, 101), 2):
        s, cm = scores(yt, p, t)
        sweep_t.append({"t": float(t), **s, **cm})
    bins = np.linspace(0, 1, 51)
    threshold_json = {
        "model": "logreg-22",
        "label": "Logistic regression (all 22 features)",
        "default_threshold": 0.5,
        "chosen_threshold": best_t,
        "chosen_by": "max F1 on 5-fold cross-validated training predictions",
        "cv_f1_at_chosen": r4(max(cv_f1)),
        "sweep": sweep_t,
        "histogram": {
            "edges": [r4(b) for b in bins],
            "no": np.histogram(p[yt == 0], bins)[0].tolist(),
            "yes": np.histogram(p[yt == 1], bins)[0].tolist(),
        },
    }

    # --- Resampling summary + SMOTE illustration ----------------------------------------
    log("resampling summary and SMOTE illustration")
    imp_after = cached("rf100_importance_smoteenn", lambda: RandomForestClassifier(
        n_estimators=100, random_state=SEED, n_jobs=-1).fit(X_res, y_res).feature_importances_)

    def cls_counts(yv):
        yv = np.asarray(yv)
        return {"No": int((yv == 0).sum()), "Yes": int((yv == 1).sum())}

    full_scaler = StandardScaler().fit(x_train)
    pca_full = PCA(random_state=SEED).fit(full_scaler.transform(x_train))
    n90 = int(np.searchsorted(np.cumsum(pca_full.explained_variance_ratio_), 0.90) + 1)
    pca2 = PCA(n_components=2, random_state=SEED).fit(full_scaler.transform(x_train))
    illus = cached("smote_illustration_v1", lambda: smote_illustration(
        full_scaler.transform(x_train), y_train.to_numpy(), pca2))

    resampling_json = {
        "train_rows": n_tr,
        "sample_rows": n_bal,
        "note": "Only training rows are resampled. The test set keeps its real 91/9 split.",
        "methods": [
            {"id": "none", "label": "No balancing", "counts": cls_counts(y_bal)},
            {"id": "class weights", "label": "Class weights", "counts": cls_counts(y_bal),
             "weights": {"No": r4(n_bal / (2 * (y_bal == 0).sum())), "Yes": r4(n_bal / (2 * (y_bal == 1).sum()))}},
            {"id": "undersampling", "label": "Random undersampling", "counts": cls_counts(y_rus)},
            {"id": "SMOTE", "label": "SMOTE", "counts": cls_counts(y_smote)},
            {"id": "SMOTEENN", "label": "SMOTE + ENN cleanup", "counts": cls_counts(y_res)},
        ],
        "importance_after_smoteenn": [{"feature": f, "importance": r4(v)} for f, v in
                                      sorted(zip(x_train.columns, imp_after), key=lambda t: -t[1])],
        "illustration": illus,
    }

    naive_json = {
        "baseline_accuracy": by_id["dummy"]["metrics"]["acc"],
        "top_features": top,
        "importance": [{"feature": top[i], "importance": r4(imp_before[order[i]])} for i in range(len(top))],
        "accuracy_vs_features": sweep,
    }

    meta_json = {
        "seed": SEED,
        "rows": int(len(raw)),
        "train_rows": n_tr,
        "test_rows": int(len(y_test)),
        "test_classes": cls_counts(yt),
        "pca_components_for_90pct": n90,
        "versions": {"python": platform.python_version(), "pandas": pd.__version__,
                     "numpy": np.__version__, "scikit-learn": sklearn.__version__,
                     "imbalanced-learn": imblearn.__version__},
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    def write(name, obj):
        path = OUT / name
        path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
        return path.stat().st_size

    sizes = {
        "dataset.json": write("dataset.json", dataset),
        "naive.json": write("naive.json", naive_json),
        "models.json": write("models.json", {"models": models}),
        "resampling.json": write("resampling.json", resampling_json),
        "threshold.json": write("threshold.json", threshold_json),
        "meta.json": write("meta.json", meta_json),
    }
    total = sum(sizes.values())
    for n, s in sizes.items():
        log(f"  {n:16s} {s / 1024:7.1f} KB")
    log(f"  total            {total / 1024:7.1f} KB")
    assert total < 500 * 1024, "JSON payload over budget"

    # --- Human-readable summary for review -------------------------------------------
    lines = ["# Model summary", "",
             f"Test set: {len(y_test):,} rows ({cls_counts(yt)['Yes']:,} with heart disease). "
             f"Seed {SEED}. Generated {meta_json['generated']}.", "",
             "| Model | Balancing | Train rows | Acc | Prec | Recall | F1 | κ | ROC-AUC | PR-AUC | Caught (TP/all sick) |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for m in sorted(models, key=lambda m: -m["metrics"]["f1"]):
        s, cm = m["metrics"], m["cm"]
        lines.append(f"| {m['label']} | {m['balancing']} | {m['train_rows']:,} | {s['acc']:.3f} | {s['prec']:.3f} | "
                     f"{s['rec']:.3f} | {s['f1']:.3f} | {s['kappa']:.3f} | {s['roc_auc']:.3f} | {s['pr_auc']:.3f} | "
                     f"{cm['tp']:,}/{cm['tp'] + cm['fn']:,} |")
    lines += ["", f"Threshold tuning picked **{best_t:.2f}** (max cross-validated F1 on training data).",
              f"Top features by RF importance: {', '.join(top[:6])}."]
    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log(f"done in {(time.time() - started) / 60:.1f} min; summary in {SUMMARY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
