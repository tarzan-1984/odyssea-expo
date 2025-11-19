import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface DownloadIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function DownloadIcon({ width = 24, height = 24, color = '#000000' }: DownloadIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15V3M12 15L8 11M12 15L16 11M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19V17"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

