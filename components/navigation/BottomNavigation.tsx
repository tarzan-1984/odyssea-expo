import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Pressable, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, fp, rem } from '@/lib';
import Home from '@/icons/Home';
import WorkIcon from '@/icons/WorkIcon';
import ChatIcon from '@/icons/ChatIcon';
import ProfileIcon from '@/icons/ProfileIcon';
import SettingsIcon from '@/icons/SettingsIcon';
import { useAuth } from '@/context/AuthContext';
import { canAccessWorkTab } from '@/constants/roleAccess';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventBus } from '@/services/EventBus';
import { AppState, AppStateStatus } from 'react-native';
import { useChatStore } from '@/stores/chatStore';
import { countTotalUnreadMessages } from '@/utils/chatUnreadCount';
import {
	isInTabSection,
	navigateToTabRoot,
	type TabRoot,
} from '@/utils/tabNavigation';

const { width } = Dimensions.get('window');
const INACTIVE_COLOR = '#8E8E93';
const ACTIVE_COLOR = colors.neutral.white;
const NAV_ICON_SIZE = 24;
/** Extra height vs original tab bar (+15px). */
const NAV_EXTRA_HEIGHT = 15;

/** List/screen bottom inset so content is not hidden under the tab bar (was 70, +15). */
export const BOTTOM_NAV_SCROLL_PADDING = 85;

interface NavItemProps {
	icon: React.ReactNode;
	route: TabRoot;
	isActive?: boolean;
	onNavigate: (route: TabRoot) => void;
	badgeCount?: number;
	isLast?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({
	icon,
	route,
	isActive = false,
	onNavigate,
	badgeCount,
	isLast = false,
}) => (
	<Pressable
		style={[styles.navItem, isLast && styles.navItemLast]}
		onPress={() => onNavigate(route)}
		android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true }}
		hitSlop={8}
	>
		<View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
			{icon}
			{badgeCount !== undefined && badgeCount > 0 ? (
				<View style={styles.badge}>
					<Text style={styles.badgeText}>
						{badgeCount > 99 ? '99+' : badgeCount.toString()}
					</Text>
				</View>
			) : null}
		</View>
	</Pressable>
);

interface BottomNavigationProps {
	currentRoute?: string;
	/** Android only: avoid overlap with system navigation bar on specific screens */
	androidAvoidSystemNav?: boolean;
}

