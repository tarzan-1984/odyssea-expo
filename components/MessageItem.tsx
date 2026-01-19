import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import FilePreviewCard from '@/components/FilePreviewCard';
import ReadCheckIcon from '@/icons/ReadCheckIcon';
import UnreadCheckIcon from '@/icons/UnreadCheckIcon';
import MessageDropdown from '@/components/MessageDropdown';
import MessageReply from '@/components/MessageReply';
import { Message } from '@/components/ChatListItem';

type Props = {
	message: Message;
	isSender: boolean;
	onReplyPress?: (message: Message) => void;
};

export default function MessageItem({ message, isSender, onReplyPress }: Props) {
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

	return (
		<View
			style={[
				styles.messageWrapper,
				isSender ? styles.messageWrapperRight : styles.messageWrapperLeft,
			]}
		>
			<View
				style={[
					styles.messageBubble,
					isSender ? styles.messageBubbleSender : styles.messageBubbleOther,
				]}
			>
				{message.fileUrl ? (
					<FilePreviewCard
						fileUrl={message.fileUrl}
						fileName={message.fileName}
						fileSize={message.fileSize}
						isSender={isSender}
					/>
				) : null}
				{!!message.content && (
					<View style={styles.messageContentRow}>
						<View style={styles.messageTextWrapper}>
							{/* Reply to message */}
							{message.replyData && (
								<MessageReply replyData={message.replyData} isSender={isSender} />
							)}
							<Text
								style={[
									styles.messageText,
									isSender ? styles.messageTextSender : styles.messageTextOther,
								]}
							>
								{message.content}
							</Text>
						</View>
						<MessageDropdown
							message={message}
							isSender={isSender}
							onReplyPress={onReplyPress}
							onMarkUnreadPress={(messageId) => {
								// TODO: Implement mark as unread functionality
							}}
						/>
					</View>
				)}
			</View>

			<View
				style={[
					styles.messageTimeContainer,
					isSender ? styles.messageTimeContainerRight : styles.messageTimeContainerLeft,
				]}
			>
				{isSender && (
					<View style={styles.readStatusIcon}>
						{message.isRead ? (
							<ReadCheckIcon width={rem(14)} height={rem(14)} color="rgba(41, 41, 102, 0.7)" />
						) : (
							<UnreadCheckIcon width={rem(14)} height={rem(14)} color="rgba(41, 41, 102, 0.7)" />
						)}
					</View>
				)}
				<Text
					style={[
						styles.messageTime,
						isSender ? styles.messageTimeRight : styles.messageTimeLeft,
					]}
				>
					{formatTime(message.createdAt)}
				</Text>
				{!isSender ? (
					<>
						{senderFirstName ? (
							<Text style={styles.messageMeta} numberOfLines={1}>
								{senderFirstName}
							</Text>
						) : null}
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
						) : null}
					</>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	messageWrapper: {
		marginBottom: rem(15),
		maxWidth: '75%',
	},
	messageWrapperRight: {
		alignSelf: 'flex-end',
		alignItems: 'flex-end',
	},
	messageWrapperLeft: {
		alignSelf: 'flex-start',
		alignItems: 'flex-start',
	},
	messageBubble: {
		paddingHorizontal: rem(15),
		paddingVertical: rem(15),
		borderRadius: rem(10),
		marginBottom: rem(6),
		boxShadow: '0px 0px 20px 0px rgba(96, 102, 197, 0.06)',
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
		fontSize: fp(15),
		fontFamily: fonts['400'],
		letterSpacing: 0,
	},
	messageTextSender: {
		color: colors.neutral.white,
	},
	messageTextOther: {
		color: colors.primary.blue,
	},
	messageContentRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: rem(8),
	},
	messageTextWrapper: {
		// No flex needed - just a container for reply and text
	},
	messageTimeContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: rem(4),
	},
	messageTimeContainerRight: {
		justifyContent: 'flex-end',
	},
	messageTimeContainerLeft: {
		justifyContent: 'flex-start',
	},
	readStatusIcon: {
		justifyContent: 'center',
		alignItems: 'center',
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
		maxWidth: rem(120),
	},
	roleTagText: {
		fontSize: fp(11),
		fontFamily: fonts['400'],
		color: 'rgba(41, 41, 102, 0.7)',
	},
	messageTimeRight: {
		textAlign: 'right',
	},
	messageTimeLeft: {
		textAlign: 'left',
	},
});


