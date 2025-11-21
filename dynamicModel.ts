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
// Matrix Utility Functions (for BLUP calculation)
// ============================================================================

type Matrix = number[][];
type Vector = number[];

/**
 * Create an n×n identity matrix
 */
function eye(n: number): Matrix {
  const result: Matrix = [];
  for (let i = 0; i < n; i++) {
    result[i] = [];
    for (let j = 0; j < n; j++) {
      result[i][j] = i === j ? 1 : 0;
    }
  }
  return result;
}

/**
 * Multiply a scalar by a matrix
 */
function scalarMultiply(scalar: number, A: Matrix): Matrix {
  return A.map(row => row.map(val => scalar * val));
}

/**
 * Add two matrices element-wise
 */
function matrixAdd(A: Matrix, B: Matrix): Matrix {
  return A.map((row, i) => row.map((val, j) => val + B[i][j]));
}

/**
 * Transpose a matrix
 */
function transpose(A: Matrix): Matrix {
  const rows = A.length;
  const cols = A[0].length;
  const result: Matrix = [];
  for (let j = 0; j < cols; j++) {
    result[j] = [];
    for (let i = 0; i < rows; i++) {
      result[j][i] = A[i][j];
    }
  }
  return result;
}

/**
 * Multiply two matrices A (m×n) × B (n×p) = C (m×p)
 */
function matrixMultiply(A: Matrix, B: Matrix): Matrix {
  const m = A.length;
  const n = A[0].length;
  const p = B[0].length;

  const result: Matrix = [];
  for (let i = 0; i < m; i++) {
    result[i] = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/**
 * Multiply matrix A (m×n) by vector v (n×1) = result (m×1)
 */
function matrixVectorMultiply(A: Matrix, v: Vector): Vector {
  return A.map(row => row.reduce((sum, val, j) => sum + val * v[j], 0));
}

/**
 * Invert a matrix using Gaussian elimination with partial pivoting
 * Works for any n×n matrix
 */
function matrixInverse(A: Matrix): Matrix {
  const n = A.length;

  // Create augmented matrix [A | I]
  const aug: Matrix = [];
  for (let i = 0; i < n; i++) {
    aug[i] = [...A[i]];
    for (let j = 0; j < n; j++) {
      aug[i].push(i === j ? 1 : 0);
    }
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Check for singular matrix
    if (Math.abs(aug[col][col]) < 1e-12) {
      throw new Error('Matrix is singular or nearly singular');
    }

    // Scale pivot row
    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  // Extract inverse from augmented matrix
  const inverse: Matrix = [];
  for (let i = 0; i < n; i++) {
    inverse[i] = aug[i].slice(n);
  }

  return inverse;
}

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
  const re = model.lme_model.random_effects;
  const sigma2 = model.lme_model.residual_variance;
  const timeStd = model.lme_model.time_standardization;

  // Standardize time for all observations
  const n = preLandmark.length;
  const days = preLandmark.map(obs => obs.day);
  const log2easixVals = preLandmark.map(obs => obs.log2easix);
  const tStd = days.map(d => standardizeTime(d));

  // Step 1: Compute expected values from fixed effects (Xβ)
  // Fixed effects: intercept + time_slope * t + dri_coefficient * dri
  const expectedVals = tStd.map(t =>
    fe.intercept + fe.time_slope * t + fe.dri_coefficient * dri
  );

  // Step 2: Compute residuals from fixed effects (y - Xβ)
  const residuals: Vector = log2easixVals.map((y, i) => y - expectedVals[i]);

  // Step 3: Build the random effects design matrix Z (n × 2)
  // Each row is [1, standardized_time] for random intercept + slope
  const Z: Matrix = tStd.map(t => [1, t]);
  const Zt = transpose(Z);  // Z' is (2 × n)

  // Step 4: Build the random effects covariance matrix G (2 × 2)
  // G = [var_intercept,  cov_intercept_slope]
  //     [cov_intercept_slope, var_slope     ]
  const G: Matrix = [
    [re.variance_intercept, re.covariance_intercept_slope],
    [re.covariance_intercept_slope, re.variance_slope]
  ];

  // Step 5: Build the marginal variance matrix V = Z*G*Z' + σ²*I (n × n)
  // V_ij = Z_i * G * Z_j' + σ² * δ_ij
  const ZG = matrixMultiply(Z, G);       // n × 2
  const ZGZt = matrixMultiply(ZG, Zt);   // n × n
  const sigma2I = scalarMultiply(sigma2, eye(n));  // n × n
  const V = matrixAdd(ZGZt, sigma2I);    // n × n

  // Step 6: Compute BLUP of random effects
  // b̂ = G * Z' * V⁻¹ * (y - Xβ)
  const Vinv = matrixInverse(V);         // n × n
  const GZt = matrixMultiply(G, Zt);     // 2 × n
  const GZtVinv = matrixMultiply(GZt, Vinv);  // 2 × n
  const b_hat = matrixVectorMultiply(GZtVinv, residuals);  // 2 × 1 vector

  const b0 = b_hat[0];  // Random intercept
  const b1 = b_hat[1];  // Random slope (on standardized time scale)

  // Step 7: Predict log2EASIX at landmark
  const landmarkStd = standardizeTime(landmarkTime);
  const log2easix_at_landmark =
    fe.intercept + fe.time_slope * landmarkStd + fe.dri_coefficient * dri +
    b0 + b1 * landmarkStd;

  // Step 8: Compute slope on STANDARDIZED time scale
  // The Cox model was trained with slopes on the standardized scale
  // Total slope = fixed effect slope + random slope (both on standardized scale)
  const slope_at_landmark = fe.time_slope + b1;

  // Step 9: Compute linear predictor for Cox model
  const cox = model.cox_model.coefficients;
  const linear_predictor =
    cox.dri * dri +
    cox.log2easix_at_landmark * log2easix_at_landmark +
    cox.slope_at_landmark * slope_at_landmark;

  // Step 10: Get baseline cumulative hazard at prediction horizon
  const H0_target = interpolateBaselineHazard(predictionHorizon);

  // Step 11: Calculate survival probability
  // S(t|xL) = exp(-H₀(t) × exp(LP))
  const survival_2yr = Math.exp(-H0_target * Math.exp(linear_predictor));

  // Step 12: Calculate event rate
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
    const { default: validationData } = await import('./validation_test_cases.json');
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