export default function BottomNavigation({
	currentRoute: currentRouteProp,
	androidAvoidSystemNav = false,
}: BottomNavigationProps) {
	const insets = useSafeAreaInsets();
	const pathname = usePathname();
	const currentRoute = currentRouteProp ?? pathname;
	const chatRooms = useChatStore((s) => s.chatRooms);
	const { authState } = useAuth();
	const canAccessOffers = canAccessWorkTab(authState.user?.role);
	const [driverStatus, setDriverStatus] = useState<string | null>(null);

	const appStateRef = useRef<AppStateStatus>(AppState.currentState);

	const loadDriverStatus = useCallback(async () => {
		const userRole = authState.user?.role;
		if (userRole === 'DRIVER') {
			try {
				const status = await AsyncStorage.getItem('@user_status');
				setDriverStatus(status);
			} catch (error) {
				console.warn('[BottomNavigation] Failed to load driver status:', error);
			}
		} else {
			setDriverStatus(null);
		}
	}, [authState.user?.role]);

	useEffect(() => {
		loadDriverStatus();
	}, [loadDriverStatus]);

	useEffect(() => {
		const handleDriverStatusUpdate = (data: { driverStatus: string | null }) => {
			if (authState.user?.role === 'DRIVER') {
				setDriverStatus(data.driverStatus);
			}
		};

		const unsubscribe = eventBus.on('DRIVER_STATUS_UPDATED', handleDriverStatusUpdate);
		return () => unsubscribe();
	}, [authState.user?.role]);

	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
			const prevState = appStateRef.current;
			if (prevState.match(/inactive|background/) && nextAppState === 'active') {
				if (authState.user?.role === 'DRIVER') {
					loadDriverStatus();
				}
			}
			appStateRef.current = nextAppState;
		});

		return () => subscription.remove();
	}, [authState.user?.role, loadDriverStatus]);

	const totalUnreadCount = useMemo(
		() =>
			countTotalUnreadMessages(chatRooms, {
				userId: authState.user?.id,
				userRole: authState.user?.role,
				driverStatus,
			}),
		[chatRooms, authState.user?.id, authState.user?.role, driverStatus]
	);

	const handleNavigate = useCallback(
		(route: TabRoot) => {
			navigateToTabRoot(currentRoute, route);
		},
		[currentRoute]
	);

	const homeActive = isInTabSection(currentRoute, '/final-verify');
	const workActive = isInTabSection(currentRoute, '/work');
	const messagesActive = isInTabSection(currentRoute, '/messages');
	const profileActive = isInTabSection(currentRoute, '/profile');
	const settingsActive = isInTabSection(currentRoute, '/settings');

	return (
		<View
			style={[
				styles.bottomNav,
				Platform.OS === 'android' && androidAvoidSystemNav ? { bottom: insets.bottom } : null,
			]}
		>
			<NavItem
				icon={
					<Home
						width={NAV_ICON_SIZE}
						height={NAV_ICON_SIZE}
						color={homeActive ? ACTIVE_COLOR : INACTIVE_COLOR}
					/>
				}
				route="/final-verify"
				isActive={homeActive}
				onNavigate={handleNavigate}
			/>

			{canAccessOffers ? (
				<NavItem
					icon={
						<WorkIcon
							width={NAV_ICON_SIZE}
							height={NAV_ICON_SIZE}
							color={workActive ? ACTIVE_COLOR : INACTIVE_COLOR}
						/>
					}
					route="/work"
					isActive={workActive}
					onNavigate={handleNavigate}
				/>
			) : null}

			<NavItem
				icon={
					<ChatIcon
						width={NAV_ICON_SIZE}
						height={NAV_ICON_SIZE}
						color={messagesActive ? ACTIVE_COLOR : INACTIVE_COLOR}
					/>
				}
				route="/messages"
				isActive={messagesActive}
				onNavigate={handleNavigate}
				badgeCount={totalUnreadCount}
			/>

			<NavItem
				icon={
					<ProfileIcon
						width={NAV_ICON_SIZE}
						height={NAV_ICON_SIZE}
						color={profileActive ? ACTIVE_COLOR : INACTIVE_COLOR}
					/>
				}
				route="/profile"
				isActive={profileActive}
				onNavigate={handleNavigate}
			/>

			<NavItem
				icon={
					<SettingsIcon
						width={NAV_ICON_SIZE}
						height={NAV_ICON_SIZE}
						color={settingsActive ? ACTIVE_COLOR : INACTIVE_COLOR}
					/>
				}
				route="/settings"
				isActive={settingsActive}
				onNavigate={handleNavigate}
				isLast
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	bottomNav: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		width: width,
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingHorizontal: rem(30),
		paddingTop: rem(19),
		paddingBottom: (Platform.OS === 'ios' ? rem(10) : 0) + NAV_EXTRA_HEIGHT,
		backgroundColor: 'rgba(41, 41, 102, 0.96)',
		borderTopLeftRadius: rem(20),
		borderTopRightRadius: rem(20),
		zIndex: 1000,
	},
	navItem: {
		alignItems: 'center',
		flex: 1,
	},
	navItemLast: {
		paddingRight: rem(6),
	},
	iconContainer: {
		position: 'relative',
		width: NAV_ICON_SIZE,
		height: NAV_ICON_SIZE,
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconContainerActive: {},
	badge: {
		position: 'absolute',
		top: -6,
		right: -8,
		width: 18,
		height: 18,
		borderRadius: 9,
		backgroundColor: 'white',
		alignItems: 'center',
		justifyContent: 'center',
	},
	badgeText: {
		fontSize: 8,
		textAlign: 'center',
		lineHeight: 8,
		includeFontPadding: false,
		textAlignVertical: 'center',
		color: colors.primary.blue,
		padding: 0,
		fontFamily: fonts['700'],
	},
	navText: {
		fontSize: fp(12),
		fontFamily: fonts['500'],
		color: '#8E8E93',
	},
	navTextActive: {
		color: ACTIVE_COLOR,
	},
});
