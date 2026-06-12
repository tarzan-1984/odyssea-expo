"use client";

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActionSheetIOS, Platform, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { openLocalFile } from '@/utils/fileOpener';
import { colors, fonts, fp, rem } from '@/lib';
import FileIcon from '@/icons/FileIcon';
import FileViewerModal from '@/components/modals/FileViewerModal';
import { imageCacheService } from '@/services/ImageCacheService';
import { secureStorage } from '@/utils/secureStorage';
import { getHeicConvertApiUrl, toJpegFilename } from '@/utils/heicUpload';
import {
	prefetchChatImageThumbnail,
	getChatImageThumbnailUrl,
	isChatImageThumbnailUrl,
	isChatImageThumbnailCandidate,
} from '@/utils/chatImageThumbnail';
import ChatMediaPreviewPlaceholder from '@/components/chat/ChatMediaPreviewPlaceholder';

const INLINE_IMAGE_LOAD_TIMEOUT_MS = 30_000;
/** If onLoad/onLoadEnd never fire (cache / remount race), probe with getSize. */
const INLINE_IMAGE_CACHE_FALLBACK_MS = 1_500;

function formatFileSizeKb(fileSize?: number): string | null {
	if (typeof fileSize !== 'number' || Number.isNaN(fileSize)) return null;
	return `${Math.round(fileSize / 1024)}KB`;
}

