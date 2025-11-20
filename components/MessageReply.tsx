import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fp, rem } from '@/lib';
import { Message } from '@/components/ChatListItem';

interface MessageReplyProps {
  replyData: Message['replyData'];
  isSender: boolean;
}

export default function MessageReply({ replyData, isSender }: MessageReplyProps) {
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
    <View style={[styles.container, isSender && styles.containerSender]}>
      <View style={styles.header}>
        <Text style={[styles.label, isSender && styles.labelSender]}>Reply to</Text>
        <Text style={[styles.sender, isSender && styles.senderSender]}>
          {replyData.senderName}
        </Text>
        <Text style={[styles.time, isSender && styles.timeSender]}>
          {formatTime(replyData.time)}
        </Text>
      </View>
      <Text
        style={[styles.content, isSender && styles.contentSender]}
        numberOfLines={2}
      >
        {truncatedContent}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: rem(8),
    padding: rem(8),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderLeftWidth: rem(3),
    borderLeftColor: colors.primary.blue,
    borderRadius: rem(6),
  },
  containerSender: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderLeftColor: colors.neutral.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(6),
    marginBottom: rem(4),
  },
  label: {
    fontSize: fp(11),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelSender: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  sender: {
    fontSize: fp(11),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  senderSender: {
    color: colors.neutral.white,
  },
  time: {
    fontSize: fp(10),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  timeSender: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  content: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    lineHeight: rem(18),
  },
  contentSender: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
});

