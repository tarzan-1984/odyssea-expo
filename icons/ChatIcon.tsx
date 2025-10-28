import React from 'react';
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg';

interface ArrowRightProps {
	width?: number;
	height?: number;
	color?: string;
}

export default function ChatIcon({
	width = 20,
	height = 20,
	color = '#6066C5'
}: ArrowRightProps) {
	return (
		<Svg viewBox="0 0 20 20" width={width} height={height} fill="none">
			<Rect id="chat 1" width={height} height={height} x="0.000000" y="0.000000" fill={color} fillOpacity={0} />
			<G id="Group">
				<G id="Group">
					<Path id="Vector" d="M11.875 3.75L4.375 3.75C4.03 3.75 3.75 4.03 3.75 4.375C3.75 4.72 4.03 5 4.375 5L11.875 5C12.22 5 12.5 4.72 12.5 4.375C12.5 4.03 12.22 3.75 11.875 3.75Z" fill={color} fillRule="nonzero" />
				</G>
			</G>
			<G id="Group">
				<G id="Group">
					<Path id="Vector" d="M9.375 6.25L4.375 6.25C4.03 6.25 3.75 6.53 3.75 6.875C3.75 7.22 4.03 7.5 4.375 7.5L9.375 7.5C9.72 7.5 10 7.22 10 6.875C10 6.53 9.72 6.25 9.375 6.25Z" fill={color} fillRule="nonzero" />
				</G>
			</G>
			<G id="Group">
				<G id="Group">
					<Path id="Vector" d="M13.75 0L2.5 0C1.12125 0 0 1.12125 0 2.5L0 15C0 15.2425 0.14 15.4637 0.36 15.5662C0.44375 15.605 0.535 15.625 0.625 15.625C0.76875 15.625 0.91125 15.575 1.025 15.48L4.60125 12.5L13.75 12.5C15.1287 12.5 16.25 11.3787 16.25 10L16.25 2.5C16.25 1.12125 15.1287 0 13.75 0ZM15 10C15 10.6888 14.44 11.25 13.75 11.25L4.375 11.25C4.22875 11.25 4.0875 11.3013 3.975 11.395L1.25 13.6662L1.25 2.5C1.25 1.81125 1.81 1.25 2.5 1.25L13.75 1.25C14.44 1.25 15 1.81125 15 2.5L15 10Z" fill={color} fillRule="nonzero" />
				</G>
			</G>
			<G id="Group">
				<G id="Group">
					<Path id="Vector" d="M17.5 5C17.155 5 16.875 5.28 16.875 5.625C16.875 5.97 17.155 6.25 17.5 6.25C18.19 6.25 18.75 6.81125 18.75 7.5L18.75 18.0737L16.64 16.3862C16.53 16.2988 16.3913 16.25 16.25 16.25L7.5 16.25C6.81 16.25 6.25 15.6888 6.25 15L6.25 14.375C6.25 14.03 5.97 13.75 5.625 13.75C5.28 13.75 5 14.03 5 14.375L5 15C5 16.3787 6.12125 17.5 7.5 17.5L16.03 17.5L18.9837 19.8638C19.0975 19.9538 19.2362 20 19.375 20C19.4663 20 19.5588 19.98 19.6462 19.9388C19.8625 19.8338 20 19.615 20 19.375L20 7.5C20 6.12125 18.8787 5 17.5 5Z" fill={color} fillRule="nonzero" />
				</G>
			</G>
		</Svg>
	
	);
}


