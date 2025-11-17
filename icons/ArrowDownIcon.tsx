import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ArrowDownIconProps {
  color?: string;
  width?: number;
  height?: number;
}

export default function ArrowDownIcon({ 
  color = '#8E8E93', 
  width = 12, 
  height = 12 
}: ArrowDownIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 9l-7 7-7-7"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

