"use client";

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActionSheetIOS, Platform, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { openLocalFile } from '@/utils/fileOpener';
import { colors, fonts, fp, rem } from '@/lib';
import FileIcon from '@/icons/FileIcon';
import FileViewerModal from '@/components/modals/FileViewerModal';

type Props = {
	fileUrl: string;
	fileName?: string;
	fileSize?: number;
	isSender: boolean;
	createdAt?: string; // Optional date to display next to file size
};

// Helper function to determine MIME type
const getMimeType = (extension: string): string => {
	const mimeTypes: { [key: string]: string } = {
		pdf: 'application/pdf',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		xls: 'application/vnd.ms-excel',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		txt: 'text/plain',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		heic: 'image/heic',
		heif: 'image/heif',
		bmp: 'image/bmp',
		tiff: 'image/tiff',
		zip: 'application/zip',
		rar: 'application/x-rar-compressed',
	};
	return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
};

let activeImageOpenCancel: (() => void) | null = null;
let imageOpenRequestId = 0;

export default function FilePreviewCard({ fileUrl, fileName, fileSize, isSender, createdAt }: Props) {
	const name = fileName || 'Attachment';
	const ext = name.toLowerCase().split('.').pop() || '';
	const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'].includes(ext);
	const isPdf = ext === 'pdf';
	const needsLocalImageOpen = ['heic', 'heif'].includes(ext);
	
	const [isDownloading, setIsDownloading] = useState(false);
	const [viewerVisible, setViewerVisible] = useState(false);
	const [downloadedFileUri, setDownloadedFileUri] = useState<string | null>(null);
	const activeRequestIdRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (activeImageOpenCancel && activeRequestIdRef.current !== null) {
				activeImageOpenCancel();
			}
		};
	}, []);

	const handleOpenFile = async (fileUri: string) => {
		// For all files (except images and PDF which open in modal), open with system app
		try {
			await openLocalFile(fileUri, name);
		} catch (error) {
			console.error('Failed to open file with system app:', error);
			Alert.alert(
				'Error',
				'Failed to open file. Please try using Share to open it in another app.',
				[{ text: 'OK' }]
			);
		}
	};

	const handleShare = async (fileUri: string) => {
		try {
			const isAvailable = await Sharing.isAvailableAsync();
			if (isAvailable) {
				await Sharing.shareAsync(fileUri, {
					mimeType: getMimeType(ext),
					dialogTitle: `Share ${name}`,
				});
			} else {
				Alert.alert(
					'Sharing not available',
					'Sharing is not available on this device.',
					[{ text: 'OK' }]
				);
			}
		} catch (error) {
			console.error('Failed to share file:', error);
		}
	};

	const handleFileAction = async () => {
		if (isDownloading) return;

		if (isImage && !needsLocalImageOpen) {
			activeImageOpenCancel?.();
			activeImageOpenCancel = null;
			setDownloadedFileUri(fileUrl);
			setViewerVisible(true);
			return;
		}

		let requestId: number | null = null;
		let isCancelled = false;
		let downloadResumable: ReturnType<typeof FileSystem.createDownloadResumable> | null = null;
		
		try {
			if (isImage) {
				activeImageOpenCancel?.();
				requestId = ++imageOpenRequestId;
				activeRequestIdRef.current = requestId;
				activeImageOpenCancel = () => {
					isCancelled = true;
					downloadResumable?.pauseAsync().catch(() => {});
					if (activeRequestIdRef.current === requestId) {
						activeRequestIdRef.current = null;
						setIsDownloading(false);
					}
				};
			}

			setIsDownloading(true);
			
			// File name already contains extension, use it as is
			// Clean name from invalid characters for file system
			const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const localFileName = sanitizedName || 'file';
			
			// Path for saving file
			const fileUri = `${FileSystem.documentDirectory}${localFileName}`;
			
			// Download file
			downloadResumable = FileSystem.createDownloadResumable(fileUrl, fileUri);
			const downloadResult = await downloadResumable.downloadAsync();

			if (isCancelled) return;

			if (!downloadResult) {
				throw new Error('Download was interrupted');
			}
			
			if (downloadResult.status === 200) {
				const downloadedUri = downloadResult.uri;
				
				// For images and PDF, directly open in viewer modal
				if (isImage || isPdf) {
					setDownloadedFileUri(downloadedUri);
					setViewerVisible(true);
				} else {
					// For other files, show ActionSheet with options
					if (Platform.OS === 'ios') {
						ActionSheetIOS.showActionSheetWithOptions(
							{
								options: ['Cancel', 'Open', 'Share'],
								cancelButtonIndex: 0,
							},
							(buttonIndex) => {
								if (buttonIndex === 1) {
									// Open
									handleOpenFile(downloadedUri);
								} else if (buttonIndex === 2) {
									// Share
									handleShare(downloadedUri);
								}
							}
						);
					} else {
						// On Android, show Alert with options
						Alert.alert(
							'File',
							'What would you like to do?',
							[
								{ text: 'Cancel', style: 'cancel' },
								{ text: 'Open', onPress: () => handleOpenFile(downloadedUri) },
								{ text: 'Share', onPress: () => handleShare(downloadedUri) },
							]
						);
					}
				}
			} else {
				throw new Error(`Download failed with status ${downloadResult.status}`);
			}
		} catch (error) {
			if (isCancelled) return;
			console.error('Failed to download file:', error);
			Alert.alert(
				'Error',
				'Failed to download file. Please try again.',
				[{ text: 'OK' }]
			);
		} finally {
			if (!isCancelled) {
				setIsDownloading(false);
			}
			if (requestId !== null && activeRequestIdRef.current === requestId) {
				activeRequestIdRef.current = null;
				if (activeImageOpenCancel) {
					activeImageOpenCancel = null;
				}
			}
		}
	};

	// Show preview for images
	if (isImage) {
		return (
			<>
				<TouchableOpacity
					onPress={handleFileAction}
					activeOpacity={0.9}
					style={styles.imageCard}
				>
					<Image
						source={{ uri: fileUrl }}
						style={styles.previewImage}
						resizeMode="cover"
					/>
					{isDownloading ? (
						<View style={styles.imageLoadingOverlay}>
							<ActivityIndicator size="large" color={colors.neutral.white} />
						</View>
					) : null}
				</TouchableOpacity>
				{downloadedFileUri && (
					<FileViewerModal
						visible={viewerVisible}
						fileUri={downloadedFileUri}
						fileName={name}
						originalUrl={fileUrl}
						onClose={() => {
							setViewerVisible(false);
							setDownloadedFileUri(null);
						}}
					/>
				)}
			</>
		);
	}

	// For all other files - only card with icon and name
	return (
		<>
			<TouchableOpacity
				onPress={handleFileAction}
				activeOpacity={0.7}
				style={[
					styles.fileCard,
					isSender ? styles.fileCardSender : styles.fileCardOther,
				]}
			>
				<View style={styles.fileIconContainer}>
					<FileIcon width={rem(40)} height={rem(40)} color={isSender ? colors.neutral.white : colors.primary.blue} />
				</View>
				<View style={styles.fileInfo}>
					<Text 
						style={[
							styles.fileName,
							isSender ? styles.fileNameSender : styles.fileNameOther,
						]}
						numberOfLines={1}
					>
						{name}
					</Text>
					{typeof fileSize === 'number' && (
						<Text 
							style={[
								styles.fileSize,
								isSender ? styles.fileSizeSender : styles.fileSizeOther,
							]}
						>
							{Math.round(fileSize / 1024)}KB{createdAt ? ` • ${new Date(createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
						</Text>
					)}
				</View>
			</TouchableOpacity>
			{downloadedFileUri && (
				<FileViewerModal
					visible={viewerVisible}
					fileUri={downloadedFileUri}
					fileName={name}
					originalUrl={fileUrl}
					onClose={() => {
						setViewerVisible(false);
						setDownloadedFileUri(null);
					}}
				/>
			)}
		</>
	);
}

const styles = StyleSheet.create({
	// Card for images
	imageCard: {
		width: rem(260),
		borderRadius: rem(10),
		overflow: 'hidden',
		marginBottom: rem(6),
		position: 'relative',
	},
	previewImage: {
		width: '100%',
		height: rem(180),
		borderRadius: rem(8),
	},
	imageLoadingOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.35)',
	},
	// Card for files (not images)
	fileCard: {
		width: rem(260),
		flexDirection: 'row',
		alignItems: 'center',
		padding: rem(12),
		borderRadius: rem(10),
		marginBottom: rem(6),
		gap: rem(12),
	},
	fileCardSender: {
		backgroundColor: 'rgba(255, 255, 255, 0.15)',
	},
	fileCardOther: {
		backgroundColor: 'rgba(96, 102, 197, 0.08)',
	},
	fileIconContainer: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	fileInfo: {
		flex: 1,
		justifyContent: 'center',
	},
	fileName: {
		fontSize: fp(14),
		fontFamily: fonts['600'],
		marginBottom: rem(4),
	},
	fileNameSender: {
		color: colors.neutral.white,
	},
	fileNameOther: {
		color: colors.primary.blue,
	},
	fileSize: {
		fontSize: fp(12),
		fontFamily: fonts['400'],
	},
	fileSizeSender: {
		color: 'rgba(255, 255, 255, 0.7)',
	},
	fileSizeOther: {
		color: 'rgba(41, 41, 102, 0.6)',
	},
});


