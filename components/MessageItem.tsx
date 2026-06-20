import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, fp, rem } from '@/lib';
import FilePreviewCard from '@/components/FilePreviewCard';
import ReadCheckIcon from '@/icons/ReadCheckIcon';
import UnreadCheckIcon from '@/icons/UnreadCheckIcon';
import MessageDropdown from '@/components/MessageDropdown';
import MessageReply from '@/components/MessageReply';
import ChatMessageText from '@/components/chat/ChatMessageText';
import IncomingMessageFooter from '@/components/chat/IncomingMessageFooter';
import { getIncomingMessageMeta } from '@/utils/chatMessageMeta';
import MessageReactions, { MessageReactionAnchor, MessageReactionPicker } from '@/components/MessageReactions';
import { Message } from '@/components/ChatListItem';
import { getMessageMultiAttachments } from '@/utils/messageAttachments';
import { isOptimisticMessageId } from '@/utils/optimisticChatMessage';
import PendingOutgoingMedia from '@/components/chat/PendingOutgoingMedia';
import { formatNyWallClockDateTime } from '@/utils/nyWallClock';

type Props = {
	message: Message;
	isSender: boolean;
	chatType?: string;
	currentUserRole?: string;
	shouldLoadMedia?: boolean;
	onReplyPress?: (message: Message) => void;
	onDeletePress?: (message: Message) => void;
	onEditPress?: (message: Message) => void;
	onRetryPress?: (message: Message) => void;
};

