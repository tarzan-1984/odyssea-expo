import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, fp, rem } from '@/lib';
import FilePreviewCard from '@/components/FilePreviewCard';
import ReadCheckIcon from '@/icons/ReadCheckIcon';
import UnreadCheckIcon from '@/icons/UnreadCheckIcon';
import MessageDropdown from '@/components/MessageDropdown';
import MessageReply from '@/components/MessageReply';
import MessageReactions, { MessageReactionAnchor, MessageReactionPicker } from '@/components/MessageReactions';
import { Message } from '@/components/ChatListItem';
import { getMessageMultiAttachments } from '@/utils/messageAttachments';

type Props = {
	message: Message;
	isSender: boolean;
	chatType?: string;
	currentUserRole?: string;
	onReplyPress?: (message: Message) => void;
	onDeletePress?: (message: Message) => void;
};

export default function MessageItem({ message, isSender, chatType, currentUserRole, onReplyPress, onDeletePress }: Props) {
	const { width: windowWidth } = useWindowDimensions();
	const bubbleRef = useRef<View>(null);
	const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
	const [reactionPickerAnchor, setReactionPickerAnchor] = useState<MessageReactionAnchor | null>(null);

	const formatTime = (timestamp: string): string => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
		});
	};
	
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
	const senderFullName = `${senderFirstName} ${senderLastName}`.trim();
	const canDeleteMessage = isSender && normalizedCurrentUserRole.length > 0 && normalizedCurrentUserRole !== 'DRIVER';
	const multiAttachments = getMessageMultiAttachments(message);
	const showSingleFile = Boolean(!multiAttachments && message.fileUrl);
	const hasFiles = Boolean(multiAttachments || showSingleFile);
	const showMessageMenu = !isSender || canDeleteMessage;

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
			{multiAttachments ? (
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
				/>
			) : null}
			{!!message.content && (
				<View style={[styles.messageTextBlock, hasFiles ? styles.messageTextBlockAfterFiles : null]}>
					{message.replyData && <MessageReply replyData={message.replyData} isSender={isSender} />}
					<Text
						style={[styles.messageText, isSender ? styles.messageTextSender : styles.messageTextOther]}
					>
						{message.content}
					</Text>
				</View>
			)}
			{isSender ? (
				<View style={styles.bubbleFooterRowSender}>
					<View style={styles.bubbleFooterReadStatusIcon}>
						{message.isRead ? (
							<ReadCheckIcon width={rem(14)} height={rem(14)} color="rgba(255, 255, 255, 0.85)" />
						) : (
							<UnreadCheckIcon width={rem(14)} height={rem(14)} color="rgba(255, 255, 255, 0.85)" />
						)}
					</View>
					<Text style={[styles.bubbleTimeText, styles.bubbleTimeTextSender]}>
						{formatTime(message.createdAt)}
					</Text>
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
						{formatTime(message.createdAt)}
					</Text>
				</View>
			)}
		</>
	);

	const bubbleNode = (
		<View style={styles.messageBubbleWrap}>
			{!isSender && senderFullName ? (
				<Text style={[styles.senderNameAboveBubble]} numberOfLines={1}>
					{senderFullName}
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
							multiAttachments ? { width: multiAttachBubbleWidth, maxWidth: '100%' } : null,
						]}
				>
					<View
						style={[
							styles.bubbleContent,
							showMessageMenu && styles.bubbleContentWithMenu,
							multiAttachments && styles.bubbleContentMultiAttach,
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
								onReplyPress={onReplyPress}
								onDeletePress={onDeletePress}
							/>
						</View>
					) : null}
					</Pressable>
				</View>
			</View>
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
		fontSize: fp(12),
		fontFamily: fonts['600'],
		color: 'rgba(41, 41, 102, 0.7)',
		marginBottom: rem(6),
		marginLeft: 0,
	},
	senderNameAboveBubbleWithAvatar: {
		marginLeft: rem(54), // align with bubble when avatar is present
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
	messageBubbleOther: {
		backgroundColor: colors.neutral.white,
		borderBottomLeftRadius: 0,
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