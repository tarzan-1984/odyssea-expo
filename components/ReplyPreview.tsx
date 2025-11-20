import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import ClearIcon from '@/icons/ClearIcon';
import { Message } from '@/components/ChatListItem';

interface ReplyPreviewProps {
  replyData: Message['replyData'];
  onCancel: () => void;
}

export default function ReplyPreview({ replyData, onCancel }: ReplyPreviewProps) {
  if (!replyData) return null;

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const truncatedContent =
    replyData.content.length > 100
      ? `${replyData.content.substring(0, 100)}...`
      : replyData.content;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.label}>Replying to</Text>
          <Text style={styles.sender}>{replyData.senderName}</Text>
          <Text style={styles.time}>{formatTime(replyData.time)}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {truncatedContent}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={onCancel}
        activeOpacity={0.7}
      >
        <ClearIcon width={rem(16)} height={rem(16)} color={colors.neutral.darkGrey} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: rem(12),
    backgroundColor: colors.neutral.lightGrey,
    borderLeftWidth: rem(4),
    borderLeftColor: colors.primary.blue,
    borderRadius: rem(8),
    marginBottom: rem(12),
    gap: rem(12),
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(8),
    marginBottom: rem(4),
  },
  label: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sender: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  time: {
    fontSize: fp(11),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  message: {
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    lineHeight: rem(20),
  },
  cancelButton: {
    width: rem(24),
    height: rem(24),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: rem(4),
    flexShrink: 0,
  },
});

