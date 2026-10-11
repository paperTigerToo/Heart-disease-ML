// data-chart name in index.html -> chart factory. Loaded as its own chunk after the heart appears.
import { accuracyChart } from "./accuracy.js";
import { classSplitChart } from "./classSplit.js";
import { featuresChart, ratesChart, encodingChart } from "./dataCharts.js";
import { accuracyFeaturesChart, missedChart, probabilitiesChart } from "./twistCharts.js";
import { smoteChart, balanceCompareChart } from "./balanceCharts.js";
import { thresholdChart } from "./threshold.js";
import { leaderboardChart, tradeoffChart, curvesChart, importanceChart } from "./resultsCharts.js";

export const CHARTS = {
  features: featuresChart,
  rates: ratesChart,
  encoding: encodingChart,
  "accuracy-first": (el, ctx) => accuracyChart(el, ctx),
  "accuracy-vs-features": accuracyFeaturesChart,
  "class-split": classSplitChart,
  "accuracy-baseline": (el, ctx) => accuracyChart(el, ctx, { baseline: true }),
  missed: missedChart,
  probabilities: probabilitiesChart,
  smote: (el, ctx) => smoteChart(el, ctx, { mode: "smote" }),
  "smote-enn": (el, ctx) => smoteChart(el, ctx, { mode: "enn" }),
  "balance-compare": balanceCompareChart,
  threshold: thresholdChart,
  leaderboard: leaderboardChart,
  tradeoff: tradeoffChart,
  curves: curvesChart,
  importance: importanceChart,
};

