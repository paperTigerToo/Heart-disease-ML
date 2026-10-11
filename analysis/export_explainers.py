"""Data for the model-explainer animations in the site's "Inside the models" chapter.

    python analysis/export_explainers.py

Writes two files to site/public/data/:
  points.json      the 1,500-person training sample (with SMOTEENN's synthetic rows) in 3D,
                   shared by the chapter 5 SMOTE chart and the KNN / boosting explainers
  explainers.json  a real decision tree, the logistic-regression and neural-net weights,
                   and three example patients

Reuses the preprocessing, split and seed from export_results.py, so every number
matches the main export. Takes about 20 seconds.
"""

import json
import time

import numpy as np
import pandas as pd
from imblearn.under_sampling import EditedNearestNeighbours
from sklearn import metrics
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from export_results import AGE, CACHE, CSV, GENHEALTH, OUT, SCALED, SEED, cached, log, preprocess, r4

LABELS = {
    "BMI": "BMI", "Smoking": "Smoker", "AlcoholDrinking": "Heavy drinker", "Stroke": "Had a stroke",
    "PhysicalHealth": "Poor physical-health days", "MentalHealth": "Poor mental-health days",
    "DiffWalking": "Difficulty walking", "Sex": "Male", "AgeCategory": "Age group",
    "Diabetic": "Diabetic", "PhysicalActivity": "Exercises", "GenHealth": "General health",
    "SleepTime": "Hours of sleep", "Asthma": "Asthma", "KidneyDisease": "Kidney disease",
    "SkinCancer": "Skin cancer",
    "Race_American Indian/Alaskan Native": "American Indian / Alaskan Native", "Race_Asian": "Asian",
    "Race_Black": "Black", "Race_Hispanic": "Hispanic", "Race_Other": "Other race", "Race_White": "White",
}
AGE_NAMES = list(AGE)
HEALTH_NAMES = list(GENHEALTH)  # 0 = Poor ... 4 = Excellent


def r3(x):
    return round(float(x), 3)


def r2(x):
    return round(float(x), 2)


def encoding(col):
    if col in SCALED:
        return "scaled"
    if col.startswith("Race_"):
        return "race"
    if col in ("AgeCategory", "GenHealth"):
        return "ordinal"
    return "binary"


# ---------------------------------------------------------------------------
# Plain-language questions for the decision tree's splits
# ---------------------------------------------------------------------------
BINARY_Q = {
    "Smoking": "Smoked 100+ cigarettes?", "AlcoholDrinking": "Heavy drinker?", "Stroke": "Ever had a stroke?",
    "DiffWalking": "Difficulty walking?", "Sex": "Male?", "Diabetic": "Diabetic?",
    "PhysicalActivity": "Exercised last month?", "Asthma": "Asthma?", "KidneyDisease": "Kidney disease?",
    "SkinCancer": "Skin cancer?",
}


def question(col, thr):
    """Return (question, side of the split that means 'yes')."""
    if col in BINARY_Q:
        return BINARY_Q[col], "right"
    if col.startswith("Race_"):
        return f"{LABELS[col]}?", "right"
    if col == "AgeCategory":
        first = int(np.floor(thr)) + 1
        return f"Age {AGE_NAMES[first].split('-')[0].split(' ')[0]} or older?", "right"
    if col == "GenHealth":
        cut = int(np.floor(thr))  # left side is categories 0..cut
        if cut <= 1:
            names = " or ".join(n.lower() for n in reversed(HEALTH_NAMES[: cut + 1]))
            return f"Health {names}?", "left"
        names = " or ".join(n.lower() for n in HEALTH_NAMES[cut + 1:])
        return f"Health {names}?", "right"
    if col == "BMI":
        return f"BMI over {thr:.1f}?", "right"
    if col in ("PhysicalHealth", "MentalHealth"):
        kind = "physical" if col == "PhysicalHealth" else "mental"
        return f"Poor {kind} health {int(np.floor(thr)) + 1}+ days a month?", "right"
    if col == "SleepTime":
        return f"Sleeps over {thr:.1f} hours?", "right"
    raise ValueError(col)


# ---------------------------------------------------------------------------
# The SMOTE / ENN sample: same rows and random draws as export_results.smote_illustration
# ---------------------------------------------------------------------------
def smote_sample(X_scaled_train, y_train, n=1500, k=5):
    rng = np.random.default_rng(SEED)
    idx = train_test_split(np.arange(len(y_train)), train_size=n, stratify=y_train, random_state=SEED)[0]
    X, y = X_scaled_train[idx], y_train[idx]
    minority = np.where(y == 1)[0]
    need = int((y == 0).sum() - (y == 1).sum())
    nn = NearestNeighbors(n_neighbors=k + 1).fit(X[minority])
    neigh = nn.kneighbors(X[minority], return_distance=False)[:, 1:]
    synth, parents = [], []
    for _ in range(need):
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
    synthetic = np.arange(len(y_all)) >= len(y)
    return X_all, y_all, synthetic, kept, parents


