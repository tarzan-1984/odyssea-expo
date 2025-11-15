import React from 'react';
import { View, Image, StyleSheet, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { colors, fonts, fp, rem } from "@/lib";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenLayoutProps {
	children: React.ReactNode;
	headerTitle?: string;
	headerButtonText?: string;
	onHeaderButtonPress?: () => void;
	footer?: React.ReactNode;
}

const ScreenLayout: React.FC<ScreenLayoutProps> = ({ 
	children, 
	headerTitle, 
	headerButtonText, 
	onHeaderButtonPress,
	footer
}) => {
	const insets = useSafeAreaInsets();
	// Add vertical offset so that inputs are not overlapped when a header is rendered.
	const keyboardOffset = Platform.select({
		ios: (headerTitle ? rem(76) : 0) + insets.top,
		android: 0,
	}) as number;

	return (
		<View style={styles.container}>
		
		<View style={styles.bgImageWrapper} pointerEvents="none">
			<Image
				source={require('@/assets/images/bgBlue.png')}
				style={styles.bgImage}
				resizeMode="cover"
				importantForAccessibility="no"
				accessibilityElementsHidden={true}
			/>
		</View>
			
			{/* Header panel - starts from very top */}
			{headerTitle && (
				<View style={styles.headerPanel}>
					<Text style={styles.headerTitle} accessibilityRole="header">{headerTitle}</Text>
					
					{headerButtonText && onHeaderButtonPress && (
						<TouchableOpacity
							onPress={onHeaderButtonPress}
							accessibilityRole="button"
							accessibilityLabel={headerButtonText}
						>
							<Text style={styles.headerButtonText}>{headerButtonText}</Text>
						</TouchableOpacity>
					)}
				</View>
			)}
			
		<SafeAreaView style={[styles.safeArea, headerTitle && styles.safeAreaWithHeader]} collapsable={false}>
			<KeyboardAvoidingView
				style={{ flex: 1 }}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={keyboardOffset}
			>
				<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
					<ScrollView
						contentContainerStyle={[styles.scrollContent, { paddingBottom: rem(24) + insets.bottom }]}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.content} collapsable={false}>
							{children}
						</View>
					</ScrollView>
				</TouchableWithoutFeedback>
			</KeyboardAvoidingView>
			{/* Fixed footer area (not affected by KeyboardAvoidingView) */}
			{footer ? (
				<View style={[styles.footer, { paddingBottom: rem(10) + insets.bottom }]}>
					{footer}
				</View>
			) : null}
		</SafeAreaView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.primary.blue,
		position: "relative",
	},
	bgImageWrapper: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 0,
	},
	bgImage: {
		width: "100%",
		height: "100%",
	},
	headerPanel: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		zIndex: 4,
		backgroundColor: colors.primary.violet,
		paddingTop: rem(50),
		paddingHorizontal: rem(15),
		paddingBottom: rem(15),
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	headerTitle: {
		fontSize: fp(17),
		fontFamily: fonts["700"],
		color: colors.neutral.white,
		flex: 1,
	},
	headerButtonText: {
		fontSize: fp(16),
		fontFamily: fonts["400"],
		color: colors.neutral.white,
	},
	safeArea: {
		flex: 1,
		zIndex: 2,
	},
	safeAreaWithHeader: {
		paddingTop: rem(76),
	},
	scrollContent: {
		flexGrow: 1,
	},
	content: {
		flex: 1,
		position: "relative",
		paddingHorizontal: rem(20),
		paddingTop: rem(20),
	},
	footer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: 'center',
		justifyContent: 'center',
	}
});

export default ScreenLayout;