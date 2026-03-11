import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface WorkIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function WorkIcon({ width = 20, height = 20, color = '#8E8E93' }: WorkIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"
        fill={color}
        fillRule="nonzero"
      />
    </Svg>
  );
}
