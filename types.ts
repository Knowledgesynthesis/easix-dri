
export interface LabRow {
  id: string;
  day: string;
  ldh: string;
  creatinine: string;
  platelets: string;
}

// FIX: Corrected a typo in the enum name 'D RI' to 'DRI'.
export enum DRI {
  LowIntermediate = 'Low-Intermediate',
  HighVeryHigh = 'High-Very High',
}

export enum Prophylaxis {
  PTCy = 'PTCy',
  MTX = 'MTX',
}

export enum Conditioning {
  MAC = 'MAC',
  RIC_NMA = 'RIC/NMA',
}

export interface Point {
  day: number;
  easix: number;
  log2Easix: number;
}

export type Classification = 'High' | 'Low' | 'Insufficient Data';

export interface CalculationResult {
  points: Point[];
  slope: number | null;
  intercept: number | null;
  predictedDay90: number | null;
  predictedDay120: number | null;
  classification: Classification;
  classificationNote: string | null;
  // Dynamic LME model predictions
  eventRate2yr: number | null;  // 2-year event rate percentage (0-100)
  slopeAtLandmark: number | null;  // Rate of change in log2EASIX
  log2easixAtLandmark: number | null;  // Predicted log2EASIX at day 120
}