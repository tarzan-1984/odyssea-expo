import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface MarkUnreadIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function MarkUnreadIcon({ 
  width = 14, 
  height = 14, 
  color = '#000000' 
}: MarkUnreadIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

