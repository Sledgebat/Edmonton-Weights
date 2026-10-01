# xG model report

Trained 2026-10-01T16:26:01.082Z on Unblocked shot attempts from 20242025, 20252026 (regular season and playoffs).

- Training shots: 237,173 (15,879 goals)
- League goal rate on unblocked attempts: 6.70%

## Held-out test: 20252026

Model fitted on the other seasons, scored on 20252026 only.

| Measure | Value | Meaning |
| --- | --- | --- |
| Log loss | 0.2209 | Lower is better |
| Log loss, no model | 0.2479 | Every shot given the league rate |
| Improvement | 10.9% | Public models typically land around 10–20% |
| AUC | 0.754 | 0.5 = coin flip; public models are usually 0.75–0.80 |
| Goals vs xG | 8019 vs 8387.6 | Should be close |

### Calibration (ten equal groups of shots)

| Predicted | Actual | Shots |
| --- | --- | --- |
| 0.3% | 0.4% | 11,825 |
| 1.1% | 1.3% | 11,825 |
| 2.1% | 1.9% | 11,825 |
| 3.2% | 3.0% | 11,825 |
| 4.6% | 4.1% | 11,825 |
| 6.1% | 5.8% | 11,825 |
| 7.8% | 8.0% | 11,825 |
| 10.0% | 10.4% | 11,825 |
| 13.3% | 13.3% | 11,825 |
| 22.3% | 19.6% | 11,826 |

## Coefficients

| Feature | Coefficient |
| --- | --- |
| intercept | 2.565 |
| distance | 0.630 |
| logDistance | -1.302 |
| angle | 0.157 |
| angleSq | -0.031 |
| distanceXAngle | -0.056 |
| type:snap | 0.298 |
| type:slap | 0.420 |
| type:backhand | -0.413 |
| type:tip-in | -0.919 |
| type:deflected | -0.502 |
| type:wrap-around | -1.207 |
| type:bat | -0.367 |
| type:poke | -0.313 |
| type:other | -0.780 |
| rebound | 0.546 |
| rush | -0.776 |
| strength:PP | 0.250 |
| strength:SH | 0.211 |
| strength:EV | 0.198 |
| last:faceoff | -1.397 |
| last:shot | -1.249 |
| last:takeaway | -1.165 |
| last:giveaway | -1.219 |
| last:hit | -1.374 |
| secondsSinceLast | -0.164 |
| distanceSq | -0.098 |
| under10ft | -0.354 |
| behindNet | -0.628 |
| reboundXDistance | -0.048 |
| within2s | -1.187 |
| extraAttacker | -0.019 |

Empty net: logit = 1.646 + -0.159 × distance/10
