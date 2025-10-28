import React from 'react';
import { View, Image, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fonts } from "@/lib";
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenLayoutProps {
	children: React.ReactNode;
	headerTitle?: string;
	headerButtonText?: string;
	onHeaderButtonPress?: () => void;
}

const ScreenLayout: React.FC<ScreenLayoutProps> = ({ 
	children, 
	headerTitle, 
	headerButtonText, 
	onHeaderButtonPress 
}) => {
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
			<View style={styles.content} collapsable={false}>
				{children}
			</View>
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
		paddingTop: 50,
		paddingHorizontal: 15,
		paddingBottom: 15,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	headerTitle: {
		fontSize: 17,
		fontFamily: fonts["700"],
		color: colors.neutral.white,
		flex: 1,
	},
	headerButtonText: {
		fontSize: 16,
		fontFamily: fonts["400"],
		color: colors.neutral.white,
	},
	safeArea: {
		flex: 1,
		zIndex: 2,
	},
	safeAreaWithHeader: {
		paddingTop: 76,
	},
	content: {
		flex: 1,
		position: "relative",
		paddingHorizontal: 20,
		paddingTop: 20,
	}
});

export default ScreenLayout;