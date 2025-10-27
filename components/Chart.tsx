
import React from 'react';
import type { Point } from '../types';

interface ChartProps {
  points: Point[];
  slope: number | null;
  intercept: number | null;
  width: number;
  height: number;
}

const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const DAY_RANGE = { min: 20, max: 120 };
const THRESHOLD = 2.32;

export const Chart: React.FC<ChartProps> = ({ points, slope, intercept, width, height }) => {
  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const yValues = points.map(p => p.log2Easix);
  const yMinDomain = Math.min(...yValues, THRESHOLD - 0.5, 1.0);
  const yMaxDomain = Math.max(...yValues, THRESHOLD + 0.5, 3.5);
  const yDomain = points.length > 0 ? [yMinDomain, yMaxDomain] : [0, 4];
  
  const xScale = (day: number) => PADDING.left + ((day - DAY_RANGE.min) / (DAY_RANGE.max - DAY_RANGE.min)) * chartWidth;
  const yScale = (val: number) => PADDING.top + chartHeight - ((val - yDomain[0]) / (yDomain[1] - yDomain[0])) * chartHeight;

  const yTicks = [];
  for (let i = Math.ceil(yDomain[0]); i <= Math.floor(yDomain[1]); i+=0.5) {
      if(i>=yDomain[0] && i<=yDomain[1]) yTicks.push(i);
  }

  const xTicks = [20, 40, 60, 80, 100, 120];

  return (
    <svg width={width} height={height} className="bg-gray-800 rounded-lg">
      {/* Axes and Grid */}
      <g className="text-gray-400 text-xs">
        {/* X Axis */}
        <line x1={PADDING.left} y1={height - PADDING.bottom} x2={width - PADDING.right} y2={height - PADDING.bottom} stroke="currentColor" />
        {xTicks.map(day => (
          <g key={`x-tick-${day}`}>
            <line x1={xScale(day)} y1={height - PADDING.bottom} x2={xScale(day)} y2={height - PADDING.bottom + 5} stroke="currentColor"/>
            <text x={xScale(day)} y={height - PADDING.bottom + 20} textAnchor="middle" fill="currentColor">{day}</text>
          </g>
        ))}
        <text x={PADDING.left + chartWidth / 2} y={height - 5} textAnchor="middle" fill="currentColor" className="font-semibold">Day since transplant</text>
        
        {/* Y Axis */}
        <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={height - PADDING.bottom} stroke="currentColor" />
        {yTicks.map(val => (
           <g key={`y-tick-${val}`}>
            <line x1={PADDING.left - 5} y1={yScale(val)} x2={PADDING.left} y2={yScale(val)} stroke="currentColor" />
            <text x={PADDING.left - 10} y={yScale(val)} dominantBaseline="middle" textAnchor="end" fill="currentColor">{val.toFixed(1)}</text>
            <line x1={PADDING.left} y1={yScale(val)} x2={width-PADDING.right} y2={yScale(val)} stroke="currentColor" strokeOpacity="0.1" />
           </g>
        ))}
        <text transform={`rotate(-90)`} x={-(PADDING.top + chartHeight / 2)} y={15} textAnchor="middle" fill="currentColor" className="font-semibold">log₂(EASIX)</text>
      </g>
      
      {/* Threshold Line */}
      <g>
        <line
          x1={PADDING.left}
          y1={yScale(THRESHOLD)}
          x2={width - PADDING.right}
          y2={yScale(THRESHOLD)}
          stroke="orange"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <text x={width - PADDING.right - 5} y={yScale(THRESHOLD) - 5} textAnchor="end" fill="orange" className="text-sm font-bold">
          Threshold = {THRESHOLD}
        </text>
      </g>
      
      {/* Regression Line */}
      {slope !== null && intercept !== null && (
        <line
          x1={xScale(DAY_RANGE.min)}
          y1={yScale(intercept + slope * DAY_RANGE.min)}
          x2={xScale(DAY_RANGE.max)}
          y2={yScale(intercept + slope * DAY_RANGE.max)}
          stroke="#22d3ee" // cyan-400
          strokeWidth="2"
        />
      )}

      {/* Data Points */}
      {points.map((p, i) => (
        <circle
          key={`point-${i}`}
          cx={xScale(p.day)}
          cy={yScale(p.log2Easix)}
          r="4"
          fill={p.source === 'direct' ? '#22d3ee' : '#9ca3af'} // cyan-400 or gray-400
          stroke="#111827"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
};