type Props = {
	fileUrl: string;
	fileName?: string;
	fileSize?: number;
	isSender: boolean;
	createdAt?: string; // Optional date to display next to file size
	/** Compact width for multi-attach grid (2 per row in chat). */
	variant?: 'default' | 'gridCell';
	/** When false, show placeholder until the message is in the chat viewport. */
	shouldLoadMedia?: boolean;
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

const getCachedHeicFileUri = async (params: {
	fileUrl: string;
	fileName: string;
	signal?: AbortSignal;
}): Promise<string> => {
	const { fileUrl, fileName, signal } = params;
	const jpegName = toJpegFilename(fileName);
	const localFileUri = imageCacheService.getHeicCacheUri(fileUrl, jpegName);
	const accessToken = await secureStorage.getItemAsync('accessToken').catch(() => null);
	const downloadUrl = getHeicConvertApiUrl(fileUrl);
	const downloadHeaders = accessToken
		? { Authorization: `Bearer ${accessToken}` }
		: undefined;

	const existingFile = await FileSystem.getInfoAsync(localFileUri);
	if (existingFile.exists) {
		return localFileUri;
	}

	await imageCacheService.ensureHeicCacheDirectory();

	const downloadResumable = FileSystem.createDownloadResumable(
		downloadUrl,
		localFileUri,
		downloadHeaders ? { headers: downloadHeaders } : undefined
	);
	const abortDownload = () => {
		downloadResumable.pauseAsync().catch(() => {});
	};

	signal?.addEventListener('abort', abortDownload);
	try {
		if (signal?.aborted) {
			throw new Error('Download was cancelled');
		}

		const result = await downloadResumable.downloadAsync();
		if (signal?.aborted) {
			throw new Error('Download was cancelled');
		}

		if (!result || result.status !== 200) {
			throw new Error(`Download failed with status ${result?.status ?? 'unknown'}`);
		}

		return result.uri;
	} finally {
		signal?.removeEventListener('abort', abortDownload);
	}
};

export default function FilePreviewCard({
	fileUrl,
	fileName,
	fileSize,
	isSender,
	createdAt,
	variant = 'default',
	shouldLoadMedia = true,
}: Props) {
	const queryClient = useQueryClient();
	const name = fileName || 'Attachment';
	const ext = name.toLowerCase().split('.').pop() || '';
	const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'].includes(ext);
	const isPdf = ext === 'pdf';
	const needsLocalImageOpen = ['heic', 'heif'].includes(ext);
	
	const [isDownloading, setIsDownloading] = useState(false);
	const [viewerVisible, setViewerVisible] = useState(false);
	const [downloadedFileUri, setDownloadedFileUri] = useState<string | null>(null);
	const [heicPreviewSource, setHeicPreviewSource] = useState<{ uri: string; headers?: { Authorization: string } } | null>(null);
	const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
	const [hasImageLoaded, setHasImageLoaded] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null);
	const thumbEnsureAttemptedRef = useRef(false);
	const heicConvertAttemptedRef = useRef(false);
	const activeRequestIdRef = useRef<number | null>(null);
	const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const heicCacheQueryKey = [...imageCacheService.heicQueryKeyPrefix, fileUrl, name] as const;
	const heicLocalFileQuery = useQuery({
		queryKey: heicCacheQueryKey,
		queryFn: ({ signal }) => getCachedHeicFileUri({ fileUrl, fileName: name, signal }),
		enabled: false,
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
	});

	useEffect(() => {
		return () => {
			if (activeImageOpenCancel && activeRequestIdRef.current !== null) {
				activeImageOpenCancel();
			}
		};
	}, []);

	const clearLoadTimeout = () => {
		if (loadTimeoutRef.current) {
			clearTimeout(loadTimeoutRef.current);
			loadTimeoutRef.current = null;
		}
	};

	const resetInlineImageState = () => {
		clearLoadTimeout();
		setHasImageLoaded(false);
		setLoadError(null);
		setImageDimensions(null);
	};

	useEffect(() => {
		return () => {
			clearLoadTimeout();
		};
	}, []);

	useEffect(() => {
		thumbEnsureAttemptedRef.current = false;
		heicConvertAttemptedRef.current = false;
		resetInlineImageState();
		setPreviewImageUri(null);
		setHeicPreviewSource(null);
	}, [fileUrl, name]);

	useEffect(() => {
		if (!shouldLoadMedia) {
			return;
		}
		if (previewImageUri || heicPreviewSource) {
			return;
		}

		let cancelled = false;

		const loadPreview = async () => {
			const thumbUrl = getChatImageThumbnailUrl(fileUrl, name);

			if (needsLocalImageOpen) {
				if (thumbUrl) {
					setPreviewImageUri(thumbUrl);
					prefetchChatImageThumbnail(fileUrl, name);
					return;
				}

				const accessToken = await secureStorage.getItemAsync('accessToken').catch(() => null);
				if (cancelled) return;
				heicConvertAttemptedRef.current = true;
				setHeicPreviewSource({
					uri: getHeicConvertApiUrl(fileUrl),
					headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
				});
				prefetchChatImageThumbnail(fileUrl, name);
				return;
			}

			if (thumbUrl && isChatImageThumbnailCandidate(name)) {
				setPreviewImageUri(thumbUrl);
				prefetchChatImageThumbnail(fileUrl, name);
			} else {
				setPreviewImageUri(fileUrl);
				if (isChatImageThumbnailCandidate(name)) {
					prefetchChatImageThumbnail(fileUrl, name);
				}
			}
		};

		loadPreview().catch(() => {
			if (!cancelled) {
				setPreviewImageUri(fileUrl);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [
		shouldLoadMedia,
		fileUrl,
		name,
		needsLocalImageOpen,
		previewImageUri,
		heicPreviewSource,
	]);

	useEffect(() => {
		if (!shouldLoadMedia || hasImageLoaded || loadError) {
			return;
		}

		// Auth-protected HEIC convert URLs cannot be probed with Image.getSize.
		const probeUri = needsLocalImageOpen
			? heicPreviewSource
				? null
				: previewImageUri
			: previewImageUri;

		if (!probeUri) {
			return;
		}

		let cancelled = false;
		const timer = setTimeout(() => {
			if (cancelled) return;
			Image.getSize(
				probeUri,
				(width, height) => {
					if (cancelled) return;
					clearLoadTimeout();
					if (width && height) {
						setImageDimensions({ w: width, h: height });
					}
					setHasImageLoaded(true);
					setLoadError(null);
				},
				() => {}
			);
		}, INLINE_IMAGE_CACHE_FALLBACK_MS);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [
		shouldLoadMedia,
		hasImageLoaded,
		loadError,
		needsLocalImageOpen,
		heicPreviewSource,
		previewImageUri,
	]);

	useEffect(() => {
		if (!shouldLoadMedia || hasImageLoaded || loadError) {
			clearLoadTimeout();
			return;
		}

		const imageSource = needsLocalImageOpen
			? heicPreviewSource ?? (previewImageUri ? { uri: previewImageUri } : null)
			: previewImageUri
				? { uri: previewImageUri }
				: null;

		if (!imageSource) {
			return;
		}

		clearLoadTimeout();
		loadTimeoutRef.current = setTimeout(() => {
			setLoadError('Failed to load image preview');
		}, INLINE_IMAGE_LOAD_TIMEOUT_MS);

		return clearLoadTimeout;
	}, [
		shouldLoadMedia,
		hasImageLoaded,
		loadError,
		needsLocalImageOpen,
		heicPreviewSource,
		previewImageUri,
	]);

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
			if (needsLocalImageOpen) {
				activeImageOpenCancel?.();
				requestId = ++imageOpenRequestId;
				activeRequestIdRef.current = requestId;
				activeImageOpenCancel = () => {
					isCancelled = true;
					queryClient.cancelQueries({ queryKey: heicCacheQueryKey }).catch(() => {});
					if (activeRequestIdRef.current === requestId) {
						activeRequestIdRef.current = null;
						setIsDownloading(false);
					}
				};
			} else if (isImage) {
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

			if (needsLocalImageOpen) {
				const cachedFileUri = heicLocalFileQuery.data;
				if (cachedFileUri) {
					const cachedFileInfo = await FileSystem.getInfoAsync(cachedFileUri);
					if (cachedFileInfo.exists) {
						if (isCancelled) return;
						setDownloadedFileUri(cachedFileUri);
						setViewerVisible(true);
						return;
					}
				}

				const result = await heicLocalFileQuery.refetch();
				if (isCancelled) return;

				if (result.error || !result.data) {
					throw result.error || new Error('Failed to load cached HEIC image');
				}

				setDownloadedFileUri(result.data);
				setViewerVisible(true);
				return;
			}
			
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

	const isGridCell = variant === 'gridCell';

	const tryHeicConvertPreview = () => {
		if (heicConvertAttemptedRef.current) {
			return false;
		}
		heicConvertAttemptedRef.current = true;
		resetInlineImageState();
		void (async () => {
			const accessToken = await secureStorage.getItemAsync('accessToken').catch(() => null);
			setHeicPreviewSource({
				uri: getHeicConvertApiUrl(fileUrl),
				headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
			});
		})();
		return true;
	};

	const handlePreviewImageError = (failedUri?: string) => {
		clearLoadTimeout();
		resetInlineImageState();

		if (
			failedUri &&
			isChatImageThumbnailUrl(failedUri) &&
			!thumbEnsureAttemptedRef.current
		) {
			thumbEnsureAttemptedRef.current = true;
			prefetchChatImageThumbnail(fileUrl, name);

			if (needsLocalImageOpen && tryHeicConvertPreview()) {
				return;
			}
			if (failedUri !== fileUrl) {
				setPreviewImageUri(fileUrl);
				return;
			}
			setLoadError('Failed to load image preview');
			return;
		}

		if (needsLocalImageOpen && tryHeicConvertPreview()) {
			return;
		}

		if (failedUri !== fileUrl) {
			setPreviewImageUri(fileUrl);
			return;
		}

		setLoadError('Failed to load image preview');
	};

	const handleInlineImageLoad = (event?: {
		nativeEvent?: { source?: { width?: number; height?: number } };
	}) => {
		clearLoadTimeout();
		const { width, height } = event?.nativeEvent?.source ?? {};
		if (width && height) {
			setImageDimensions({ w: width, h: height });
		}
		setHasImageLoaded(true);
		setLoadError(null);
	};

	const resolutionLabel = imageDimensions
		? `${imageDimensions.w} × ${imageDimensions.h}`
		: formatFileSizeKb(fileSize);

	// Show preview for images
	if (isImage) {
		const showPreviewContent =
			shouldLoadMedia || Boolean(previewImageUri || heicPreviewSource);

		if (!showPreviewContent) {
			return <ChatMediaPreviewPlaceholder variant={isGridCell ? 'gridCell' : 'default'} />;
		}

		const imageSource = needsLocalImageOpen
			? heicPreviewSource ?? (previewImageUri ? { uri: previewImageUri } : null)
			: previewImageUri
				? { uri: previewImageUri }
				: null;

		const showLoader = !hasImageLoaded && !loadError;
		const imageUriKey =
			imageSource && 'uri' in imageSource ? imageSource.uri : previewImageUri ?? fileUrl;

		return (
			<>
				<View style={[styles.imagePreviewBlock, isGridCell && styles.imagePreviewBlockGrid]}>
					<View style={styles.imageMetaHeader}>
						<Text
							style={[
								styles.imageFileName,
								isGridCell && styles.imageFileNameGrid,
								isSender ? styles.imageMetaSender : styles.imageMetaOther,
							]}
							numberOfLines={isGridCell ? 2 : 1}
						>
							{name}
						</Text>
						{resolutionLabel ? (
							<Text
								style={[
									styles.imageResolution,
									isGridCell && styles.imageResolutionGrid,
									isSender ? styles.imageMetaSubSender : styles.imageMetaSubOther,
								]}
								numberOfLines={1}
							>
								{resolutionLabel}
							</Text>
						) : null}
					</View>

					<TouchableOpacity
						onPress={handleFileAction}
						activeOpacity={0.9}
						style={[
							styles.imageCard,
							isGridCell && styles.imageCardGrid,
							showLoader && styles.imageCardLoading,
						]}
					>
						{loadError ? (
							<View style={[styles.previewImage, isGridCell && styles.previewImageGrid, styles.imageErrorState]}>
								<Text
									style={[
										styles.imageErrorText,
										isSender ? styles.imageMetaSubSender : styles.imageMetaSubOther,
									]}
								>
									{loadError}
								</Text>
							</View>
						) : imageSource ? (
							<>
								<Image
									key={imageUriKey}
									source={imageSource}
									style={[
										styles.previewImage,
										isGridCell && styles.previewImageGrid,
										showLoader && styles.previewImageLoading,
									]}
									resizeMode="cover"
									onLoad={handleInlineImageLoad}
									onLoadEnd={handleInlineImageLoad}
									onError={() => {
										const failedUri =
											imageSource && 'uri' in imageSource ? imageSource.uri : undefined;
										handlePreviewImageError(failedUri);
									}}
								/>
								{showLoader ? (
									<View style={styles.imagePreviewLoadingOverlay}>
										<ActivityIndicator size="large" color={colors.primary.blue} />
									</View>
								) : null}
							</>
						) : (
							<View style={[styles.previewImage, isGridCell && styles.previewImageGrid, styles.imageLoadingCard]}>
								<ActivityIndicator size="large" color={colors.primary.blue} />
							</View>
						)}
						{isDownloading ? (
							<View style={styles.imageLoadingOverlay}>
								<ActivityIndicator size="large" color={colors.neutral.white} />
							</View>
						) : null}
					</TouchableOpacity>
				</View>
				{downloadedFileUri && (
					<FileViewerModal
						visible={viewerVisible}
						fileUri={downloadedFileUri}
						fileName={needsLocalImageOpen ? toJpegFilename(name) : name}
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
					isGridCell && styles.fileCardGrid,
				]}
			>
				<View style={styles.fileIconContainer}>
					<FileIcon
						width={isGridCell ? rem(28) : rem(40)}
						height={isGridCell ? rem(28) : rem(40)}
						color={isSender ? colors.neutral.white : colors.primary.blue}
					/>
				</View>
				<View style={styles.fileInfo}>
					<Text 
						style={[
							styles.fileName,
							isGridCell && styles.fileNameGrid,
							isSender ? styles.fileNameSender : styles.fileNameOther,
						]}
						numberOfLines={isGridCell ? 2 : 1}
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
	imagePreviewBlock: {
		width: rem(260),
		marginBottom: rem(6),
	},
	imagePreviewBlockGrid: {
		width: '100%',
		maxWidth: '100%',
		alignSelf: 'stretch',
		marginBottom: 0,
	},
	imageMetaHeader: {
		marginBottom: rem(6),
		gap: rem(2),
	},
	imageFileName: {
		fontSize: fp(13),
		fontFamily: fonts['600'],
	},
	imageFileNameGrid: {
		fontSize: fp(11),
	},
	imageResolution: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
	},
	imageResolutionGrid: {
		fontSize: fp(10),
	},
	imageMetaSender: {
		color: colors.neutral.white,
	},
	imageMetaOther: {
		color: colors.primary.blue,
	},
	imageMetaSubSender: {
		color: 'rgba(255, 255, 255, 0.75)',
	},
	imageMetaSubOther: {
		color: 'rgba(41, 41, 102, 0.6)',
	},
	// Card for images
	imageCard: {
		width: '100%',
		borderRadius: rem(10),
		overflow: 'hidden',
		position: 'relative',
	},
	imageCardGrid: {
		width: '100%',
		maxWidth: '100%',
		alignSelf: 'stretch',
	},
	imageCardLoading: {
		backgroundColor: colors.neutral.veryLightGrey,
	},
	previewImage: {
		width: '100%',
		height: rem(180),
		borderRadius: rem(8),
	},
	previewImageGrid: {
		height: rem(104),
		borderRadius: rem(6),
	},
	previewImageLoading: {
		opacity: 0,
	},
	imagePreviewLoadingOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.neutral.veryLightGrey,
	},
	imageLoadingOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.35)',
	},
	imageLoadingCard: {
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.neutral.veryLightGrey,
	},
	imageErrorState: {
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.neutral.veryLightGrey,
		paddingHorizontal: rem(8),
	},
	imageErrorText: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		textAlign: 'center',
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
	fileCardGrid: {
		width: '100%',
		maxWidth: '100%',
		alignSelf: 'stretch',
		padding: rem(8),
		gap: rem(8),
		marginBottom: 0,
		minHeight: rem(88),
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
	fileNameGrid: {
		fontSize: fp(11),
		marginBottom: rem(2),
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


