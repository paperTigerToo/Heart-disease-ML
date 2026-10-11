# Heart Disease ML: Scrollytelling Portfolio Site

## Context
Your CS-375 Colab project ([HeartDiseaseML.py](HeartDiseaseML.py) + [heart_2020_cleaned.csv](heart_2020_cleaned.csv)) predicts heart disease from the CDC's 2020 BRFSS survey. You want a portfolio site that shows off your ML and data-analytics work by telling the project's real story:

1. A naive model scores about 91% accuracy.
2. But 91.44% of respondents answered "No", so a model that always guesses "No" scores the same.
3. You rebalanced the data, including with synthetic SMOTE data.
4. You picked the metrics that actually fit this problem.
5. You compared how every model really did.

The design centers on a **Three.js heart that moves and changes as you scroll**, with **D3 charts**, text and transitions animating into view. **Mockups come first.**

**Decisions made**
- **Analysis:** extend the notebook. Add an "always No" baseline, random undersampling, plain SMOTE, class weights and threshold tuning alongside your SMOTEENN models.
- **Mockups:** 3, all in a **dark cinematic** style. Each one uses a different heart: particle, realistic anatomical, or stylized glass/low-poly.
- **Roles:** **the AI builds, you direct.** You make the design calls, own the story's voice and check the numbers.

**Facts from the files**
- **Data:** 319,795 respondents. 292,422 answered No (91.44%) and 27,373 answered Yes (8.56%). After encoding there are 22 model inputs.
- **Notebook fixes needed:** it reads from a Colab Drive path (line 13), uses `display()`, and its `train_test_split` (line 59) has no seed and no stratify. Re-runs will therefore differ slightly from your Colab numbers.
- **Machine:** Python 3.13, pandas 2.3, scikit-learn 1.7, Node 24 and git are installed. **Missing:** `imbalanced-learn`. The folder isn't a git repo yet.

## Tech stack
| Layer | Choice |
|---|---|
| Build | Vite with plain JavaScript modules: no framework, easy to walk through |
| 3D | three.js |
| Charts | d3 v7 |
| Scroll & motion | GSAP ScrollTrigger + SplitText (all free since GSAP 3.13), Lenis for smooth scrolling |
| Analysis | Python, pandas, scikit-learn, imbalanced-learn |
| Hosting | GitHub Pages, deployed by a GitHub Actions workflow |

## Project layout (your two original files stay untouched)
```
heartDiseaseML/
├─ HeartDiseaseML.py, heart_2020_cleaned.csv   originals (the CSV is never sent to the browser)
├─ analysis/requirements.txt, export_results.py, export_explainers.py
├─ (mockups/ removed once the designs were picked; they're in git history before this change)
├─ site/                       Vite app
│  ├─ index.html               all chapter copy and markup
│  ├─ public/data/*.json       written by the export script
│  └─ src/main.js, styles/, scroll/story.js, three/{scene,heart,formations}.js, charts/*.js
├─ .github/workflows/deploy.yml, .claude/launch.json, .gitignore, README.md, PLAN.md
```

## Data pipeline: `analysis/export_results.py`
**What it keeps from your notebook**
- The same preprocessing (lines 19–45).
- The same models:
  - Logistic regression, random forest and KNN on the top 1, 6, 15 and 22 features (lines 170–249)
  - AdaBoost (251–261)
  - SMOTEENN logistic regression and KNN (272–284)
  - The three MLP pipelines (300–326)
  - The accuracy-vs-top-k loop (101–118)
  - Random-forest feature importances before and after resampling (74–90, 505–525)
- `evaluate_model()` (130–162) becomes the core. It's extended to also return PR-AUC and roughly 100-point ROC and PR curves. It calls `predict_proba` only once per model, because KNN prediction is the slow step.

**What it fixes**
- Reads the CSV from a relative path and drops `display()`.
- Splits with `train_test_split(X, y, test_size=0.25, stratify=y, random_state=42)`.
- Runs random forests on all CPU cores with `n_jobs=-1`. The results don't change.

**What it adds**
- **Baseline:** `DummyClassifier(strategy="most_frequent")`, the "always No" model.
- **Balancing comparison on logistic regression** (fast, so the comparison is apples to apples): none, class weights, random undersampling, SMOTE and SMOTEENN. Random forest also gets class weights and SMOTEENN.
  - Only the training rows are ever resampled; the test set stays exactly as collected.
  - If SMOTEENN is too slow on the full training set, every method falls back to your notebook's 50% sample, so the comparison stays fair.
