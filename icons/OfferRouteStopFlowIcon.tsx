import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface OfferRouteStopFlowIconProps {
  color?: string;
  width?: number;
  height?: number;
}

/** Pick-up / delivery route leg flow (swap-style), original viewBox 122.88×102.04 */
export default function OfferRouteStopFlowIcon({
  color = '#FFFFFF',
  width = 20,
  height = 17,
}: OfferRouteStopFlowIconProps) {
  return (
    <View
      style={{
        width: height,
        height: width,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={width}
        height={height}
        viewBox="0 0 122.88 102.04"
        fill="none"
        style={{ transform: [{ rotate: '90deg' }] }}
      >
        <Path
          d="M38.65,13.42H94.1V4A3.93,3.93,0,0,1,95.67.62c2.64-1.76,5.54.64,7.37,2.3,5.19,4.73,15.65,15.42,18.37,17.76a3.85,3.85,0,0,1,0,6.05c-2.81,2.41-13.82,13.69-18.87,18.18-1.75,1.55-4.42,3.48-6.87,1.86a3.94,3.94,0,0,1-1.57-3.35V34H59.4c-1.33,0-2,.48-1.88,1.6V54.42l0,2.87a2,2,0,0,1-2,2H37.74a2,2,0,0,1-2-2V15.44a2,2,0,0,1,2-2Zm45.58,75.2H28.78v9.46a3.94,3.94,0,0,1-1.57,3.35c-2.64,1.75-5.54-.65-7.37-2.31C14.66,94.39,4.19,83.7,1.47,81.36a3.84,3.84,0,0,1,0-6c2.81-2.41,13.82-13.69,18.87-18.19,1.75-1.55,4.42-3.48,6.87-1.86a4,4,0,0,1,1.57,3.35v9.43h34.7c1.33,0,2-.47,1.88-1.6V47.63l0-2.87a2,2,0,0,1,2-2H85.14a2,2,0,0,1,2,2V86.61a2,2,0,0,1-2,2Z"
          fill={color}
        />
      </Svg>
    </View>
  );
}
