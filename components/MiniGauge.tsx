
import React from 'react';

interface MiniGaugeProps {
  value: number | null;
  range: [number, number];
  label: string;
}

export const MiniGauge: React.FC<MiniGaugeProps> = ({ value, range, label }) => {
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
            className="absolute h-full w-1 bg-cyan-400"
            style={{ left: `${markerPosition}%` }}
          ></div>
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
        <span>{label}: {formatValue(refLow)}-{formatValue(refHigh)}</span>
      </div>
    </div>
  );
};
