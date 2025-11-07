// Dynamic EASIX-DRI Model - Prediction Engine
// Implements client-side predictions using LME landmark model with random slopes

import modelCoefficients from './model_coefficients.json';

// ============================================================================
// TypeScript Type Definitions
// ============================================================================

export interface BaselineHazardPoint {
  time: number;
  hazard: number;
}

export interface LMEFixedEffects {
  intercept: number;
  time_slope: number;
  dri_coefficient: number;
}

export interface LMERandomEffects {
  variance_intercept: number;
  variance_slope: number;
  covariance_intercept_slope: number;
  correlation: number;
}

export interface TimeStandardization {
  enabled: boolean;
  mean?: number;
  sd?: number;
}

export interface CoxCoefficients {
  dri: number;
  log2easix_at_landmark: number;
  slope_at_landmark: number;
}

export interface ModelParameters {
  metadata: {
    model_version: string;
    created_date: string;
    landmark_time_days: number;
    prediction_horizon_days: number;
    description: string;
  };
  lme_model: {
    fixed_effects: LMEFixedEffects;
    random_effects: LMERandomEffects;
    residual_variance: number;
    time_standardization: TimeStandardization;
  };
  cox_model: {
    coefficients: CoxCoefficients;
    baseline_hazard: BaselineHazardPoint[];
  };
  configuration: {
    landmark_time: number;
    prediction_horizon: number;
    has_random_slopes: boolean;
    time_standardization: boolean;
  };
}

export interface PatientObservation {
  day: number;
  log2easix: number;
}

export interface PredictionResult {
  log2easix_at_landmark: number;
  slope_at_landmark: number;
  linear_predictor: number;
  survival_2yr: number;
  event_rate_2yr_percent: number;
}

// Load model parameters (typed)
const model = modelCoefficients as ModelParameters;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Standardize time variable using model parameters
 */
function standardizeTime(day: number): number {
  const { mean, sd } = model.lme_model.time_standardization;
  if (!mean || !sd) {
    throw new Error('Time standardization parameters not available');
  }
  return (day - mean) / sd;
}

/**
 * Perform simple linear regression (OLS)
 * Returns { intercept, slope }
 */
function simpleLinearRegression(x: number[], y: number[]): { intercept: number; slope: number } {
  const n = x.length;
  if (n < 2) {
    throw new Error('Need at least 2 observations for regression');
  }

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const meanX = sumX / n;
  const meanY = sumY / n;

  const slope = (sumXY - n * meanX * meanY) / (sumX2 - n * meanX * meanX);
  const intercept = meanY - slope * meanX;

  return { intercept, slope };
}

/**
 * Interpolate baseline cumulative hazard at target time
 */
function interpolateBaselineHazard(targetTime: number): number {
  const hazardPoints = model.cox_model.baseline_hazard;

  // If target time is before first point, use first hazard
  if (targetTime <= hazardPoints[0].time) {
    return hazardPoints[0].hazard;
  }

  // If target time is after last point, use last hazard (conservative)
  if (targetTime >= hazardPoints[hazardPoints.length - 1].time) {
    return hazardPoints[hazardPoints.length - 1].hazard;
  }

  // Find bracketing points
  let i = 0;
  while (i < hazardPoints.length - 1 && hazardPoints[i + 1].time < targetTime) {
    i++;
  }

  const t1 = hazardPoints[i].time;
  const t2 = hazardPoints[i + 1].time;
  const h1 = hazardPoints[i].hazard;
  const h2 = hazardPoints[i + 1].hazard;

  // Linear interpolation
  return h1 + (h2 - h1) * (targetTime - t1) / (t2 - t1);
}

// ============================================================================
// Main Prediction Function
// ============================================================================

/**
 * Predict 2-year event rate for a patient
 *
 * @param observations - Patient's longitudinal EASIX measurements (day ≤ 120)
 * @param dri - DRI status (0 = low/intermediate, 1 = high/very-high)
 * @returns Prediction results including event rate
 */
