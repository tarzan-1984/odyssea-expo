"use client";

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors, fonts, fp, rem } from '@/lib';
import FileIcon from '@/icons/FileIcon';

type Props = {
	fileUrl: string;
	fileName?: string;
	fileSize?: number;
	isSender: boolean;
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
		zip: 'application/zip',
		rar: 'application/x-rar-compressed',
	};
	return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
};

export default function FilePreviewCard({ fileUrl, fileName, fileSize, isSender }: Props) {
	const name = fileName || 'Attachment';
	const ext = name.toLowerCase().split('.').pop() || '';
	const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
	const [isDownloading, setIsDownloading] = useState(false);

	const handleDownload = async () => {
		if (isDownloading) return;
		
		try {
			setIsDownloading(true);
			
			// File name already contains extension, use it as is
			// Clean name from invalid characters for file system
			const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const localFileName = sanitizedName || 'file';
			
			// Path for saving file
			const fileUri = `${FileSystem.documentDirectory}${localFileName}`;
			
			// Download file
			const downloadResult = await FileSystem.downloadAsync(fileUrl, fileUri);
			
			if (downloadResult.status === 200) {
				// Check if Sharing API is available
				const isAvailable = await Sharing.isAvailableAsync();
				
				if (isAvailable) {
					// Open dialog for saving/opening file
					await Sharing.shareAsync(downloadResult.uri, {
						mimeType: getMimeType(ext),
						dialogTitle: `Save ${name}`,
					});
				} else {
					// If Sharing is not available, show success message
					Alert.alert(
						'Downloaded',
						`File "${name}" has been downloaded successfully.`,
						[{ text: 'OK' }]
					);
				}
			} else {
				throw new Error(`Download failed with status ${downloadResult.status}`);
			}
		} catch (error) {
			console.error('Failed to download file:', error);
			Alert.alert(
				'Error',
				'Failed to download file. Please try again.',
				[{ text: 'OK' }]
			);
		} finally {
			setIsDownloading(false);
		}
	};

	// Show preview for images
	if (isImage) {
		return (
			<TouchableOpacity
				onPress={handleDownload}
				activeOpacity={0.9}
				style={styles.imageCard}
			>
				<Image
					source={{ uri: fileUrl }}
					style={styles.previewImage}
					resizeMode="cover"
				/>
			</TouchableOpacity>
		);
	}

	// For all other files - only card with icon and name
	return (
		<TouchableOpacity
			onPress={handleDownload}
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
						{Math.round(fileSize / 1024)}KB
					</Text>
				)}
			</View>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	// Card for images
	imageCard: {
		width: rem(260),
		borderRadius: rem(10),
		overflow: 'hidden',
		marginBottom: rem(6),
	},
	previewImage: {
		width: '100%',
		height: rem(180),
		borderRadius: rem(8),
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


