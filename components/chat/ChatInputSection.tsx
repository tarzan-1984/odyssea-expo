import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import SmileIcon from '@/icons/SmileIcon';
import AttachmentIcon from '@/icons/AttachmentIcon';
import FileIcon from '@/icons/FileIcon';
import SendIcon from '@/icons/SendIcon';
import ReplyPreview from '@/components/ReplyPreview';
import { Message } from '@/components/ChatListItem';
import { type UploadQueueItem } from '@/utils/chatAttachmentHelpers';

interface ChatInputSectionProps {
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSendPress: () => void;
  onEmojiPress: () => void;
  onTemplatesPress?: () => void;
  onAttachmentPress: () => void;
  replyingTo: Message['replyData'] | null;
  onCancelReply: () => void;
  uploadQueue: UploadQueueItem[];
  onRemoveUploadItem?: (index: number) => void;
  isSendingMessage: boolean;
  isConnected: boolean;
  showTemplatesButton?: boolean;
  onLayout?: (height: number) => void;
}

export default function ChatInputSection({
  messageText,
  onMessageTextChange,
  onSendPress,
  onEmojiPress,
  onTemplatesPress,
  onAttachmentPress,
  replyingTo,
  onCancelReply,
  uploadQueue,
  onRemoveUploadItem,
  isSendingMessage,
  isConnected,
  showTemplatesButton = false,
  onLayout,
}: ChatInputSectionProps) {
  const canSend = (!!messageText.trim() || uploadQueue.length > 0) && !isSendingMessage && isConnected;

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
              <View style={styles.uploadChipHeader}>
                <Text style={styles.uploadChipText} numberOfLines={1}>
                  {f.name}
                </Text>
                {onRemoveUploadItem && f.status !== 'uploading' ? (
                  <TouchableOpacity
                    onPress={() => onRemoveUploadItem(idx)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={styles.removeUploadButton}
                  >
                    <Text style={styles.removeUploadButtonText}>×</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {f.status === 'uploading' || f.status === 'error' ? (
                <Text style={styles.uploadChipStatus}>
                  {f.status === 'uploading' ? 'Uploading...' : 'Error'}
                </Text>
              ) : null}
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

        {showTemplatesButton ? (
          <TouchableOpacity
            style={styles.templateButton}
            onPress={onTemplatesPress}
            activeOpacity={0.7}
          >
            <FileIcon width={rem(26)} height={rem(26)} color={colors.primary.greyIcon} />
          </TouchableOpacity>
        ) : null}

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
          disabled={!canSend}
        >
          <SendIcon
            width={rem(28)}
            height={rem(28)}
            color={colors.primary.greyIcon}
            opacity={canSend ? 1 : 0.5}
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
  templateButton: {
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
    marginBottom: rem(8),
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
  uploadChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
  },
  uploadChipText: {
    flexShrink: 1,
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  uploadChipStatus: {
    fontSize: fp(10),
    color: colors.neutral.darkGrey,
  },
  removeUploadButton: {
    width: rem(18),
    height: rem(18),
    borderRadius: rem(9),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96, 102, 197, 0.18)',
  },
  removeUploadButtonText: {
    fontSize: fp(14),
    fontFamily: fonts['700'],
    color: colors.primary.blue,
    lineHeight: rem(16),
    includeFontPadding: false,
    textAlign: 'center',
  },
});

