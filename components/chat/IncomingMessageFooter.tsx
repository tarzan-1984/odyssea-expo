import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import { getPhoneDialUrl } from '@/utils/chatMessageMeta';

type Props = {
	phone: string;
};

export default function IncomingMessageFooter({ phone }: Props) {
	const dialUrl = getPhoneDialUrl(phone);
	if (!dialUrl) return null;

	return (
		<View style={styles.footer}>
			<TouchableOpacity
				onPress={() => Linking.openURL(dialUrl).catch(() => {})}
				activeOpacity={0.7}
				hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
			>
				<Text style={styles.phone}>{phone}</Text>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	footer: {
		marginTop: rem(8),
	},
	phone: {
		fontSize: fp(12),
		lineHeight: rem(16),
		fontFamily: fonts['600'],
		color: colors.primary.violet,
	},
});
