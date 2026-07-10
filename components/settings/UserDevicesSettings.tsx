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
	deactivateOtherUserDevices,
	deactivateUserDevice,
	fetchActiveUserDevices,
	type UserDeviceRow,
} from '@/services/mobileDeviceApi';
import { resolveStableDeviceId } from '@/utils/mobileDeviceIdentity';
import { colors, fonts, rem, fp } from '@/lib';

function formatDeviceName(device: UserDeviceRow): string {
	const name = device.deviceName?.trim();
	if (name) {
		return name;
	}
	return device.platform?.trim() || 'Unknown device';
}

function formatDeviceModel(device: UserDeviceRow): string | null {
	const model = device.model?.trim();
	return model || null;
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

function formatDeviceLabel(device: UserDeviceRow): string {
	return formatDeviceName(device);
}

export default function UserDevicesSettings() {
	const [devices, setDevices] = useState<UserDeviceRow[]>([]);
	const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [isDeletingOthers, setIsDeletingOthers] = useState(false);

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
		const model = formatDeviceModel(device);
		const displayLabel = model ? `${label} (${model})` : label;
		Alert.alert(
			'Remove device',
			`Remove "${displayLabel}" from your account? It will disappear from this list.`,
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

	const handleDeleteOthers = (currentDevice: UserDeviceRow, otherCount: number) => {
		Alert.alert(
			'Remove other devices',
			`Remove ${otherCount} other device${otherCount === 1 ? '' : 's'} from your account? They will be signed out.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete others',
					style: 'destructive',
					onPress: async () => {
						setIsDeletingOthers(true);
						try {
							const result = await deactivateOtherUserDevices(currentDevice.id);
							if (!result) {
								Alert.alert('Error', 'Failed to remove other devices');
								return;
							}
							setDevices((prev) =>
								prev.filter((device) => device.id === currentDevice.id),
							);
						} catch (error) {
							console.error('[UserDevicesSettings] Delete others failed:', error);
							Alert.alert('Error', 'Failed to remove other devices');
						} finally {
							setIsDeletingOthers(false);
						}
					},
				},
			],
		);
	};

	const otherDevicesCount = devices.filter((device) => {
		if (!currentDeviceId || !device.deviceId) {
			return true;
		}
		return device.deviceId !== currentDeviceId;
	}).length;

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
					const model = formatDeviceModel(device);

					return (
						<View key={device.id} style={styles.row}>
							<View style={styles.rowText}>
								<Text style={styles.label}>
									{formatDeviceName(device)}
									{isCurrent ? ' (this device)' : ''}
								</Text>
								{model ? (
									<Text style={styles.model}>{model}</Text>
								) : null}
								<Text style={styles.subtitle}>
									{formatDeviceSubtitle(device)}
								</Text>
							</View>
							{isCurrent && otherDevicesCount > 0 ? (
								<TouchableOpacity
									style={[
										styles.button,
										styles.deleteOthersButton,
										isDeletingOthers && styles.buttonDisabled,
									]}
									onPress={() => handleDeleteOthers(device, otherDevicesCount)}
									disabled={isDeletingOthers || isDeleting}
									activeOpacity={0.7}
								>
									{isDeletingOthers ? (
										<ActivityIndicator
											color={colors.neutral.white}
											size="small"
										/>
									) : (
										<Text style={styles.buttonText}>Delete others</Text>
									)}
								</TouchableOpacity>
							) : !isCurrent ? (
								<TouchableOpacity
									style={[
										styles.button,
										styles.deleteButton,
										isDeleting && styles.buttonDisabled,
									]}
									onPress={() => handleDelete(device)}
									disabled={isDeleting || isDeletingOthers}
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
	model: {
		fontFamily: fonts['500'],
		fontSize: fp(13),
		color: colors.neutral.darkGrey,
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
		paddingHorizontal: rem(12),
		borderRadius: rem(8),
		alignItems: 'center',
		justifyContent: 'center',
		minWidth: rem(90),
	},
	deleteButton: {
		backgroundColor: '#FF3B30',
	},
	deleteOthersButton: {
		backgroundColor: '#FF3B30',
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	buttonText: {
		color: '#FFFFFF',
		fontSize: fp(12),
		fontWeight: '600',
		textAlign: 'center',
	},
});
