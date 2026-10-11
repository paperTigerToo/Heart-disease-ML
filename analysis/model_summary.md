# Model summary

Test set: 79,949 rows (6,843 with heart disease). Seed 42. Generated 2026-10-11T21:04:54+00:00.

| Model | Balancing | Train rows | Acc | Prec | Recall | F1 | κ | ROC-AUC | PR-AUC | Caught (TP/all sick) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Logistic regression, threshold 0.18 | threshold | 239,846 | 0.865 | 0.320 | 0.513 | 0.394 | 0.323 | 0.838 | 0.346 | 3,508/6,843 |
| Logistic regression + class weights | class weights | 119,923 | 0.749 | 0.223 | 0.779 | 0.347 | 0.247 | 0.838 | 0.345 | 5,329/6,843 |
| Logistic regression + undersampling | undersampling | 20,530 | 0.749 | 0.223 | 0.777 | 0.346 | 0.246 | 0.839 | 0.345 | 5,319/6,843 |
| Random forest + SMOTEENN | SMOTEENN | 180,477 | 0.799 | 0.238 | 0.610 | 0.342 | 0.250 | 0.802 | 0.241 | 4,175/6,843 |
| Logistic regression + SMOTE | SMOTE | 219,316 | 0.753 | 0.215 | 0.710 | 0.330 | 0.229 | 0.811 | 0.288 | 4,860/6,843 |
| Logistic regression + SMOTEENN | SMOTEENN | 180,477 | 0.704 | 0.198 | 0.809 | 0.319 | 0.210 | 0.827 | 0.318 | 5,534/6,843 |
| Neural net (80, 40) + SMOTEENN | SMOTEENN | 180,477 | 0.720 | 0.199 | 0.751 | 0.315 | 0.208 | 0.802 | 0.290 | 5,141/6,843 |
| KNN + SMOTEENN | SMOTEENN | 180,477 | 0.721 | 0.192 | 0.705 | 0.302 | 0.193 | 0.753 | 0.188 | 4,825/6,843 |
| Logistic regression (22) | none | 239,846 | 0.916 | 0.546 | 0.111 | 0.184 | 0.160 | 0.838 | 0.346 | 756/6,843 |
| Logistic regression (15) | none | 239,846 | 0.916 | 0.542 | 0.108 | 0.180 | 0.157 | 0.838 | 0.344 | 741/6,843 |
| Logistic regression | none | 119,923 | 0.916 | 0.545 | 0.108 | 0.180 | 0.156 | 0.838 | 0.345 | 738/6,843 |
| Random forest (15) | none | 239,846 | 0.903 | 0.317 | 0.117 | 0.171 | 0.131 | 0.778 | 0.236 | 801/6,843 |
| Random forest (22) | none | 239,846 | 0.905 | 0.329 | 0.111 | 0.166 | 0.128 | 0.783 | 0.245 | 757/6,843 |
| KNN (15) | none | 239,846 | 0.906 | 0.347 | 0.108 | 0.165 | 0.129 | 0.700 | 0.186 | 738/6,843 |
| Neural net (100) | none | 239,846 | 0.916 | 0.548 | 0.097 | 0.165 | 0.142 | 0.839 | 0.341 | 662/6,843 |
| AdaBoost | none | 239,846 | 0.916 | 0.570 | 0.094 | 0.162 | 0.141 | 0.838 | 0.343 | 644/6,843 |
| Random forest (6) | none | 239,846 | 0.893 | 0.245 | 0.120 | 0.161 | 0.111 | 0.719 | 0.183 | 821/6,843 |
| KNN (22) | none | 239,846 | 0.906 | 0.340 | 0.104 | 0.160 | 0.124 | 0.700 | 0.186 | 714/6,843 |
| KNN (6) | none | 239,846 | 0.903 | 0.293 | 0.092 | 0.140 | 0.103 | 0.677 | 0.161 | 630/6,843 |
| Random forest + class weights | class weights | 119,923 | 0.906 | 0.319 | 0.089 | 0.139 | 0.106 | 0.787 | 0.242 | 609/6,843 |
| Neural net (50, 25) | none | 239,846 | 0.916 | 0.559 | 0.077 | 0.135 | 0.117 | 0.838 | 0.338 | 525/6,843 |
| Logistic regression (6) | none | 239,846 | 0.914 | 0.452 | 0.038 | 0.071 | 0.058 | 0.812 | 0.278 | 263/6,843 |
| KNN (1) | none | 239,846 | 0.909 | 0.084 | 0.006 | 0.011 | -0.000 | 0.508 | 0.087 | 42/6,843 |
| Random forest (1) | none | 239,846 | 0.914 | 0.097 | 0.001 | 0.002 | 0.000 | 0.554 | 0.103 | 7/6,843 |
| Always say No | none | 239,846 | 0.914 | 0.000 | 0.000 | 0.000 | 0.000 | 0.500 | 0.086 | 0/6,843 |
| Logistic regression (1) | none | 239,846 | 0.914 | 0.000 | 0.000 | 0.000 | 0.000 | 0.555 | 0.099 | 0/6,843 |

Threshold tuning picked **0.18** (max cross-validated F1 on training data).
Top features by RF importance: BMI, AgeCategory, SleepTime, PhysicalHealth, MentalHealth, GenHealth.
