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
	messageTimeRight: {
		textAlign: 'right',
	},
	messageTimeLeft: {
		textAlign: 'left',
	},
});


