import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import SmileIcon from '@/icons/SmileIcon';
import AttachmentIcon from '@/icons/AttachmentIcon';
import SendIcon from '@/icons/SendIcon';
import ReplyPreview from '@/components/ReplyPreview';
import { Message } from '@/components/ChatListItem';

interface ChatInputSectionProps {
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSendPress: () => void;
  onEmojiPress: () => void;
  onAttachmentPress: () => void;
  replyingTo: Message['replyData'] | null;
  onCancelReply: () => void;
  uploadQueue: Array<{ name: string; mimeType?: string; size?: number; status: 'uploading' | 'done' | 'error' }>;
  isSendingMessage: boolean;
  isConnected: boolean;
  onLayout?: (height: number) => void;
}

export default function ChatInputSection({
  messageText,
  onMessageTextChange,
  onSendPress,
  onEmojiPress,
  onAttachmentPress,
  replyingTo,
  onCancelReply,
  uploadQueue,
  isSendingMessage,
  isConnected,
  onLayout,
}: ChatInputSectionProps) {
  return (
    <View
      style={styles.sendSection}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
    >
      {/* Reply Preview - above input row */}
      {replyingTo && (
        <View style={styles.replyPreviewContainer}>
          <ReplyPreview
            replyData={replyingTo}
            onCancel={onCancelReply}
          />
        </View>
      )}

      {/* Upload queue preview */}
      {uploadQueue.length > 0 && (
        <View style={styles.uploadRow}>
          {uploadQueue.map((f, idx) => (
            <View key={`${f.name}-${idx}`} style={styles.uploadChip}>
              <Text style={styles.uploadChipText} numberOfLines={1}>
                {f.name}
              </Text>
              <Text style={styles.uploadChipStatus}>
                {f.status === 'uploading' ? 'Uploading…' : f.status === 'done' ? 'Sent' : 'Error'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Input row - buttons and text input */}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.smileButton}
          onPress={onEmojiPress}
          activeOpacity={0.7}
        >
          <SmileIcon width={rem(28)} height={rem(28)} color={colors.primary.greyIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.attachmentButton}
          onPress={onAttachmentPress}
          activeOpacity={0.7}
        >
          <AttachmentIcon width={rem(28)} height={rem(28)} color={colors.primary.greyIcon} />
        </TouchableOpacity>

        <TextInput
          style={styles.messageInput}
          placeholder="Type a message"
          placeholderTextColor={colors.neutral.darkGrey}
          value={messageText}
          onChangeText={onMessageTextChange}
          multiline
          editable={!isSendingMessage}
        />

        <TouchableOpacity
          style={styles.sendButton}
          onPress={onSendPress}
          activeOpacity={0.7}
          disabled={!messageText.trim() || isSendingMessage || !isConnected}
        >
          <SendIcon
            width={rem(28)}
            height={rem(28)}
            color={colors.primary.greyIcon}
            opacity={messageText.trim() ? 1 : 0.5}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sendSection: {
    boxShadow: '0px 0px 40px 0px rgba(41, 41, 102, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopRightRadius: rem(15),
    borderTopLeftRadius: rem(15),
    paddingHorizontal: rem(14),
    paddingVertical: rem(24),
  },
  replyPreviewContainer: {
    marginBottom: rem(12),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(10),
  },
  smileButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageInput: {
    flex: 1,
    minHeight: rem(36),
    maxHeight: rem(120),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    borderRadius: rem(15),
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.31)',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadRow: {
    position: 'absolute',
    left: rem(14),
    right: rem(14),
    bottom: '100%',
    paddingBottom: rem(8),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rem(8),
  },
  uploadChip: {
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    borderColor: 'rgba(96, 102, 197, 0.31)',
    borderWidth: 1,
    borderRadius: rem(12),
    paddingHorizontal: rem(10),
    paddingVertical: rem(6),
    maxWidth: '80%',
  },
  uploadChipText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  uploadChipStatus: {
    fontSize: fp(10),
    color: colors.neutral.darkGrey,
  },
});