- **Threshold tuning:** the cut-off that maximizes F1 is chosen from 5-fold cross-validated *training* predictions, then applied once to the test set. The test set never influences the choice.
- **SMOTE illustration:** a sample of about 1,500 points, projected to 2D with PCA, goes through SMOTE and then ENN. Each point is tagged as original, synthetic or removed. SMOTE adds its synthetic rows after the originals, and ENN reports which rows it kept (`sample_indices_`), so the tags are exact.

**Outputs** go to `site/public/data/`, under 500 KB in total:
| File | Contents |
|---|---|
| `dataset.json` | Class counts, a feature dictionary (group, type, encoding), and each feature's distribution and heart-disease rate per category |
| `naive.json` | Accuracy vs. number of top features, RF importances, baseline accuracy |
| `models.json` | Per model: family, features used, balancing method, accuracy, precision, recall, F1, Cohen's κ, ROC-AUC, PR-AUC, confusion matrix, ROC and PR curves |
| `resampling.json` | Class counts before and after each method, the tagged SMOTE/ENN points, RF importances after SMOTEENN |
| `threshold.json` | For the best balanced model: metrics and confusion matrix at every threshold from 0.00 to 1.00, probability histograms per true class, the chosen threshold |
| `meta.json` | Seed, split sizes, library versions, run date |

**Built-in checks and runtime**
- The script asserts that:
  - the classes total 292,422 No and 27,373 Yes
  - every confusion matrix sums to 79,949 test rows
  - the dummy model's accuracy is about 0.914
  - every metric falls between 0 and 1
- Fitted results are cached with joblib in `analysis/.cache/`.
- The first run takes about 20–30 minutes; re-exports after format tweaks take seconds. It can run in the background while the mockups are built.

## Storyboard (the order you asked for)
The heart column describes the particle concept. With the anatomical or glass heart, the same moments come from movement, rotation, color and a 91/9 "split" effect.

| # | Chapter | Story beat | Heart (3D) | D3 / interaction |
|---|---|---|---|---|
| 0 | Hero | "Can a health survey predict heart disease?" | Dots swirl into a beating heart; on desktop you can drag to rotate it | — |
| 1 | The topic | Why heart disease matters (a cited CDC stat) and the question you set out to answer | The heart drifts aside and slows | The stat counts up |
| 2 | The data | 319,795 adults from CDC BRFSS 2020 via Kaggle; 17 features in 4 groups; encoding turns them into 22 inputs | The heart dissolves into a cloud: "each dot ≈ 10 people" | Feature cards; heart-disease rate by age, general health, stroke and difficulty walking; one raw row morphing into its encoded form |
| 3 | First attempt | Logistic regression, random forest, KNN, AdaBoost and MLP all score about 91% accuracy. Done? | The dots snap back into a glowing heart | Accuracy counters; accuracy vs. number of top features (your loop) |
| 4 | The twist | 91.4% answered No. Always saying No also scores 91.4% (with κ = 0). The models barely beat doing nothing and caught only *N* of every 100 sick people: recall, shown before it's named. Why: models minimize total errors, so the majority class wins | The dots fall into a 91.4 / 8.6 waffle; the red dots the model missed fade to grey | Class waffle; a 91.4% baseline drawn across the chapter-3 accuracy chart; a confusion matrix with one dot per person; probability histogram by true class |
| 5 | Making it even | Undersampling; SMOTE (synthetic points between real neighbors); ENN cleanup; SMOTEENN; class weights. Only the training set is resampled | Red dots multiply along lines between neighbors and grey dots thin out, until the split is about 50/50 | 2D PCA scatter where real SMOTE points appear along neighbor lines and ENN removals fade out; before/after class counts per method |
| 6 | Scoring | The confusion matrix's four cells, then accuracy, precision, recall, F1, ROC-AUC, PR-AUC and κ. Why recall, F1 and PR-AUC fit screening while accuracy misleads here (and when accuracy is fine) | The dots form a 2×2 confusion grid; quadrants light up as each formula appears | Formula cards that highlight matrix cells; **a threshold slider that updates the matrix and every metric live** |
| 7 | Results | All models compared. Sorted by accuracy, the "always No" baseline wins. Sorted by recall or F1, the balanced models win | The heart re-forms with far more red dots lit up (cases caught) | **A sortable leaderboard where rows animate as they reorder**; slope chart showing accuracy down a little and recall up a lot; ROC and PR curves; feature importance before vs. after |
| 8 | Takeaways | Lessons, plus next steps: gradient boosting, calibration, cross-validation, cost-based thresholds, the 2022 survey | A calm heartbeat | — |
| 9 | About | Bio, links, data attribution, methodology, and a note that this is not a diagnostic tool | — | — |