export function predictDynamicEASIX(
  observations: PatientObservation[],
  dri: number
): PredictionResult {
  const landmarkTime = model.metadata.landmark_time_days;
  const predictionHorizon = model.metadata.prediction_horizon_days;

  // Filter to pre-landmark observations with valid log2easix
  const preLandmark = observations.filter(
    obs => obs.day <= landmarkTime && !isNaN(obs.log2easix) && isFinite(obs.log2easix)
  );

  if (preLandmark.length < 2) {
    throw new Error('Need at least 2 observations before landmark (day 120) to make prediction');
  }

  // Extract model parameters
  const fe = model.lme_model.fixed_effects;
  const timeStd = model.lme_model.time_standardization;

  // Standardize time for all observations
  const days = preLandmark.map(obs => obs.day);
  const log2easixVals = preLandmark.map(obs => obs.log2easix);
  const tStd = days.map(d => standardizeTime(d));

  // Step 1: Compute expected values from fixed effects
  const expectedVals = tStd.map((t, i) =>
    fe.intercept + fe.time_slope * t + fe.dri_coefficient * dri
  );

  // Step 2: Compute residuals from fixed effects
  const residuals = log2easixVals.map((y, i) => y - expectedVals[i]);

  // Step 3: Fit OLS to residuals to get empirical estimates
  const { intercept: b0_ols, slope: b1_ols } = simpleLinearRegression(tStd, residuals);

  // Step 4: Apply empirical Bayes shrinkage
  // BLUP shrinks OLS estimates toward 0 using variance components
  // Shrinkage factor = signal variance / (signal variance + noise variance / n)
  const n = preLandmark.length;
  const re = model.lme_model.random_effects;
  const sigma2 = model.lme_model.residual_variance;

  // For intercept: shrinkage based on ratio of variances
  const var_intercept = re.variance_intercept;
  const shrink_intercept = var_intercept / (var_intercept + sigma2 / n);
  const b0 = b0_ols * shrink_intercept;

  // For slope: shrinkage based on ratio of variances
  const var_slope = re.variance_slope;
  // Adjust for variance of standardized time predictor
  const var_tStd = tStd.reduce((sum, t) => sum + t * t, 0) / n;
  const shrink_slope = var_slope / (var_slope + sigma2 / (n * var_tStd));
  const b1 = b1_ols * shrink_slope;

  // Step 5: Predict log2EASIX at landmark
  const landmarkStd = standardizeTime(landmarkTime);
  const log2easix_at_landmark =
    fe.intercept + fe.time_slope * landmarkStd + fe.dri_coefficient * dri +
    b0 + b1 * landmarkStd;

  // Step 6: Compute slope on original time scale
  // slope_at_landmark = (β_time + b_time) / sd_time
  const slope_at_landmark = (fe.time_slope + b1) / timeStd.sd!;

  // Step 7: Compute linear predictor for Cox model
  const cox = model.cox_model.coefficients;
  const linear_predictor =
    cox.dri * dri +
    cox.log2easix_at_landmark * log2easix_at_landmark +
    cox.slope_at_landmark * slope_at_landmark;

  // Step 8: Get baseline cumulative hazard at prediction horizon
  const H0_target = interpolateBaselineHazard(predictionHorizon);

  // Step 9: Calculate survival probability
  // S(t|xL) = exp(-H₀(t) × exp(LP))
  const survival_2yr = Math.exp(-H0_target * Math.exp(linear_predictor));

  // Step 10: Calculate event rate
  const event_rate_2yr_percent = (1 - survival_2yr) * 100;

  return {
    log2easix_at_landmark,
    slope_at_landmark,
    linear_predictor,
    survival_2yr,
    event_rate_2yr_percent
  };
}

// ============================================================================
// Classification Function (for backwards compatibility if needed)
// ============================================================================

/**
 * Classify risk based on event rate thresholds
 * This is optional - the app should display the actual event rate percentage
 */
export function classifyRisk(eventRatePercent: number): 'Low' | 'Moderate' | 'High' {
  if (eventRatePercent < 20) return 'Low';
  if (eventRatePercent < 40) return 'Moderate';
  return 'High';
}

// ============================================================================
// Validation Testing Function
// ============================================================================

/**
 * Test prediction engine against R validation cases
 * For development/testing only
 */
export async function validatePredictionEngine(): Promise<void> {
  try {
    const validationData = await import('./validation_test_cases.json');
    const cases = validationData.validation_cases;

    console.log('='.repeat(60));
    console.log('Validating JavaScript Prediction Engine');
    console.log('='.repeat(60));

    let allPassed = true;

    for (let i = 0; i < cases.length; i++) {
      const testCase = cases[i];
      console.log(`\nTest Case ${i + 1}: Patient ${testCase.patient_id}`);
      console.log(`DRI: ${testCase.dri}`);

      const observations: PatientObservation[] = testCase.observations;
      const expected = testCase.expected_predictions;

      const result = predictDynamicEASIX(observations, testCase.dri);

      // Compare with R predictions
      // Use different tolerances for different metrics (clinically meaningful thresholds)
      const checks = [
        { name: 'log2EASIX at landmark', js: result.log2easix_at_landmark, r: expected.log2easix_at_landmark, tol: 0.05 },
        { name: 'Slope at landmark', js: result.slope_at_landmark, r: expected.slope_at_landmark, tol: 0.001 },
        { name: 'Linear predictor', js: result.linear_predictor, r: expected.linear_predictor, tol: 0.05 },
        { name: '2-year survival', js: result.survival_2yr, r: expected.survival_2yr, tol: 0.005 },
        { name: 'Event rate %', js: result.event_rate_2yr_percent, r: expected.event_rate_2yr_percent, tol: 0.5 }
      ];

      let casePassed = true;
      for (const check of checks) {
        const diff = Math.abs(check.js - check.r);
        const passed = diff < check.tol;
        const status = passed ? '✓' : '✗';
        console.log(`  ${status} ${check.name}: JS=${check.js.toFixed(6)}, R=${check.r.toFixed(6)}, diff=${diff.toExponential(2)} (tol=${check.tol})`);
        if (!passed) {
          casePassed = false;
          allPassed = false;
        }
      }

      if (casePassed) {
        console.log(`  ✓ Test case ${i + 1} PASSED`);
      } else {
        console.log(`  ✗ Test case ${i + 1} FAILED`);
      }
    }

    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✓✓✓ All validation tests PASSED!');
    } else {
      console.log('✗✗✗ Some validation tests FAILED');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error during validation:', error);
  }
}
