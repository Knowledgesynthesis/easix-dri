import { readFileSync, writeFileSync } from 'fs';
import { predictDynamicEASIX } from './dynamicModel.ts';
import type { PatientObservation, PredictionResult } from './dynamicModel.ts';

interface ValidationCase {
    patient_id: string;
    dri: number;
    observations: PatientObservation[];
    expected_predictions: PredictionResult;
}

interface ValidationData {
    validation_cases: ValidationCase[];
}

const filePath = './validation_test_cases.json';
const outputPath = process.env.VALIDATION_OUT ?? filePath;
const data: ValidationData = JSON.parse(readFileSync(filePath, 'utf-8'));

const updatedCases = data.validation_cases.map((testCase) => {
    const result = predictDynamicEASIX(testCase.observations, testCase.dri);
    return {
        ...testCase,
        expected_predictions: result,
    };
});

writeFileSync(outputPath, JSON.stringify({ validation_cases: updatedCases }, null, 2));
console.log(`✓ validation cases written to ${outputPath}`);
