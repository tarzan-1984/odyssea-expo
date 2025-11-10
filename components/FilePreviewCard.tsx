"use client";

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fonts, fp, rem } from '@/lib';

type Props = {
	fileUrl: string;
	fileName?: string;
	fileSize?: number;
	isSender: boolean;
};

export default function FilePreviewCard({ fileUrl, fileName, fileSize, isSender }: Props) {
	const name = fileName || 'Attachment';
	const ext = name.toLowerCase().split('.').pop() || '';
	const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
	const isPdf = ext === 'pdf';
	const isDoc = ext === 'doc' || ext === 'docx';
	const isTxt = ext === 'txt';

	const [txtContent, setTxtContent] = useState<string>('');
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>('');

	useEffect(() => {
		let mounted = true;
		if (isTxt) {
			setLoading(true);
			fetch(fileUrl)
				.then(r => r.text())
				.then(t => {
					if (mounted) setTxtContent(t);
				})
				.catch(() => {
					if (mounted) setError('Failed to load preview');
				})
				.finally(() => {
					if (mounted) setLoading(false);
				});
		}
		return () => {
			mounted = false;
		};
	}, [fileUrl, isTxt]);

	const header = (
		<View style={styles.previewHeader}>
			<View style={styles.previewHeaderIcon} />
			<Text style={styles.previewHeaderTitle} numberOfLines={1}>
				{name}
			</Text>
			{typeof fileSize === 'number' ? (
				<Text style={styles.previewHeaderSize}>({Math.round(fileSize / 1024)}KB)</Text>
			) : null}
		</View>
	);

	const downloadButton = (
		<TouchableOpacity
			onPress={() => Linking.openURL(fileUrl).catch(() => {})}
			activeOpacity={0.8}
			style={styles.previewDownloadBtn}
		>
			<Text style={styles.previewDownloadText}>Download</Text>
		</TouchableOpacity>
	);

	let body: React.ReactNode = null;
	if (isImage) {
		body = (
			<Image
				source={{ uri: fileUrl }}
				style={styles.previewImage}
				resizeMode="cover"
			/>
		);
	} else if (isPdf) {
		body = (
			<View style={styles.previewWebviewWrap}>
				<WebView
					source={{ uri: `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH` }}
					style={styles.previewWebview}
					javaScriptEnabled
					setSupportMultipleWindows={false}
				/>
			</View>
		);
	} else if (isDoc) {
		const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
		body = (
			<View style={styles.previewWebviewWrap}>
				<WebView
					source={{ uri: officeUrl }}
					style={styles.previewWebview}
					javaScriptEnabled
					setSupportMultipleWindows={false}
				/>
			</View>
		);
	} else if (isTxt) {
		body = (
			<View style={styles.previewTextWrap}>
				{loading ? (
					<ActivityIndicator size="small" color={colors.primary.violet} />
				) : error ? (
					<Text style={styles.previewErrorText}>{error}</Text>
				) : (
					<ScrollView style={{ maxHeight: rem(180) }}>
						<Text style={styles.previewText}>{txtContent}</Text>
					</ScrollView>
				)}
			</View>
		);
	} else {
		// Fallback: simple attachment row
		return (
			<TouchableOpacity
				onPress={() => Linking.openURL(fileUrl).catch(() => {})}
				activeOpacity={0.7}
				style={[
					styles.fallbackAttachment,
					{ backgroundColor: isSender ? 'rgba(255,255,255,0.15)' : 'rgba(96,102,197,0.08)' },
				]}
			>
				<Text style={[styles.fallbackAttachmentText, { color: isSender ? colors.neutral.white : colors.primary.blue }]}>
					{name}
				</Text>
			</TouchableOpacity>
		);
	}

	return (
		<View style={styles.previewCard}>
			{header}
			<View style={styles.previewBody}>{body}</View>
			<View style={styles.previewFooter}>{downloadButton}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	previewCard: {
		width: rem(260),
		borderWidth: 1,
		borderColor: 'rgba(41,41,102,0.15)',
		borderRadius: rem(10),
		overflow: 'hidden',
		backgroundColor: 'rgba(255,255,255,0.96)',
		marginBottom: rem(6),
	},
	previewHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: rem(10),
		paddingVertical: rem(8),
		backgroundColor: 'rgba(247, 248, 255, 1)',
		gap: rem(8),
	},
	previewHeaderIcon: {
		width: rem(16),
		height: rem(16),
		borderRadius: rem(3),
		backgroundColor: colors.primary.blue,
		opacity: 0.5,
	},
	previewHeaderTitle: {
		flex: 1,
		fontSize: fp(12),
		fontFamily: fonts['600'],
		color: colors.primary.blue,
	},
	previewHeaderSize: {
		fontSize: fp(11),
		color: colors.neutral.darkGrey,
	},
	previewBody: {
		padding: rem(10),
		backgroundColor: 'white',
	},
	previewImage: {
		width: '100%',
		height: rem(180),
		borderRadius: rem(8),
	},
	previewWebviewWrap: {
		width: '100%',
		height: rem(220),
		borderRadius: rem(8),
		overflow: 'hidden',
		borderWidth: 1,
		borderColor: 'rgba(41,41,102,0.15)',
	},
	previewWebview: {
		flex: 1,
		backgroundColor: 'white',
	},
	previewTextWrap: {
		borderRadius: rem(8),
		borderWidth: 1,
		borderColor: 'rgba(41,41,102,0.15)',
		padding: rem(10),
	},
	previewText: {
		fontSize: fp(12),
		fontFamily: fonts['400'],
		color: colors.primary.blue,
	},
	previewErrorText: {
		fontSize: fp(12),
		color: colors.semantic.error,
	},
	previewFooter: {
		paddingHorizontal: rem(10),
		paddingVertical: rem(8),
		borderTopWidth: 1,
		borderTopColor: 'rgba(41,41,102,0.12)',
		backgroundColor: 'rgba(247, 248, 255, 1)',
	},
	previewDownloadBtn: {
		backgroundColor: colors.primary.violet,
		borderRadius: rem(10),
		paddingVertical: rem(10),
		alignItems: 'center',
	},
	previewDownloadText: {
		color: colors.neutral.white,
		fontFamily: fonts['600'],
		fontSize: fp(14),
	},
	fallbackAttachment: {
		paddingVertical: rem(10),
		paddingHorizontal: rem(12),
		borderRadius: rem(8),
	},
	fallbackAttachmentText: {
		fontSize: fp(14),
		fontFamily: fonts['600'],
	},
});


