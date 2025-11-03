import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface PinIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function PinIcon({
  width = 12,
  height = 12,
  color = '#8E8E93',
}: PinIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 0L3 5v6h2v4l3-3 3 3v-4h2V5l-5-5zm0 2.83L11.17 6H10v5.17L9 10.17V7H4.83L8 3.83z"
        fill={color}
      />
    </Svg>
  );
}

