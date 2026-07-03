import React, { useCallback, useState } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	Alert,
	ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
	deactivateUserDevice,
	fetchActiveUserDevices,
	type UserDeviceRow,
} from '@/services/mobileDeviceApi';
import { resolveStableDeviceId } from '@/utils/mobileDeviceIdentity';
import { colors, fonts, rem, fp } from '@/lib';

function formatDeviceLabel(device: UserDeviceRow): string {
	const name = device.deviceName?.trim() || device.model?.trim();
	if (name) {
		return name;
	}
	return device.platform?.trim() || 'Unknown device';
}

function formatDeviceSubtitle(device: UserDeviceRow): string {
	const parts: string[] = [];
	const platform = device.platform?.trim();
	if (platform) {
		parts.push(platform.toUpperCase());
	}
	if (device.osVersion?.trim()) {
		parts.push(device.osVersion.trim());
	}
	if (device.appVersion?.trim()) {
		parts.push(`v${device.appVersion.trim()}`);
	}
	return parts.join(' · ') || '—';
}

export default function UserDevicesSettings() {
	const [devices, setDevices] = useState<UserDeviceRow[]>([]);
	const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const loadDevices = useCallback(async () => {
		setIsLoading(true);
		setLoadError(null);
		try {
			const [rows, deviceId] = await Promise.all([
				fetchActiveUserDevices(),
				resolveStableDeviceId().catch(() => null),
			]);
			setDevices(rows);
			setCurrentDeviceId(deviceId);
		} catch (error) {
			console.error('[UserDevicesSettings] Failed to load devices:', error);
			setLoadError('Failed to load devices');
		} finally {
			setIsLoading(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			void loadDevices();
		}, [loadDevices]),
	);

	const handleDelete = (device: UserDeviceRow) => {
		const label = formatDeviceLabel(device);
		Alert.alert(
			'Remove device',
			`Remove "${label}" from your account? It will disappear from this list.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						setDeletingId(device.id);
						try {
							const ok = await deactivateUserDevice(device.id);
							if (!ok) {
								Alert.alert('Error', 'Failed to remove device');
								return;
							}
							setDevices((prev) => prev.filter((d) => d.id !== device.id));
						} catch (error) {
							console.error('[UserDevicesSettings] Delete failed:', error);
							Alert.alert('Error', 'Failed to remove device');
						} finally {
							setDeletingId(null);
						}
					},
				},
			],
		);
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Devices</Text>
			<Text style={styles.caption}>
				Devices where this account is signed in to the mobile app.
			</Text>

			{isLoading && devices.length === 0 ? (
				<ActivityIndicator
					color={colors.primary.violet}
					style={styles.loader}
				/>
			) : loadError ? (
				<Text style={styles.emptyText}>{loadError}</Text>
			) : devices.length === 0 ? (
				<Text style={styles.emptyText}>No devices found.</Text>
			) : (
				devices.map((device) => {
					const isCurrent =
						!!currentDeviceId &&
						!!device.deviceId &&
						device.deviceId === currentDeviceId;
					const isDeleting = deletingId === device.id;

					return (
						<View key={device.id} style={styles.row}>
							<View style={styles.rowText}>
								<Text style={styles.label}>
									{formatDeviceLabel(device)}
									{isCurrent ? ' (this device)' : ''}
								</Text>
								<Text style={styles.subtitle}>
									{formatDeviceSubtitle(device)}
								</Text>
							</View>
							{!isCurrent ? (
								<TouchableOpacity
									style={[
										styles.button,
										styles.deleteButton,
										isDeleting && styles.buttonDisabled,
									]}
									onPress={() => handleDelete(device)}
									disabled={isDeleting}
									activeOpacity={0.7}
								>
									{isDeleting ? (
										<ActivityIndicator
											color={colors.neutral.white}
											size="small"
										/>
									) : (
										<Text style={styles.buttonText}>Delete</Text>
									)}
								</TouchableOpacity>
							) : null}
						</View>
					);
				})
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		padding: rem(16),
		backgroundColor: 'white',
		marginBottom: rem(12),
		borderRadius: rem(8),
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 1,
		},
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	title: {
		fontFamily: fonts['700'],
		fontSize: fp(18),
		color: colors.primary.blue,
		marginBottom: rem(8),
	},
	caption: {
		fontFamily: fonts['400'],
		fontSize: fp(12),
		color: colors.neutral.darkGrey,
		lineHeight: fp(16),
		marginBottom: rem(12),
	},
	loader: {
		marginVertical: rem(12),
	},
	emptyText: {
		fontFamily: fonts['400'],
		fontSize: fp(14),
		color: colors.neutral.darkGrey,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: rem(12),
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.neutral.lightGrey,
	},
	rowText: {
		flex: 1,
		marginRight: rem(12),
	},
	label: {
		fontFamily: fonts['600'],
		fontSize: fp(15),
		color: colors.primary.blue,
		marginBottom: rem(4),
	},
	subtitle: {
		fontFamily: fonts['400'],
		fontSize: fp(12),
		color: colors.neutral.darkGrey,
		lineHeight: fp(16),
	},
	button: {
		paddingVertical: rem(10),
		paddingHorizontal: rem(16),
		borderRadius: rem(8),
		alignItems: 'center',
		justifyContent: 'center',
		minWidth: rem(90),
	},
	deleteButton: {
		backgroundColor: '#FF3B30',
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	buttonText: {
		color: '#FFFFFF',
		fontSize: fp(13),
		fontWeight: '600',
	},
});