export default function MessageItem({
	message,
	isSender,
	chatType,
	currentUserRole,
	shouldLoadMedia = true,
	onReplyPress,
	onDeletePress,
	onEditPress,
	onRetryPress,
}: Props) {
	const { width: windowWidth } = useWindowDimensions();
	const bubbleRef = useRef<View>(null);
	const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
	const [reactionPickerAnchor, setReactionPickerAnchor] = useState<MessageReactionAnchor | null>(null);

	const formatRoleText = (role: string): string => {
		const normalizedRole = role
			.trim()
			.toUpperCase()
			.replace(/\s+/g, '_');
		
		// Keep mapping minimal but user-friendly.
		const roleDisplayMap: Record<string, string> = {
			'DRIVER_UPDATES': 'Driver Updates',
			'RECRUITER_TL': 'Recruiter Team Leader',
			'DISPATCHER_TL': 'Dispatcher Team Leader',
			'TRACKING_TL': 'Tracking Team Leader',
			'EXPEDITE_MANAGER': 'Expedite Manager',
			'ADMINISTRATOR': 'Administrator',
			'SUBSCRIBER': 'Subscriber',
		};
		
		if (roleDisplayMap[normalizedRole]) return roleDisplayMap[normalizedRole];
		
		return normalizedRole
			.split('_')
			.map(word => word.charAt(0) + word.slice(1).toLowerCase())
			.join(' ');
	};
	
	const normalizeRoleForColor = (role: string): string => {
		return role.trim().toUpperCase().replace(/\s+/g, '_');
	};
	
	const getRoleBackgroundColor = (role: string): string => {
		const normalizedRole = normalizeRoleForColor(role);
		
		// Same role palette as in chat list (ChatListItem).
		const roleBackgroundColors: Record<string, string> = {
			'DRIVER_UPDATES': '#FF6B35', // Orange
			'MODERATOR': '#B2B2B2', // Gray
			'RECRUITER': '#00d200', // Green
			'ADMINISTRATOR': '#B2B2B2', // Gray (same as MODERATOR)
			'NIGHTSHIFT_TRACKING': '#FF6B35', // Orange
			'DISPATCHER': '#4A90E2', // Blue
			'BILLING': 'rgba(96, 102, 197, 0.15)', // Purple
			'ACCOUNTING': 'rgba(96, 102, 197, 0.15)', // Purple
			'RECRUITER_TL': '#00d200', // Green (same as RECRUITER)
			'DRIVER': '#D2B48C', // Light brown (tan)
			'EXPEDITE_MANAGER': 'rgba(96, 102, 197, 0.15)', // Default purple
			'TRACKING_TL': 'rgba(96, 102, 197, 0.15)', // Default purple
			'DISPATCHER_TL': '#4A90E2', // Blue (same as DISPATCHER)
			'TRACKING': 'rgba(96, 102, 197, 0.15)', // Default purple
			'SUBSCRIBER': 'rgba(96, 102, 197, 0.15)', // Default purple
			'MORNING_TRACKING': 'rgba(96, 102, 197, 0.15)', // Default purple
		};
		
		if (roleBackgroundColors[normalizedRole]) return roleBackgroundColors[normalizedRole];
		
		for (const [key, color] of Object.entries(roleBackgroundColors)) {
			if (normalizedRole.startsWith(key + '_') || normalizedRole.includes('_' + key)) {
				return color;
			}
		}
		
		return 'rgba(96, 102, 197, 0.15)';
	};
	
	const senderFirstName = message.sender?.firstName?.trim() || '';
	const senderRoleRaw = message.sender?.role?.trim() || '';
	const senderLastName = message.sender?.lastName?.trim() || '';
	const senderAvatarUri =
		(message.sender as any)?.avatar ||
		(message.sender as any)?.profilePhoto ||
		'';
	const senderInitials = `${senderFirstName?.[0] || ''}${senderLastName?.[0] || senderFirstName?.[1] || ''}`.toUpperCase();
	const normalizedChatType = (chatType || '').trim().toUpperCase();
	const normalizedCurrentUserRole = (currentUserRole || '').trim().toUpperCase();
	const shouldShowSenderAvatar = !isSender && (normalizedChatType === 'GROUP' || normalizedChatType === 'LOAD');
	const incomingMeta = useMemo(
		() => (isSender ? null : getIncomingMessageMeta(message, chatType)),
		[isSender, message, chatType]
	);
	const canDeleteMessage =
		isSender &&
		!isOptimisticMessageId(message.id) &&
		normalizedCurrentUserRole.length > 0 &&
		normalizedCurrentUserRole !== 'DRIVER';
	const canEditMessage =
		isSender &&
		!isOptimisticMessageId(message.id) &&
		Boolean(message.content?.trim()) &&
		(normalizedCurrentUserRole === 'ADMINISTRATOR' ||
			normalizedCurrentUserRole === 'DRIVER_UPDATES');
	const multiAttachments = message.pendingOutgoing ? null : getMessageMultiAttachments(message);
	const pendingAttachmentCount = message.pendingOutgoing?.localAttachments.length ?? 0;
	const isPendingMultiAttach = pendingAttachmentCount >= 2;
	const isMultiAttachLayout = Boolean(multiAttachments) || isPendingMultiAttach;
	const showSingleFile = Boolean(!multiAttachments && !message.pendingOutgoing && message.fileUrl);
	const hasFiles = Boolean(message.pendingOutgoing || multiAttachments || showSingleFile);
	const showMessageMenu = (!isSender || canDeleteMessage || canEditMessage) && !message.pendingOutgoing;
	const pendingStatus = message.pendingOutgoing?.status;
	const isPendingFailed = pendingStatus === 'failed';
	const isPendingSending =
		pendingStatus === 'uploading' || pendingStatus === 'sending';
	const isPendingMedia =
		message.pendingOutgoing?.kind === 'media' &&
		(message.pendingOutgoing.localAttachments.length ?? 0) > 0;

	/** Same visual budget as two single-file previews (rem(260) each) + padding/menu. */
	const multiAttachBubbleWidth = useMemo(() => {
		const singleCard = rem(260);
		const colGap = rem(6);
		const hPad = rem(15) * 2;
		const menuPad = rem(24);
		const intrinsic = singleCard * 2 + colGap + hPad + menuPad;
		const listUsable = windowWidth * 0.95;
		const avatarReserve = shouldShowSenderAvatar ? rem(42) + rem(10) : 0;
		const maxAvailable = listUsable - avatarReserve;
		return Math.min(intrinsic, Math.max(rem(160), maxAvailable));
	}, [windowWidth, shouldShowSenderAvatar]);

	const messageBody = (
		<>
			{isPendingMedia && message.pendingOutgoing ? (
				<PendingOutgoingMedia
					localAttachments={message.pendingOutgoing.localAttachments}
					status={message.pendingOutgoing.status}
					isSender={isSender}
				/>
			) : multiAttachments ? (
				<View style={styles.multiAttachGrid}>
					{multiAttachments.map((item, idx) => (
						<View key={`${item.fileUrl}-${idx}`} style={styles.multiAttachCell}>
							<FilePreviewCard
								variant="gridCell"
								fileUrl={item.fileUrl}
								fileName={item.fileName}
								fileSize={item.fileSize}
								isSender={isSender}
								createdAt={message.createdAt}
								shouldLoadMedia={shouldLoadMedia}
							/>
						</View>
					))}
				</View>
			) : showSingleFile ? (
				<FilePreviewCard
					fileUrl={message.fileUrl!}
					fileName={message.fileName}
					fileSize={message.fileSize}
					isSender={isSender}
					shouldLoadMedia={shouldLoadMedia}
				/>
			) : null}
			{!!message.content && (
				<View style={[styles.messageTextBlock, hasFiles ? styles.messageTextBlockAfterFiles : null]}>
					{message.replyData && <MessageReply replyData={message.replyData} isSender={isSender} />}
					<ChatMessageText
						content={message.content}
						isOutgoing={isSender}
						style={[styles.messageText, isSender ? styles.messageTextSender : styles.messageTextOther]}
					/>
				</View>
			)}
			{isSender ? (
				<View
					style={[
						styles.bubbleFooterRowSender,
						message.pendingOutgoing ? styles.bubbleFooterRowSenderPending : null,
					]}
				>
					{message.pendingOutgoing ? (
						<View style={styles.pendingFooterColumn}>
							{isPendingSending ? (
								<View style={styles.pendingStatusRow}>
									<ActivityIndicator
										size="small"
										color={isSender ? colors.neutral.white : colors.primary.violet}
									/>
									<Text
										numberOfLines={1}
										style={[
											styles.pendingStatusText,
											isSender ? styles.pendingStatusTextSender : styles.pendingStatusTextOther,
										]}
									>
										{pendingStatus === 'uploading' ? 'Uploading...' : 'Sending...'}
									</Text>
								</View>
							) : null}
							{isPendingFailed ? (
								<View style={styles.pendingFailedRow}>
									<Text
										numberOfLines={1}
										style={[
											styles.pendingFailedLabel,
											isSender ? styles.pendingStatusTextSender : styles.pendingStatusTextOther,
										]}
									>
										Not sent
									</Text>
									<TouchableOpacity
										style={[
											styles.retryButton,
											isSender ? styles.retryButtonSender : styles.retryButtonOther,
										]}
										onPress={() => onRetryPress?.(message)}
										activeOpacity={0.8}
									>
										<Text
											style={[
												styles.retryButtonText,
												isSender ? styles.retryButtonTextSender : styles.retryButtonTextOther,
											]}
										>
											Retry
										</Text>
									</TouchableOpacity>
								</View>
							) : null}
						</View>
					) : (
						<>
							<View style={styles.bubbleFooterReadStatusIcon}>
								{message.isRead ? (
									<ReadCheckIcon width={rem(14)} height={rem(14)} color="rgba(255, 255, 255, 0.85)" />
								) : (
									<UnreadCheckIcon width={rem(14)} height={rem(14)} color="rgba(255, 255, 255, 0.85)" />
								)}
							</View>
							<Text style={[styles.bubbleTimeText, styles.bubbleTimeTextSender]}>
								{formatNyWallClockDateTime(message.createdAt)}
							</Text>
						</>
					)}
				</View>
			) : (
				<View style={styles.bubbleFooterRowIncoming}>
					{senderRoleRaw ? (
						<View
							style={[
								styles.roleTag,
								{ backgroundColor: getRoleBackgroundColor(senderRoleRaw) },
							]}
						>
							<Text style={styles.roleTagText} numberOfLines={1}>
								{formatRoleText(senderRoleRaw)}
							</Text>
						</View>
					) : (
						<View />
					)}
					<Text style={[styles.bubbleTimeText, styles.bubbleTimeTextOther, styles.bubbleTimeTextIncoming]}>
						{formatNyWallClockDateTime(message.createdAt)}
					</Text>
				</View>
			)}
		</>
	);

	const bubbleNode = (
		<View style={styles.messageBubbleWrap}>
			{!isSender && incomingMeta?.senderNameLabel ? (
				<Text
					style={[
						styles.senderNameAboveBubble,
						shouldShowSenderAvatar && styles.senderNameAboveBubbleWithAvatar,
					]}
					numberOfLines={1}
				>
					{incomingMeta.senderNameLabel}
				</Text>
			) : null}

			<View style={{ flexDirection: 'row' }}>
				<View ref={bubbleRef} collapsable={false}>
					<Pressable
						disabled={isSender}
						onLongPress={() => {
							Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
							bubbleRef.current?.measureInWindow((x, y, width, height) => {
								setReactionPickerAnchor({ x, y, width, height });
								setReactionPickerOpen(true);
							});
						}}
						style={[
							styles.messageBubble,
							isSender ? styles.messageBubbleSender : styles.messageBubbleOther,
							isSender ? styles.messageBubbleOutgoing : null,
							isPendingFailed && isSender ? styles.messageBubbleFailedSender : null,
							isPendingFailed && !isSender ? styles.messageBubbleFailedOther : null,
							isMultiAttachLayout ? { width: multiAttachBubbleWidth, maxWidth: '100%' } : null,
						]}
				>
					{isPendingFailed ? (
						<View style={styles.failedTintOverlay} pointerEvents="none" />
					) : null}
					<View
						style={[
							styles.bubbleContent,
							showMessageMenu && styles.bubbleContentWithMenu,
							isMultiAttachLayout && styles.bubbleContentMultiAttach,
						]}
					>
						{messageBody}
					</View>
					{showMessageMenu ? (
						<View style={styles.bubbleMenuAbsolute} pointerEvents="box-none">
							<MessageDropdown
								message={message}
								isSender={isSender}
								canDelete={canDeleteMessage}
								canEdit={canEditMessage}
								onReplyPress={onReplyPress}
								onDeletePress={onDeletePress}
								onEditPress={onEditPress}
							/>
						</View>
					) : null}
					</Pressable>
				</View>
			</View>
			{incomingMeta?.showFooter && incomingMeta.phone ? (
				<IncomingMessageFooter phone={incomingMeta.phone} />
			) : null}
			<MessageReactions
				message={message}
				canReact={!isSender}
				align={isSender ? 'right' : 'left'}
			/>
			{!isSender ? (
				<MessageReactionPicker
					message={message}
					visible={reactionPickerOpen}
					anchor={reactionPickerAnchor}
					onClose={() => setReactionPickerOpen(false)}
				/>
			) : null}
		</View>
	);
	
	return (
		<View
			style={[
				styles.messageWrapper,
				isSender ? styles.messageWrapperRight : styles.messageWrapperLeft,
			]}
		>
			{shouldShowSenderAvatar ? (
				<View style={styles.incomingRow}>
					<View style={styles.senderAvatarWrap}>
						{senderAvatarUri ? (
							<Image source={{ uri: senderAvatarUri }} style={styles.senderAvatar} />
						) : (
							 <View style={styles.senderAvatarPlaceholder}>
								 <Text style={styles.senderAvatarInitials}>{senderInitials || 'U'}</Text>
							 </View>
						 )}
					</View>
					{bubbleNode}
				</View>
			) : (
				 <>
					 {!isSender ? (
						 <>
							 {bubbleNode}
						 </>
					 ) : (
						  <>
							  {bubbleNode}
						  </>
					  )}
				 </>
			 )}
		</View>
	);
}

