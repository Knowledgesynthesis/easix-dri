
import React, { useState } from 'react';
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

export const Chart: React.FC<ChartProps> = ({ points, slope, intercept, width, height }) => {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [hoveredLine, setHoveredLine] = useState<boolean>(false);
  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const yValues = points.map(p => p.log2Easix);
  const DEFAULT_DOMAIN: [number, number] = [0, 4];
  const padding = 0.5;
  const yMinDomain = yValues.length ? Math.min(...yValues) - padding : DEFAULT_DOMAIN[0];
  const yMaxDomain = yValues.length ? Math.max(...yValues) + padding : DEFAULT_DOMAIN[1];
  const yDomain: [number, number] = [yMinDomain, yMaxDomain];
  
  const xScale = (day: number) => PADDING.left + ((day - DAY_RANGE.min) / (DAY_RANGE.max - DAY_RANGE.min)) * chartWidth;
  const yScale = (val: number) => PADDING.top + chartHeight - ((val - yDomain[0]) / (yDomain[1] - yDomain[0])) * chartHeight;

  const yTicks: number[] = [];
  for (let i = Math.ceil(yDomain[0]); i <= Math.floor(yDomain[1]); i += 0.5) {
      if (i >= yDomain[0] && i <= yDomain[1]) yTicks.push(i);
  }

  const xTicks = [20, 40, 60, 80, 100, 120];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="bg-gray-800 rounded-lg w-full h-auto" preserveAspectRatio="xMidYMid meet">
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
      
      {/* Regression Line */}
      {slope !== null && intercept !== null && (
        <g>
          {/* Visible line */}
          <line
            x1={xScale(DAY_RANGE.min)}
            y1={yScale(intercept + slope * DAY_RANGE.min)}
            x2={xScale(DAY_RANGE.max)}
            y2={yScale(intercept + slope * DAY_RANGE.max)}
            stroke="#22d3ee" // cyan-400
            strokeWidth={hoveredLine ? "3" : "2"}
            style={{ transition: 'stroke-width 0.15s ease' }}
          />
          {/* Invisible wider line for easier hovering */}
          <line
            x1={xScale(DAY_RANGE.min)}
            y1={yScale(intercept + slope * DAY_RANGE.min)}
            x2={xScale(DAY_RANGE.max)}
            y2={yScale(intercept + slope * DAY_RANGE.max)}
            stroke="transparent"
            strokeWidth="12"
            onMouseEnter={() => setHoveredLine(true)}
            onMouseLeave={() => setHoveredLine(false)}
            style={{ cursor: 'pointer' }}
          />
          {/* Tooltip for slope */}
          {hoveredLine && (
            <g>
              <rect
                x={xScale((DAY_RANGE.min + DAY_RANGE.max) / 2) - 55}
                y={yScale(intercept + slope * ((DAY_RANGE.min + DAY_RANGE.max) / 2)) - 35}
                width="110"
                height="25"
                fill="#1f2937"
                stroke="#22d3ee"
                strokeWidth="1"
                rx="4"
              />
              <text
                x={xScale((DAY_RANGE.min + DAY_RANGE.max) / 2)}
                y={yScale(intercept + slope * ((DAY_RANGE.min + DAY_RANGE.max) / 2)) - 18}
                fill="#e5e7eb"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
              >
                Slope: {slope.toFixed(4)} log₂/day
              </text>
            </g>
          )}
        </g>
      )}

      {/* Data Points */}
      {points.map((p, i) => (
        <g key={`point-${i}`}>
          <circle
            cx={xScale(p.day)}
            cy={yScale(p.log2Easix)}
            r={hoveredPoint === i ? "6" : "4"}
            fill="#22d3ee" // cyan-400
            stroke="#111827"
            strokeWidth="1"
            onMouseEnter={() => setHoveredPoint(i)}
            onMouseLeave={() => setHoveredPoint(null)}
            style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
          />
          {hoveredPoint === i && (
            <g>
              <rect
                x={xScale(p.day) + 10}
                y={yScale(p.log2Easix) - 30}
                width="110"
                height="40"
                fill="#1f2937"
                stroke="#22d3ee"
                strokeWidth="1"
                rx="4"
              />
              <text
                x={xScale(p.day) + 15}
                y={yScale(p.log2Easix) - 15}
                fill="#e5e7eb"
                fontSize="11"
                fontWeight="600"
              >
                Day: {p.day}
              </text>
              <text
                x={xScale(p.day) + 15}
                y={yScale(p.log2Easix) - 2}
                fill="#e5e7eb"
                fontSize="11"
                fontWeight="600"
              >
                log₂(EASIX): {p.log2Easix.toFixed(2)}
              </text>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
};
