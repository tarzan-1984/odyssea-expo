import React from 'react';
import {
	View,
	Text,
	StyleSheet,
	Image,
	ActivityIndicator,
} from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import type { PendingLocalAttachment, PendingOutgoingStatus } from '@/utils/optimisticChatMessage';

type Props = {
	localAttachments: PendingLocalAttachment[];
	status: PendingOutgoingStatus;
	isSender: boolean;
};

function isImageAttachment(fileName: string, mimeType?: string): boolean {
	const mime = String(mimeType || '').toLowerCase();
	if (mime.startsWith('image/')) return true;
	const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp'].includes(ext);
}

export default function PendingOutgoingMedia({ localAttachments, status, isSender }: Props) {
	const isMulti = localAttachments.length >= 2;

	const doneCount = localAttachments.filter((a) => a.uploadStatus === 'done').length;
	const showUploadProgress = status === 'uploading';
	const statusLabel =
		status === 'failed'
			? 'Failed to send'
			: status === 'sending'
				? 'Sending...'
				: `Uploading ${doneCount}/${localAttachments.length}`;

	return (
		<View style={styles.root}>
			<View style={[styles.grid, isMulti ? styles.gridMulti : styles.gridSingle]}>
				{localAttachments.map((item, index) => {
					const showImage = isImageAttachment(item.fileName, item.mimeType);
					const cellUploading =
						item.uploadStatus === 'uploading' || item.uploadStatus === 'pending';
					const showCellSpinner = showUploadProgress && cellUploading;

					return (
						<View
							key={`${item.localUri}-${index}`}
							style={[styles.cell, isMulti ? styles.cellMulti : styles.cellSingle]}
						>
							{showImage ? (
								<Image source={{ uri: item.localUri }} style={styles.image} resizeMode="cover" />
							) : (
								<View style={styles.fileFallback}>
									<Text style={styles.fileName} numberOfLines={2}>
										{item.fileName}
									</Text>
								</View>
							)}
							{showCellSpinner ? (
								<View style={styles.overlay}>
									<ActivityIndicator
										size="small"
										color={isSender ? colors.neutral.white : colors.primary.violet}
									/>
								</View>
							) : null}
							{status === 'failed' ? (
								<View style={[styles.overlay, styles.failedOverlay]}>
									<Text style={styles.failedText}>!</Text>
								</View>
							) : null}
						</View>
					);
				})}
			</View>
			{(showUploadProgress || status === 'sending') && (
				<View style={styles.statusRow}>
					{status === 'sending' ? (
						<ActivityIndicator
							size="small"
							color={isSender ? colors.neutral.white : colors.primary.violet}
						/>
					) : null}
					<Text
						numberOfLines={1}
						style={[
							styles.statusText,
							isSender ? styles.statusTextSender : styles.statusTextOther,
						]}
					>
						{statusLabel}
					</Text>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		width: '100%',
		maxWidth: '100%',
		overflow: 'hidden',
	},
	grid: {
		width: '100%',
		maxWidth: '100%',
	},
	gridSingle: {},
	gridMulti: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		columnGap: rem(6),
		rowGap: rem(8),
	},
	cell: {
		overflow: 'hidden',
		borderRadius: rem(8),
		backgroundColor: colors.neutral.lightGrey,
	},
	cellSingle: {
		width: rem(260),
		maxWidth: '100%',
		height: rem(180),
	},
	cellMulti: {
		width: '48%',
		maxWidth: '48%',
		height: rem(104),
		borderRadius: rem(6),
	},
	image: {
		width: '100%',
		height: '100%',
	},
	fileFallback: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: rem(8),
	},
	fileName: {
		fontSize: fp(12),
		fontFamily: fonts['400'],
		color: colors.primary.blue,
		textAlign: 'center',
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0, 0, 0, 0.35)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	failedOverlay: {
		backgroundColor: 'rgba(239, 68, 68, 0.28)',
	},
	failedText: {
		fontSize: fp(18),
		fontFamily: fonts['700'],
		color: colors.neutral.white,
	},
	statusRow: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: rem(6),
		marginTop: rem(6),
		flexShrink: 0,
	},
	statusText: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		flexShrink: 0,
	},
	statusTextSender: {
		color: 'rgba(255, 255, 255, 0.85)',
	},
	statusTextOther: {
		color: 'rgba(41, 41, 102, 0.7)',
	},
});
