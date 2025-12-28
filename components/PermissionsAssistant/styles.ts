import { StyleSheet } from "react-native";
import { colors, fonts, rem, fp, borderRadius, typography } from '@/lib';

export default StyleSheet.create({
	container: {
		flex: 1,
		padding: rem(20),
		backgroundColor: colors.primary.blue,
	},
	title: {
		paddingTop: rem(30),
		textAlign: 'center',
		fontSize: fp(22),
		fontWeight: "bold",
		marginBottom: rem(30),
		color: colors.neutral.white,
	},
	block: {
		padding: rem(10),
		borderRadius: 10,
		backgroundColor: colors.neutral.white,
		marginBottom: rem(12),
	},
	completeBlock: {
		backgroundColor: colors.primary.green,
	},
	label: {
		fontSize: fp(14),
		fontFamily: fonts["600"],
		color: colors.primary.blue
	},
	status: {
		fontSize: fp(14),
		color: colors.primary.blue,
		marginTop: rem(4),
	},
	button: {
		...typography.buttonGreen,
		marginTop: rem(40),
	},
	buttonDisabled: {
		opacity: 0.4
	},
	buttonText: {
		color: "#fff",
		fontSize: fp(16),
		fontFamily: fonts["500"],
	},
	hint: {
		fontSize: fp(18),
		color: colors.neutral.white,
		marginTop: rem(8),
		lineHeight: fp(20),
	},
	autostartWarning: {
		backgroundColor: '#FF3B30', // Red background
		padding: rem(16),
		borderRadius: rem(10),
		marginBottom: rem(16),
	},
	autostartWarningText: {
		color: colors.neutral.white, // White text
		fontSize: fp(14),
		fontFamily: fonts["700"], // Bold
		fontWeight: 'bold',
		textAlign: 'center',
		lineHeight: fp(20),
	},
});