## Motion and interaction rules
- **Layout:** one fixed, full-screen 3D canvas sits behind the page and the text scrolls over it. Scenes with several steps stay pinned in place while you scroll through them.
- **Scroll-driven:** every heart and chart state follows scroll position, so scrolling back plays everything in reverse. Charts are only built when they get close to the viewport.
- **Text and charts:** lines of text rise and fade in one after another, numbers count up, lines draw themselves and bars grow from the axis.
- **Hero only:** subtle mouse parallax, and drag-to-rotate on desktop.
- **Colors:** Yes (heart disease) is crimson, No is slate, synthetic points are light rose and missed cases are amber. The palette is checked with the dataviz skill's validator, and nothing relies on color alone.
- **Fallbacks:**
  - **Reduced motion:** for visitors whose system asks for less motion (`prefers-reduced-motion`), there's no scroll animation or pulsing, and every scene shows its final state.
  - **No 3D support:** a static image of the heart replaces it, and everything else still works.
  - **Phones:** about 8k dots, a capped pixel density, and charts stacked under the text.

## Mockups (built while the export runs; removed after the picks)
There are three single-file pages in `mockups/`, sharing one dark-cinematic style sheet so **the heart is the only big difference**. Each plays the same three scenes: the hero, then the topic (the heart moves aside as text appears), then the twist (91.4 / 8.6, with one D3 chart using the real counts).

| Mockup | Heart |
|---|---|
| A: particles | About 32k dots on the GPU (1 dot ≈ 10 respondents: 29,242 grey and 2,737 red). They're sampled from a mathematical 3D heart shape and morph from heart to cloud to waffle as you scroll |
| B: anatomical | A CC-licensed anatomical model in GLB format, with a lub-dub pulse and red edge lighting. It moves and rotates between scenes. A placeholder is used until the model is found, and the final file is compressed to 3 MB or less |
| C: glass | The same heart shape as a solid mesh, with a glass material and a low-poly/wireframe toggle. It "splits" 91/9 by color |

- A small panel in each mockup switches between 3 accent colors (crimson, ember, rose) and 2 font pairings, so color and type get settled without extra mockups.
- three, d3 and GSAP load straight from the jsDelivr CDN, so there's no build step. A tiny static server serves them for viewing in the app's browser pane. Private Artifact links are optional if you want to share them for feedback.
- The direction you pick (or a mix) becomes `site/src/styles/tokens.css` and the heart module for the real build.

---

## To-do: you (direct, own the story, check the numbers)
**Before and during the mockups**
- [x] Approve installing `imbalanced-learn` when prompted.
- [ ] Confirm the preprocessing is what you meant. For example, both "No, borderline diabetes" and "Yes (during pregnancy)" are coded as 0 (no diabetes).
- [x] ~~Anatomical model for mockup B~~ (not needed: A was picked): approve one the AI finds that downloads without an account, or download one yourself (for example from Sketchfab, which needs a free account). It must be CC0 or CC-BY; note the author and license.
- [ ] Check the model summary table against your Colab results (expect small shifts) and flag anything surprising.
- [x] Review mockups A, B and C on desktop and on your phone. Pick a heart, accent color and font pairing (mixing is fine) and leave notes. **Picked 2026-10-07: A (particle heart), crimson, Space Grotesk + Inter.**

**Content** (the AI drafts first, you rewrite in your own voice)
- [ ] A headline heart-disease stat with a CDC citation (the AI can suggest sourced options).
- [ ] Why you chose this project, the CS-375 context, and any teammates to credit.
- [ ] Your takeaways and what you'd do next.
- [ ] Bio, an optional headshot, and links: GitHub, LinkedIn, resume, and the Colab notebook if you want it public.

**Model animations** (requested 2026-10-10: go deeper on how each model works)
- [x] Pick from 14 animation mockups. **Picked 2026-10-11: K3 (3D sphere of neighbors), T2 (falling through a real tree), L1 (weighing the evidence), A1 (mistakes get heavier), N1 (signal flow).**
- [ ] Rewrite the "Inside the models" card copy in your own voice.

