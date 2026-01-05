import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface CloseIconProps {
  color?: string;
  width?: number;
  height?: number;
}

export default function CloseIcon({ 
  color = '#fff', 
  width = 24, 
  height = 24 
}: CloseIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18.717 6.697l-1.414-1.414-5.303 5.303-5.303-5.303-1.414 1.414 5.303 5.303-5.303 5.303 1.414 1.414 5.303-5.303 5.303 5.303 1.414-1.414-5.303-5.303z"
        fill={color}
      />
    </Svg>
  );
}