const styles = StyleSheet.create({
	messageWrapper: {
		marginBottom: rem(15),
		width: '95%',
	},
	messageWrapperRight: {
		alignSelf: 'flex-end',
		alignItems: 'flex-end',
	},
	messageWrapperLeft: {
		alignSelf: 'flex-start',
		alignItems: 'flex-start',
	},
	senderNameAboveBubble: {
		fontSize: fp(15),
		lineHeight: fp(20),
		fontFamily: fonts['700'],
		color: 'rgba(41, 41, 102, 0.85)',
		marginBottom: rem(6),
		marginLeft: 0,
	},
	senderNameAboveBubbleWithAvatar: {
		marginLeft: 0,
	},
	incomingRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		maxWidth: '100%',
	},
	senderAvatarWrap: {
		marginRight: rem(10),
		flexShrink: 0,
		width: rem(42),
		height: rem(42),
	},
	senderAvatar: {
		width: rem(42),
		height: rem(42),
		borderRadius: rem(42),
		flexShrink: 0,
		backgroundColor: colors.neutral.lightGrey,
	},
	senderAvatarPlaceholder: {
		width: rem(42),
		height: rem(42),
		borderRadius: rem(42),
		backgroundColor: colors.neutral.lightGrey,
		alignItems: 'center',
		justifyContent: 'center',
	},
	senderAvatarInitials: {
		fontFamily: fonts['700'],
		fontSize: fp(12),
		color: colors.primary.blue,
	},
	incomingNoAvatarCol: {
		alignSelf: 'flex-start',
		alignItems: 'flex-start',
	},
	messageBubbleWrap: {
		flexShrink: 1,
		minWidth: 0,
		maxWidth: '100%',
	},
	messageBubble: {
		paddingHorizontal: rem(15),
		paddingTop: rem(15),
		paddingBottom: rem(10),
		borderRadius: rem(10),
		boxShadow: '0px 0px 20px 0px rgba(96, 102, 197, 0.06)',
		maxWidth: '100%',
		position: 'relative',
		alignSelf: 'flex-start',
	},
	bubbleContent: {
		maxWidth: '100%',
	},
	bubbleContentMultiAttach: {
		width: '100%',
	},
	bubbleContentWithMenu: {
		// Space for ⋮ trigger (~18px) + padding; keep tight to previews
		paddingRight: rem(24),
	},
	bubbleMenuAbsolute: {
		position: 'absolute',
		right: rem(4),
		top: rem(8),
		zIndex: 2,
	},
	messageTextBlock: {
		maxWidth: '100%',
	},
	messageTextBlockAfterFiles: {
		marginTop: rem(10),
	},
	messageBubbleSender: {
		backgroundColor: colors.primary.blue,
		borderBottomRightRadius: 0,
	},
	messageBubbleOutgoing: {
		alignSelf: 'flex-end',
	},
	messageBubbleOther: {
		backgroundColor: colors.neutral.white,
		borderBottomLeftRadius: 0,
	},
	messageBubbleFailedSender: {
		borderWidth: 1,
		borderColor: 'rgba(252, 165, 165, 0.45)',
	},
	messageBubbleFailedOther: {
		borderWidth: 1,
		borderColor: 'rgba(248, 113, 113, 0.35)',
	},
	failedTintOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(239, 68, 68, 0.14)',
		borderRadius: rem(10),
		borderBottomRightRadius: 0,
	},
	pendingFooterColumn: {
		alignSelf: 'flex-start',
		gap: rem(6),
	},
	pendingStatusRow: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: rem(6),
		flexShrink: 0,
	},
	pendingFailedRow: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: rem(8),
		flexShrink: 0,
	},
	pendingFailedLabel: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
	},
	pendingStatusText: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		flexShrink: 0,
	},
	pendingStatusTextSender: {
		color: 'rgba(255, 255, 255, 0.85)',
	},
	pendingStatusTextOther: {
		color: 'rgba(41, 41, 102, 0.7)',
	},
	retryButton: {
		paddingHorizontal: rem(12),
		paddingVertical: rem(5),
		borderRadius: rem(14),
	},
	retryButtonSender: {
		backgroundColor: 'rgba(255, 255, 255, 0.18)',
	},
	retryButtonOther: {
		backgroundColor: 'rgba(248, 113, 113, 0.15)',
	},
	retryButtonText: {
		fontSize: fp(11),
		fontFamily: fonts['700'],
	},
	retryButtonTextSender: {
		color: colors.neutral.white,
	},
	retryButtonTextOther: {
		color: colors.primary.blue,
	},
	messageText: {
		fontSize: fp(17),
		lineHeight: fp(23),
		fontFamily: fonts['400'],
		letterSpacing: 0,
	},
	messageTextSender: {
		color: colors.neutral.white,
	},
	messageTextOther: {
		color: colors.primary.blue,
	},
	multiAttachGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		width: '100%',
		maxWidth: '100%',
		columnGap: rem(6),
		rowGap: rem(8),
	},
	/** Two files per row */
	multiAttachCell: {
		width: '48%',
		maxWidth: '48%',
	},
	messageTimeContainerRight: {
		justifyContent: 'flex-end',
	},
	messageTimeContainerLeft: {
		justifyContent: 'flex-start',
	},
	messageTime: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		color: 'rgba(41, 41, 102, 0.7)',
	},
	messageMeta: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		color: 'rgba(41, 41, 102, 0.7)',
	},
	roleTag: {
		paddingHorizontal: rem(8),
		paddingVertical: rem(3),
		borderRadius: rem(10),
		justifyContent: 'center',
		alignItems: 'center',
		flexShrink: 1,
		maxWidth: rem(180),
	},
	roleTagText: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		color: 'rgba(41, 41, 102, 0.7)',
		flexShrink: 1,
	},
	messageTimeRight: {
		textAlign: 'right',
	},
	messageTimeLeft: {
		textAlign: 'left',
	},
	bubbleFooterRowSender: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: rem(10),
		gap: rem(6),
	},
	bubbleFooterRowSenderPending: {
		justifyContent: 'flex-end',
		marginTop: rem(6),
	},
	bubbleFooterRowIncoming: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: rem(10),
		gap: rem(15),
	},
	bubbleFooterReadStatusIcon: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	bubbleTimeText: {
		fontSize: fp(10),
		fontFamily: fonts['400'],
	},
	bubbleTimeTextIncoming: {
		marginLeft: 'auto',
	},
	bubbleTimeTextSender: {
		color: 'rgba(255, 255, 255, 0.85)',
	},
	bubbleTimeTextOther: {
		color: 'rgba(41, 41, 102, 0.7)',
	},
});
