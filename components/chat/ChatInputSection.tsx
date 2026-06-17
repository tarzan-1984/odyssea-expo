import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import SmileIcon from '@/icons/SmileIcon';
import AttachmentIcon from '@/icons/AttachmentIcon';
import FileIcon from '@/icons/FileIcon';
import SendIcon from '@/icons/SendIcon';
import ReplyPreview from '@/components/ReplyPreview';
import { Message } from '@/components/ChatListItem';
import { type UploadQueueItem } from '@/utils/chatAttachmentHelpers';
import ChatFormatToolbar, { type ChatFormatAction } from '@/components/chat/ChatFormatToolbar';
import ChatRichComposeInput, {
  type ChatRichComposeInputRef,
} from '@/components/chat/ChatRichComposeInput';
import {
  EMPTY_EDITOR_FORMAT_STATE,
  formatActionToCommand,
  type EditorFormatState,
} from '@/utils/chatRichEditor';

export type ChatInputSectionRef = {
  insertText: (text: string) => void;
};

interface ChatInputSectionProps {
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onPlainTextChange?: (plainText: string) => void;
  onSendPress: () => void;
  onEmojiPress: () => void;
  onTemplatesPress?: () => void;
  onAttachmentPress: () => void;
  replyingTo: Message['replyData'] | null;
  onCancelReply: () => void;
  uploadQueue: UploadQueueItem[];
  onRemoveUploadItem?: (index: number) => void;
  isSendingMessage: boolean;
  isProcessingAttachments?: boolean;
  isConnected: boolean;
  showTemplatesButton?: boolean;
  composeResetKey?: number;
  onLayout?: (height: number) => void;
}

const ChatInputSection = React.forwardRef<ChatInputSectionRef, ChatInputSectionProps>(
  function ChatInputSection(
    {
      messageText,
      onMessageTextChange,
      onPlainTextChange,
      onSendPress,
      onEmojiPress,
      onTemplatesPress,
      onAttachmentPress,
      replyingTo,
      onCancelReply,
      uploadQueue,
      onRemoveUploadItem,
      isSendingMessage,
      isProcessingAttachments = false,
      isConnected,
      showTemplatesButton = false,
      composeResetKey = 0,
      onLayout,
    },
    ref
  ) {
    const editorRef = React.useRef<ChatRichComposeInputRef>(null);
    const [formatState, setFormatState] = useState<EditorFormatState>(EMPTY_EDITOR_FORMAT_STATE);
    const inputDisabled = isSendingMessage || isProcessingAttachments || !isConnected;

    const canSend =
      (!!messageText.trim() || uploadQueue.length > 0) && !isSendingMessage && isConnected;

    React.useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          editorRef.current?.insertText(text);
        },
      }),
      []
    );

    const handleContentChange = useCallback(
      (markdown: string, plainText: string) => {
        onMessageTextChange(markdown);
        onPlainTextChange?.(plainText);
      },
      [onMessageTextChange, onPlainTextChange]
    );

    const applyFormatAction = useCallback(
      (action: ChatFormatAction) => {
        if (inputDisabled) return;
        const command = formatActionToCommand(action);
        if (!command) return;
        editorRef.current?.applyFormat(command);
      },
      [inputDisabled]
    );

    return (
      <View
        style={styles.sendSection}
        onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
      >
        {replyingTo && (
          <View style={styles.replyPreviewContainer}>
            <ReplyPreview replyData={replyingTo} onCancel={onCancelReply} />
          </View>
        )}

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

        <ChatFormatToolbar
          disabled={inputDisabled}
          isConnected={isConnected}
          activeFormats={formatState}
          onAction={applyFormatAction}
        />

        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.smileButton}
            onPress={onEmojiPress}
            activeOpacity={0.7}
          >
            <SmileIcon width={rem(28)} height={rem(28)} color={colors.primary.greyIcon} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.attachmentButton, isProcessingAttachments && styles.disabledIconButton]}
            onPress={onAttachmentPress}
            activeOpacity={0.7}
            disabled={isProcessingAttachments}
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

          <ChatRichComposeInput
            ref={editorRef}
            disabled={inputDisabled}
            resetKey={composeResetKey}
            onContentChange={handleContentChange}
            onFormatStateChange={setFormatState}
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
);

export default ChatInputSection;

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
  disabledIconButton: {
    opacity: 0.5,
  },
  templateButton: {
    justifyContent: 'center',
    alignItems: 'center',
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
