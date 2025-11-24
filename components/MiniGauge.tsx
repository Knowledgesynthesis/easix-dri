
import React from 'react';

interface MiniGaugeProps {
  value: number | null;
  range: [number, number];
  label: string;
  labType?: 'ldh' | 'creatinine' | 'platelets';
}

export const MiniGauge: React.FC<MiniGaugeProps> = ({ value, range, label, labType }) => {
  const [refLow, refHigh] = range;

  // Calculate scale that accommodates both the reference range and the value
  // For negative ranges, we need to include negative values in the scale
  let scaleMin: number;
  let scaleMax: number;

  if (refLow < 0 || (value !== null && value < 0)) {
    // Handle negative values
    scaleMin = Math.min(refLow * 1.5, value !== null ? value * 1.25 : 0, refLow - Math.abs(refHigh - refLow) * 0.5);
    scaleMax = Math.max(refHigh * 1.5, value !== null ? value * 1.25 : 0, refHigh + Math.abs(refHigh - refLow) * 0.5);
  } else {
    // All positive values (original behavior)
    scaleMin = 0;
    scaleMax = Math.max(2 * refHigh, value ? 1.25 * value : 0, 4 * refLow);
  }

  const scaleSpan = scaleMax - scaleMin;

  if (scaleSpan === 0) return null; // Avoid division by zero

  // Calculate positions relative to the full scale
  const refBandLeft = ((refLow - scaleMin) / scaleSpan) * 100;
  const refBandWidth = ((refHigh - refLow) / scaleSpan) * 100;
  const markerPosition = value !== null ? Math.max(0, Math.min(100, ((value - scaleMin) / scaleSpan) * 100)) : null;

  // Determine marker color based on lab type and value
  const getMarkerColor = (val: number | null): string => {
    if (val === null) return '#22d3ee'; // cyan-400 default

    // Within normal range - always green
    if (val >= refLow && val <= refHigh) return '#22c55e'; // green-500

    // Outside normal range - check thresholds based on lab type
    if (labType === 'ldh') {
      // LDH: Yellow 100-121 or 223-350, Red <100 or >350
      if ((val >= 100 && val < refLow) || (val > refHigh && val <= 350)) {
        return '#eab308'; // yellow-500
      }
      return '#ef4444'; // red-500
    } else if (labType === 'creatinine') {
      // Creatinine: Yellow 0.4-0.73 or 1.36-1.8, Red <0.4 or >1.8
      if ((val >= 0.4 && val < refLow) || (val > refHigh && val <= 1.8)) {
        return '#eab308'; // yellow-500
      }
      return '#ef4444'; // red-500
    } else if (labType === 'platelets') {
      // Platelets: Yellow 100-149 or 401-500, Red <100 or >500
      if ((val >= 100 && val < refLow) || (val > refHigh && val <= 500)) {
        return '#eab308'; // yellow-500
      }
      return '#ef4444'; // red-500
    }

    // Default fallback
    return '#22d3ee'; // cyan-400
  };

  // Format range values with appropriate precision
  const formatValue = (val: number): string => {
    // If value is less than 10, show 2 decimal places, otherwise show 1 or 0
    if (Math.abs(val) < 10) {
      return val.toFixed(2);
    } else if (Math.abs(val) < 100) {
      return val.toFixed(1);
    } else {
      return val.toFixed(0);
    }
  };

  return (
    <div className="w-full mt-1">
      <div className="h-2 w-full bg-gray-600 rounded-full relative overflow-hidden">
        <div
          className="absolute h-full bg-green-500/50"
          style={{ left: `${refBandLeft}%`, width: `${refBandWidth}%` }}
        ></div>
        {markerPosition !== null && (
          <div
            className="absolute h-full w-1"
            style={{ left: `${markerPosition}%`, backgroundColor: getMarkerColor(value) }}
          ></div>
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
        <span>{label}: {formatValue(refLow)}-{formatValue(refHigh)}</span>
      </div>
    </div>
  );
};
