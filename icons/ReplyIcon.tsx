import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ReplyIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function ReplyIcon({ 
  width = 14, 
  height = 14, 
  color = '#000000' 
}: ReplyIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

