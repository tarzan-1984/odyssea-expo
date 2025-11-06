import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ArrowLeftProps {
  width?: number;
  height?: number;
  color?: string;
}

/**
 * ArrowLeft Icon - Left pointing chevron for back navigation
 */
export default function ArrowLeft({ 
  width = 10.46, 
  height = 19, 
  color = 'rgb(255,255,255)' 
}: ArrowLeftProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 10.4609 19" fill="none">
      <Path
        d="M0.277695 10.1781L8.82191 18.7194C9.19682 19.0934 9.80424 19.0934 10.1801 18.7194C10.555 18.3455 10.555 17.7381 10.1801 17.3641L2.31361 9.50043L10.1792 1.63678C10.5541 1.26281 10.5541 0.65539 10.1792 0.280476C9.80424 -0.0934919 9.19588 -0.0934919 8.82096 0.280476L0.276748 8.82177C-0.092407 9.19187 -0.0924069 9.80884 0.277695 10.1781Z"
        fill={color}
        fillRule="nonzero"
      />
    </Svg>
  );
}

