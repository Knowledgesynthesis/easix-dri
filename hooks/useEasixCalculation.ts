import { useMemo } from 'react';
import type { LabRow, DirectEntry, Point, CalculationResult, Classification } from '../types';

const EPS = 1e-9;
const DAY_RANGE = { min: 20, max: 120 };

const isNumeric = (val: string | number | null | undefined): val is string | number =>
  val !== null && val !== undefined && val !== '' && !isNaN(Number(val));

export const useEasixCalculation = (
  labRows: LabRow[],
  directEntry: DirectEntry,
  manualSlope: string
): CalculationResult => {
  return useMemo(() => {
    // 1. Process lab rows into points
    const labPoints: Point[] = labRows
      .map(row => {
        const day = parseFloat(row.day);
        const ldh = parseFloat(row.ldh);
        const cr = parseFloat(row.creatinine);
        const plt = parseFloat(row.platelets);

        if (![day, ldh, cr, plt].every(v => isNumeric(v) && v >= 0)) return null;
        
        const easix = (ldh * cr) / Math.max(plt, EPS);
        if (easix <= 0) return null;
        
        const log2Easix = Math.log(easix) / Math.log(2);
        
        return { day, easix, log2Easix, source: 'lab' as const };
      })
      // FIX: The type predicate `p is Point` was invalid because TypeScript inferred a more specific type for `p` from the preceding `map` operation.
      // Explicitly annotating `p` with `Point | null` allows the type of `p` to be treated as a supertype, making the predicate valid for narrowing.
      .filter((p: Point | null): p is Point => p !== null && p.day >= DAY_RANGE.min && p.day <= DAY_RANGE.max && isFinite(p.log2Easix));
    
    // 2. Process direct entry
    let directPoint: Point | null = null;
    const directDay = parseFloat(directEntry.day);
    const directValue = parseFloat(directEntry.value);

    if (isNumeric(directDay) && directDay >= DAY_RANGE.min && directDay <= DAY_RANGE.max && isNumeric(directValue) && directValue > 0) {
      if (directEntry.type === 'easix') {
        const log2Easix = Math.log(directValue) / Math.log(2);
        if (isFinite(log2Easix)) {
            directPoint = { day: directDay, easix: directValue, log2Easix, source: 'direct' };
        }
      } else { // log2
         if (isFinite(directValue)) {
            const easix = Math.pow(2, directValue);
            directPoint = { day: directDay, easix, log2Easix: directValue, source: 'direct' };
         }
      }
    }

    // 3. Combine and sort points
    const allPoints = [...labPoints];
    if (directPoint) {
      allPoints.push(directPoint);
    }
    allPoints.sort((a, b) => a.day - b.day);

    const n = allPoints.length;
    let slope: number | null = null;
    let intercept: number | null = null;
    let predictedDay90: number | null = null;
    let predictedDay120: number | null = null;
    let classification: Classification = 'Insufficient Data';
    let classificationNote: string | null = "Need at least 2 valid points between day +20 and +120, or a manual slope.";

    const manualSlopeValue = isNumeric(manualSlope) ? parseFloat(manualSlope) : null;
    
    if (n > 0 && manualSlopeValue !== null) {
        // Calculate with manual slope
        const xBar = allPoints.reduce((sum, p) => sum + p.day, 0) / n;
        const yBar = allPoints.reduce((sum, p) => sum + p.log2Easix, 0) / n;
        slope = manualSlopeValue;
        intercept = yBar - slope * xBar;
    } else if (n >= 2) {
        // Calculate with OLS
        const { Sx, Sy, Sxx, Sxy } = allPoints.reduce(
            (acc, p) => {
                acc.Sx += p.day;
                acc.Sy += p.log2Easix;
                acc.Sxx += p.day * p.day;
                acc.Sxy += p.day * p.log2Easix;
                return acc;
            },
            { Sx: 0, Sy: 0, Sxx: 0, Sxy: 0 }
        );
        const denominator = n * Sxx - Sx * Sx;
        if (Math.abs(denominator) > EPS) {
            slope = (n * Sxy - Sx * Sy) / denominator;
            intercept = (Sy / n) - slope * (Sx / n);
        } else {
            classificationNote = "Cannot compute slope: all data points have the same day.";
        }
    }

    // Predictions and classification
    if (slope !== null && intercept !== null) {
        predictedDay90 = intercept + slope * 90;
        predictedDay120 = intercept + slope * 120;
        classification = predictedDay90 >= 2.32 ? 'High' : 'Low';
        classificationNote = `Based on predicted log₂(EASIX) at day +90 of ${predictedDay90.toFixed(3)}.`;
    } else if (n === 1) {
        // Handle single point case
        const point = allPoints[0];
        if (Math.abs(point.day - 90) <= 10) {
            predictedDay90 = point.log2Easix;
            classification = predictedDay90 >= 2.32 ? 'High' : 'Low';
            classificationNote = `Classification is based on a single data point near day +90 (at day ${point.day}). This is a significant limitation.`;
        } else {
            classificationNote = "A single data point exists, but it is not within ±10 days of day +90."
        }
    }
    
    return {
        points: allPoints,
        slope,
        intercept,
        predictedDay90,
        predictedDay120,
        classification,
        classificationNote,
    };

  }, [labRows, directEntry, manualSlope]);
};