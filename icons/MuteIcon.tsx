import React from 'react';
import Svg, { Path, G } from 'react-native-svg';

interface MuteIconProps {
  width?: number;
  height?: number;
  color?: string;
}

/**
 * MuteIcon - Icon for muting a chat (unmuted state - shows speaker icon)
 */
export default function MuteIcon({ 
  width = 16, 
  height = 16, 
  color = '#000000' 
}: MuteIconProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 256 256" fill="none">
      <G transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)">
        <Path
          d="M 58.221 71.776 c -0.246 0 -0.49 -0.091 -0.679 -0.266 L 41.33 56.544 H 23.593 c -0.552 0 -1 -0.447 -1 -1 V 34.456 c 0 -0.552 0.448 -1 1 -1 H 41.33 l 16.212 -14.967 c 0.293 -0.27 0.719 -0.34 1.08 -0.181 c 0.363 0.159 0.599 0.519 0.599 0.916 v 51.553 c 0 0.397 -0.235 0.757 -0.599 0.916 C 58.493 71.749 58.356 71.776 58.221 71.776 z M 24.593 54.544 h 17.128 c 0.251 0 0.494 0.095 0.678 0.266 l 14.821 13.683 V 21.508 L 42.399 35.191 c -0.185 0.17 -0.427 0.265 -0.678 0.265 H 24.593 V 54.544 z"
          fill={color}
          fillRule="nonzero"
        />
        <Path
          d="M 45 90 C 20.187 90 0 69.813 0 45 C 0 20.187 20.187 0 45 0 c 24.813 0 45 20.187 45 45 C 90 69.813 69.813 90 45 90 z M 45 2 C 21.29 2 2 21.29 2 45 c 0 23.71 19.29 43 43 43 c 23.71 0 43 -19.29 43 -43 C 88 21.29 68.71 2 45 2 z"
          fill={color}
          fillRule="nonzero"
        />
      </G>
    </Svg>
  );
}
