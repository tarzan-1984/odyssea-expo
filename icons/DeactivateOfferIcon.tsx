import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface DeactivateOfferIconProps {
  width?: number;
  height?: number;
}

export default function DeactivateOfferIcon({
  width = 20,
  height = 20,
}: DeactivateOfferIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 122.88 122.88" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#eb0100"
        d="M61.44 0A61.44 61.44 0 1 1 0 61.44 61.44 61.44 0 0 1 61.44 0"
      />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#fff"
        d="M35.38 49.72c-2.16-2.13-3.9-3.47-1.19-6.1l8.74-8.53c2.77-2.8 4.39-2.66 7 0l11.75 11.77 11.71-11.71c2.14-2.17 3.47-3.91 6.1-1.2L88 42.69c2.8 2.77 2.66 4.4 0 7L76.27 61.44 88 73.21c2.65 2.58 2.79 4.21 0 7l-8.54 8.74c-2.63 2.71-4 1-6.1-1.19L61.68 76 49.9 87.81c-2.58 2.64-4.2 2.78-7 0l-8.74-8.53c-2.71-2.63-1-4 1.19-6.1L47.1 61.44 35.38 49.72z"
      />
    </Svg>
  );
}
