import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface FileIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function FileIcon({ 
  width = 40, 
  height = 40, 
  color = '#6066C5' 
}: FileIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M14 2V8H20"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

