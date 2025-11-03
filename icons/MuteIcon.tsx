import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface MuteIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function MuteIcon({
  width = 12,
  height = 12,
  color = '#8E8E93',
}: MuteIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 16 16" fill="none">
      <Path
        d="M6 2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v11a.5.5 0 01-.5.5h-3a.5.5 0 01-.5-.5v-11zM2 4v8h2V4H2zm10 0v8h2V4h-2z"
        fill={color}
      />
      <Path
        d="M13 2l1 1-1 1-1-1 1-1zM13 12l1 1-1 1-1-1 1-1z"
        fill={color}
      />
    </Svg>
  );
}