def main():
    started = time.time()
    log(f"loading {CSV.name}")
    raw = pd.read_csv(CSV)
    df = preprocess(raw)
    y = df["HeartDisease"]
    X = df.drop("HeartDisease", axis=1)
    cols = list(X.columns)
    x_train_raw, x_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=SEED)
    scaler = StandardScaler().fit(x_train_raw[SCALED])
    x_train, x_test = x_train_raw.copy(), x_test_raw.copy()
    x_train[SCALED] = scaler.transform(x_train_raw[SCALED])
    x_test[SCALED] = scaler.transform(x_test_raw[SCALED])
    ytr, yte = y_train.to_numpy(), y_test.to_numpy()
    rng = np.random.default_rng(SEED)

    # --- 1. The 1,500-person sample in 3D (the first two axes are chapter 5's 2D view) ----
    log("PCA sample")
    full_scaler = StandardScaler().fit(x_train)
    Xs = full_scaler.transform(x_train)
    pca3 = PCA(n_components=3, random_state=SEED).fit(Xs)
    X_all, y_all, synthetic, kept, parents = smote_sample(Xs, ytr)
    # PCA signs are arbitrary: turn each axis so its strongest loading is positive, so the
    # pictures never mirror between runs
    flip = np.sign(pca3.components_[np.arange(3), np.abs(pca3.components_).argmax(axis=1)])
    xyz = pca3.transform(X_all) * flip
    points = []
    n_orig = int((~synthetic).sum())
    for i in range(len(y_all)):
        pa, pb = parents[i - n_orig] if synthetic[i] else (-1, -1)
        points.append([r2(xyz[i, 0]), r2(xyz[i, 1]), r2(xyz[i, 2]), int(y_all[i]),
                       int(synthetic[i]), int(kept[i]), pa, pb])
    comps = pca3.components_ * flip[:, None]
    axes = []
    for c in comps:
        top = np.argsort(-np.abs(c))[:5]
        axes.append([[cols[j], r3(c[j])] for j in top])

    # --- 3. A real decision tree (depth 3, class weights) on all 22 answers ---------------
    log("decision tree")
    tree = DecisionTreeClassifier(max_depth=3, class_weight="balanced", random_state=SEED).fit(x_train_raw, ytr)
    t = tree.tree_
    path_tr = tree.decision_path(x_train_raw)
    n_tr = np.asarray(path_tr.sum(axis=0)).ravel()
    yes_tr = np.asarray(path_tr[ytr == 1].sum(axis=0)).ravel()
    path_te = tree.decision_path(x_test_raw)
    n_te = np.asarray(path_te.sum(axis=0)).ravel()
    yes_te = np.asarray(path_te[yte == 1].sum(axis=0)).ravel()
    depth = np.zeros(t.node_count, dtype=int)
    nodes = []
    for i in range(t.node_count):
        left, right = int(t.children_left[i]), int(t.children_right[i])
        for c in (left, right):
            if c >= 0:
                depth[c] = depth[i] + 1
        node = {"id": i, "depth": int(depth[i]), "n": int(n_tr[i]), "yes": int(yes_tr[i]),
                "test_n": int(n_te[i]), "test_yes": int(yes_te[i]),
                "predict": int(np.argmax(t.value[i][0]))}
        if left >= 0:
            col = cols[t.feature[i]]
            q, yes_side = question(col, t.threshold[i])
            node.update({"feature": col, "threshold": r3(t.threshold[i]), "question": q,
                         "children": [left, right], "yes_side": yes_side})
        nodes.append(node)
    tree_pred = tree.predict(x_test_raw)
    tree_metrics = {"acc": r4(metrics.accuracy_score(yte, tree_pred)), "rec": r4(metrics.recall_score(yte, tree_pred)),
                    "prec": r4(metrics.precision_score(yte, tree_pred)), "f1": r4(metrics.f1_score(yte, tree_pred))}
    leaf_te = tree.apply(x_test_raw)
    pick_te = np.concatenate([rng.choice(np.where(yte == 1)[0], 300, replace=False),
                              rng.choice(np.where(yte == 0)[0], 300, replace=False)])
    rng.shuffle(pick_te)
    plinko = [[int(leaf_te[i]), int(yte[i])] for i in pick_te]

    # --- 4. Logistic regression on all 22 answers (the notebook's model) -----------------
    log("logistic regression")
    lr = LogisticRegression(max_iter=1000, random_state=SEED).fit(x_train, ytr)
    z_te = lr.decision_function(x_test)
    p_te = 1 / (1 + np.exp(-z_te))
    ref = joblib_load("logreg_top22")
    if ref is not None:
        log(f"  max |p - cached logreg-22 p| = {np.max(np.abs(ref - p_te)):.2e}")

    # --- 5. The neural net (scaler -> PCA 90% -> 100 ReLU -> 1), refit exactly as exported --
    log("neural net (about 15 s the first time)")
    mlp = cached("mlp_100_pipeline", lambda: Pipeline([
        ("scaler", StandardScaler()),
        ("pca", PCA(n_components=0.90, random_state=SEED)),
        ("mlp", MLPClassifier(hidden_layer_sizes=(100,), max_iter=200, random_state=SEED)),
    ]).fit(x_train, ytr))
    mp_te = mlp.predict_proba(x_test)[:, 1]
    ref = joblib_load("mlp_100")
    if ref is not None:
        log(f"  max |p - cached mlp-100 p| = {np.max(np.abs(ref - mp_te)):.2e}")
    sc, pc, net = mlp.named_steps["scaler"], mlp.named_steps["pca"], mlp.named_steps["mlp"]

    def mlp_forward(xrow):
        s = (xrow - sc.mean_) / sc.scale_
        c = (s - pc.mean_) @ pc.components_.T
        h = np.maximum(0, c @ net.coefs_[0] + net.intercepts_[0])
        o = h @ net.coefs_[1] + net.intercepts_[1]
        return float(1 / (1 + np.exp(-o[0])))

    # --- Example patients: one caught, one only caught by the tuned cut-off, one healthy ----
    def closest(mask, target):
        idx = np.where(mask)[0]
        return int(idx[np.argmin(np.abs(p_te[idx] - target))])

    chosen = {
        "caught": closest((yte == 1) & (p_te > 0.5), 0.72),
        "borderline": closest((yte == 1) & (p_te > 0.18) & (p_te < 0.5), 0.3),
        "healthy": closest((yte == 0) & (p_te < 0.5), 0.03),
    }
    examples = []
    for key, i in chosen.items():
        row = raw.loc[x_test_raw.index[i]]
        xrow = x_test.iloc[i].to_numpy(dtype=float)
        mp = mlp_forward(xrow)
        assert abs(mp - mp_te[i]) < 1e-6
        examples.append({
            "key": key, "has_disease": int(yte[i]),
            "answers": {k: (v.item() if hasattr(v, "item") else v) for k, v in row.items() if k != "HeartDisease"},
            "x": [r4(v) for v in xrow], "z": r4(z_te[i]), "p": r4(p_te[i]), "mlp_p": r4(mp),
            "tree_leaf": int(tree.apply(x_test_raw.iloc[[i]])[0]),
        })
    curve_idx = rng.choice(len(yte), 1200, replace=False)  # real 91/9 mix
    curve = [[r3(z_te[i]), int(yte[i])] for i in curve_idx]

    logreg_json = {
        "intercept": r4(lr.intercept_[0]),
        # training means, so a prediction can be explained relative to an average person:
        # z = (b + w·mean) + w·(x - mean)
        "x_mean": [r4(v) for v in x_train.mean().to_numpy()],
        "features": [{"name": c, "label": LABELS[c], "w": r4(w), "encoding": encoding(c),
                      **({"mean": r4(scaler.mean_[SCALED.index(c)]), "sd": r4(scaler.scale_[SCALED.index(c)])}
                         if c in SCALED else {})}
                     for c, w in zip(cols, lr.coef_[0])],
        "sample": curve,
    }
    mlp_json = {
        "hidden": 100, "components": int(pc.n_components_),
        "scaler_mean": [r4(v) for v in sc.mean_], "scaler_scale": [r4(v) for v in sc.scale_],
        "pca_mean": [r4(v) for v in pc.mean_],
        "pca": [[r4(v) for v in row] for row in pc.components_],
        "W1": [[r4(v) for v in row] for row in net.coefs_[0]], "b1": [r4(v) for v in net.intercepts_[0]],
        "W2": [r4(v[0]) for v in net.coefs_[1]], "b2": r4(net.intercepts_[1][0]),
    }

    points_json = {"explained": [r4(v) for v in pca3.explained_variance_ratio_], "axes": axes,
                   "columns": ["x", "y", "z", "cls", "synthetic", "kept", "parentA", "parentB"],
                   "points": points}
    explainers = {
        "labels": LABELS,
        "tree": {"max_depth": 3, "class_weight": "balanced", "nodes": nodes, "test_metrics": tree_metrics,
                 "plinko": plinko, "plinko_note": "300 test-set people with heart disease and 300 without"},
        "logreg": logreg_json,
        "mlp": mlp_json,
        "examples": examples,
        "features": cols,
    }
    for name, obj in (("points.json", points_json), ("explainers.json", explainers)):
        path = OUT / name
        path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
        log(f"  {name:15s} {path.stat().st_size / 1024:7.1f} KB")
    log(f"tree test metrics: {tree_metrics}")
    for e in examples:
        log(f"  example {e['key']:10s} disease={e['has_disease']} logreg p={e['p']:.3f} mlp p={e['mlp_p']:.3f}")
    log(f"done in {time.time() - started:.0f}s")


def joblib_load(key):
    import joblib
    path = CACHE / f"{key}.joblib"
    return joblib.load(path)["proba"] if path.exists() else None


if __name__ == "__main__":
    main()
