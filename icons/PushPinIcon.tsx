import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface PushPinIconProps {
  width?: number;
  height?: number;
  color?: string;
}

/**
 * PushPinIcon - Push pin icon for pinned chats (unpin action)
 */
export default function PushPinIcon({ 
  width = 16, 
  height = 16, 
  color = '#000000' 
}: PushPinIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 256 256" fill="none">
      <G transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
        <Path
          d="M 89.011 87.739 c -0.599 -1.371 -1.294 -2.652 -1.968 -3.891 l -0.186 -0.343 l -15.853 -15.91 c -0.371 -0.375 -0.746 -0.748 -1.12 -1.12 c -0.671 -0.667 -1.342 -1.335 -1.997 -2.018 l -1.459 -1.437 l 23.316 -23.317 l -1.704 -1.704 c -9.111 -9.112 -22.925 -12.518 -35.353 -8.759 l -6.36 -6.359 c 0.769 -7.805 -2.017 -15.69 -7.503 -21.175 L 37.123 0 L 0 37.122 l 1.706 1.704 c 5.487 5.487 13.368 8.271 21.176 7.503 l 6.36 6.36 C 25.484 65.115 28.889 78.93 38 88.041 l 1.703 1.704 l 23.316 -23.316 l 1.438 1.458 c 0.679 0.653 1.344 1.321 2.009 1.989 c 0.373 0.374 0.745 0.748 1.117 1.116 l 15.699 15.7 l 0.566 0.352 c 1.239 0.673 2.52 1.369 3.891 1.968 L 90 90 L 89.011 87.739 z"
          fill={color}
          fillRule="nonzero"
        />
      </G>
    </Svg>
  );
}

