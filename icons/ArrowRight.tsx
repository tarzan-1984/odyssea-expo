import React from 'react';
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg';

interface ArrowRightProps {
  width?: number;
  height?: number;
  color?: string;
}

/**
 * ArrowRight icon component
 * Reusable SVG arrow pointing to the right
 */
export default function ArrowRight({ 
  width = 17, 
  height = 16, 
  color = '#292966' 
}: ArrowRightProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 17 16" fill="none">
      <G clipPath="url(#clip0_4_15499)">
        <Path
          d="M16.3167 7.55759C16.3165 7.5574 16.3163 7.55719 16.3161 7.557L13.0504 4.307C12.8057 4.06353 12.41 4.06444 12.1665 4.30912C11.923 4.55378 11.9239 4.9495 12.1686 5.193L14.3612 7.375H1.125C0.779813 7.375 0.5 7.65481 0.5 8C0.5 8.34519 0.779813 8.625 1.125 8.625H14.3612L12.1686 10.807C11.9239 11.0505 11.923 11.4462 12.1665 11.6909C12.41 11.9356 12.8058 11.9364 13.0504 11.693L16.3162 8.443C16.3163 8.44281 16.3165 8.44259 16.3167 8.4424C16.5615 8.19809 16.5607 7.80109 16.3167 7.55759Z"
          fill={color}
        />
      </G>
      <Defs>
        <ClipPath id="clip0_4_15499">
          <Rect width="16" height="16" fill="white" transform="translate(0.5)" />
        </ClipPath>
      </Defs>
    </Svg>
  );
}


