import React from 'react';
import Svg, { Path, Rect, G } from 'react-native-svg';

interface UnreadCheckIconProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function UnreadCheckIcon({
  width = 18,
  height = 18,
  color = '#292966',
}: UnreadCheckIconProps) {
  return (
    <Svg viewBox="0 0 18 18" width={width} height={height} fill="none">
      <Rect
        id="check-mark 1"
        width={width}
        height={height}
        x="0"
        y="0"
        fill="rgb(255,255,255)"
        fillOpacity="0"
      />
      <G id="Group">
        <Path
          id="Vector"
          d="M12.0716 6.17505C11.8783 5.98169 11.5648 5.98169 11.3717 6.17505L6.77164 10.7751L4.15162 8.15504C3.9585 7.96168 3.64478 7.96168 3.45166 8.15504C3.2583 8.34841 3.2583 8.66165 3.45166 8.85501L6.42166 11.825C6.51834 11.9217 6.64499 11.97 6.77164 11.97C6.89829 11.97 7.02494 11.9217 7.12162 11.825L12.0716 6.87501C12.265 6.68189 12.265 6.36841 12.0716 6.17505Z"
          fill={color}
          fillRule="nonzero"
        />
      </G>
    </Svg>
  );
}

