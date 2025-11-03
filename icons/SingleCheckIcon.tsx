import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface SingleCheckIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function SingleCheckIcon({
  width = 14,
  height = 14,
  color = '#8E8E93',
}: SingleCheckIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 20 20" fill="none">
      <Path
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        fill={color}
      />
    </Svg>
  );
}

