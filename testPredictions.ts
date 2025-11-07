// Test script to validate JavaScript predictions against R
import { validatePredictionEngine } from './dynamicModel.ts';

console.log('Starting validation of JavaScript prediction engine...\n');

validatePredictionEngine()
  .then(() => {
    console.log('\nValidation complete!');
  })
  .catch((error) => {
    console.error('\nValidation failed with error:', error);
    process.exit(1);
  });
