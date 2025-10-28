
export interface LabRow {
  id: string;
  day: string;
  ldh: string;
  creatinine: string;
  platelets: string;
}

export interface DirectEntry {
  id: string;
  day: string;
  value: string;
  type: 'easix' | 'log2';
}

// FIX: Corrected a typo in the enum name 'D RI' to 'DRI'.
export enum DRI {
  Low = 'Low',
  Intermediate = 'Intermediate',
  High = 'High',
  VeryHigh = 'Very High',
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
  source: 'lab' | 'direct';
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
}