**Review and ship**
- [ ] Check that each chart says what you'd say about it in an interview.
- [ ] Scroll through on your phone, and have 1–2 friends try it and note where they get lost.
- [ ] Create the GitHub repo and enable Pages (Settings → Pages → Source: GitHub Actions).
- [ ] Final proofread, then add the live link to your resume and LinkedIn.
- [ ] Ask for a walkthrough of any part you'd want to explain in an interview.

## To-do: AI (build)
**Phase 0: Setup**
- [x] Copy this plan into the repo as `PLAN.md` so both lists can be checked off there.
- [x] Run `git init` and add `.gitignore` (node_modules, dist, .venv, `__pycache__`, `analysis/.cache`), the folders, and `.claude/launch.json` (servers for the mockups and the site).
- [x] Add `analysis/requirements.txt` and install `imbalanced-learn` once you approve.

**Phase 1: Data export**
- [x] Write `export_results.py`: the port, the fixes, the additions, the JSON output, the checks and the cache.
- [x] Run it in the background and give you one summary table of every model's metrics.

**Phase 2: Mockups**
- [x] The shared dark-cinematic style sheet and common scene code: scrolling, text reveals, the twist chart.
- [x] Mockups A, B and C.
- [x] One revision round on the direction you choose, then lock the design tokens.

**Phase 3: Site foundation**
- [x] Set up the Vite app in `site/` and add three, d3, gsap and lenis.
- [x] Markup for chapters 0–9 with draft copy, plus the design tokens and base styles.
- [x] `scroll/story.js`: smooth scrolling, one timeline per chapter, pinned scenes, and the reduced-motion version.
- [x] `three/`: the scene, the chosen heart, its state in each chapter (dot formations if it's the particle heart), and the phone and no-3D fallbacks.

**Phase 4: Charts** (one module per chart, each with `init(el, data)` and `step(n)`)
- [x] Chapter 2: feature cards, rate-by-category charts, the encoding animation.
- [x] Chapter 3: accuracy counters and the accuracy-vs-features line.
- [x] Chapter 4: class waffle, baseline line, one-dot-per-person confusion matrix, probability histogram.
- [x] Chapter 5: SMOTE/ENN scatter and before/after class bars.
- [x] Chapter 6: metric formula cards and the threshold slider.
- [x] Chapter 7: sortable leaderboard, slope chart, ROC/PR curves, importance before vs. after.

**Phase 5: Polish**
- [x] Text reveals, chapter transitions, and a loading screen that preloads the data and 3D model.
- [x] Responsive pass (375 px phones up to wide screens).
- [x] Accessibility pass: screen-reader labels, data-table versions of charts, contrast, keyboard control for the slider and sorting.
- [ ] Performance pass: smooth 60 fps scrolling and good Lighthouse scores. *(Bundle split into cached chunks; Lighthouse not run yet.)*
- [ ] *Optional extras:* permutation importance (the default importance favors continuous features like BMI), a fairness check of recall by sex, race and age, and HistGradientBoosting.

**Phase 5b: Model explainer animations** (mockups first, then rebuild)
- [x] `analysis/export_explainers.py` → `site/public/data/explainers.json` (133 KB: the 3D sample with SMOTEENN rows, a real depth-3 tree, logistic-regression and MLP weights, three example patients).
- [x] 14 mockup concepts built; the user picked 5.
- [x] Chapter 07 "Inside the models" in `site/index.html`, one scroll-driven explainer per model in `site/src/explainers/` (own chunk, ~14 KB gzipped, loaded after the charts): logistic regression, decision tree / forest, KNN in 3D, AdaBoost, neural net. Chapters renumbered to 10.
- [x] Removed the mockups, the unused export pieces (decision maps, age × health sample) and dead CSS/exports.
- [x] Fixed the grey 3D background (scene.background instead of setClearColor).

**Phase 6: Ship**
- [ ] A GitHub Actions workflow for Pages (with Vite's `base` set to the repo name).
- [ ] A README with the story summary, how to reproduce the results, and data attribution.
- [ ] Deploy and check the live site.

## Verification
- **Export:** all checks pass, a few models are spot-checked against your Colab numbers, and `site/public/data` stays under 500 KB.
- **Site in the browser pane:**
  - Scroll top to bottom and back up with no console errors.
  - Check the phone layout at 375×812, the reduced-motion version, and the no-3D fallback.
- **Production build:** run `npm run build` then `npm run preview`. Lighthouse targets: performance 80+ on desktop, accessibility 95+.
- **Live site:** every JSON file and the 3D model load (no 404s from the base path) on desktop and on a phone.
