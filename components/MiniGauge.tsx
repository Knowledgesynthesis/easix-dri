
import React from 'react';

interface MiniGaugeProps {
  value: number | null;
  range: [number, number];
  label: string;
}

export const MiniGauge: React.FC<MiniGaugeProps> = ({ value, range, label }) => {
  const [refLow, refHigh] = range;

  const maxSpan = Math.max(2 * refHigh, value ? 1.25 * value : 0, 4 * refLow);
  
  if (maxSpan === 0) return null; // Avoid division by zero if all values are 0

  const refBandLeft = (refLow / maxSpan) * 100;
  const refBandWidth = ((refHigh - refLow) / maxSpan) * 100;
  const markerPosition = value !== null ? Math.min(100, (value / maxSpan) * 100) : null;

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
        <span>{label}: {refLow}-{refHigh}</span>
      </div>
    </div>
  );
};
