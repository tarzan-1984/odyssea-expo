import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, rem } from '@/lib';

type Props = {
	variant?: 'default' | 'gridCell';
};

/** Skeleton until the message enters the chat viewport. */
export default function ChatMediaPreviewPlaceholder({ variant = 'default' }: Props) {
	const isGrid = variant === 'gridCell';
	return (
		<View
			style={[
				styles.base,
				isGrid ? styles.grid : styles.default,
			]}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		/>
	);
}

const styles = StyleSheet.create({
	base: {
		backgroundColor: colors.neutral.lightGrey,
		borderRadius: rem(8),
	},
	default: {
		width: rem(260),
		height: rem(180),
		marginBottom: rem(6),
	},
	grid: {
		width: '100%',
		height: rem(104),
		borderRadius: rem(6),
	},
});
