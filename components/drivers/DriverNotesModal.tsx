import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { colors, fonts, rem, fp } from '@/lib';
import { useAuth } from '@/context/AuthContext';
import {
  getDriverNotes,
  postDriverNotice,
  extractNoticesFromResponse,
  getNotesPagination,
  formatNoticeDate,
  type DriverNotice,
} from '@/app-api/driverNotes';

const PER_PAGE = 5;

export interface DriverNotesModalProps {
  visible: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
  notesCount: number;
}

export default function DriverNotesModal({
  visible,
  onClose,
  driverId,
  driverName,
  notesCount,
}: DriverNotesModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { authState } = useAuth();
  const userExternalId = (authState.user?.externalId ?? '').trim();

  const [comment, setComment] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setComment('');
      setAddError(null);
    }
  }, [visible]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['driver-notes', driverId],
    queryFn: ({ pageParam }) =>
      getDriverNotes({ driverId, perPage: PER_PAGE, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { totalPages, currentPage, count } = getNotesPagination(lastPage);
      if (totalPages > 0 && currentPage < totalPages) return currentPage + 1;
      if (count >= PER_PAGE) return currentPage + 1;
      return undefined;
    },
    enabled: visible && !!driverId,
  });

  const notices: DriverNotice[] = useMemo(
    () => data?.pages.flatMap((p) => extractNoticesFromResponse(p)) ?? [],
    [data?.pages]
  );

  const addMutation = useMutation({
    mutationFn: () =>
      postDriverNotice({
        driverId,
        userId: userExternalId,
        message: comment,
      }),
    onSuccess: async () => {
      setComment('');
      setAddError(null);
      // Infinite query: invalidate alone can leave old pages merged; reset refetches from page 1.
      await queryClient.cancelQueries({
        queryKey: ['driver-notes', driverId],
        exact: true,
      });
      await queryClient.resetQueries({
        queryKey: ['driver-notes', driverId],
        exact: true,
      });
      await queryClient.invalidateQueries({
        queryKey: ['drivers-list'],
        refetchType: 'active',
      });
    },
    onError: (err: Error) => {
      setAddError(err.message || 'Failed to add notice');
    },
  });

  const handleAdd = useCallback(() => {
    setAddError(null);
    if (!comment.trim()) return;
    if (!userExternalId) {
      setAddError('User id is missing — cannot add a note');
      return;
    }
    addMutation.mutate();
  }, [comment, userExternalId, addMutation]);

  const badgeCount = Math.max(notesCount, notices.length);

  const listHeader = (
    <View>
      <Text style={styles.sectionLabel}>Comments</Text>
      <TextInput
        style={styles.textArea}
        value={comment}
        onChangeText={setComment}
        placeholder="Enter comment..."
        placeholderTextColor={colors.neutral.grey}
        multiline
        textAlignVertical="top"
        editable={!addMutation.isPending}
      />
      {addError ? <Text style={styles.addError}>{addError}</Text> : null}
      <TouchableOpacity
        style={[
          styles.btnPrimary,
          (!comment.trim() || addMutation.isPending || !userExternalId) &&
            styles.btnPrimaryDisabled,
        ]}
        onPress={handleAdd}
        disabled={!comment.trim() || addMutation.isPending || !userExternalId}
        activeOpacity={0.85}
      >
        {addMutation.isPending ? (
          <ActivityIndicator color={colors.neutral.white} />
        ) : (
          <View style={styles.btnPrimaryInner}>
            <Text style={styles.btnPrimaryText}>Leave a note</Text>
            <Image
              source={require('@/icons/setNotes.png')}
              style={styles.btnPrimaryIcon}
              contentFit="contain"
            />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.driverCountBlock}>
        <Text style={styles.sectionLabel}>Notes</Text>
        <View style={styles.driverCountRow}>
          <Text style={styles.driverNameInModal} numberOfLines={1}>
            {driverName}
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{badgeCount}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: DriverNotice }) => (
      <View style={styles.noticeCard}>
        <View style={styles.noticeTopRow}>
          <Text style={styles.noticeAuthor} numberOfLines={1}>
            {item.name ?? '—'}
          </Text>
          <Text style={styles.noticeDate}>{formatNoticeDate(item.date)}</Text>
        </View>
        <Text style={styles.noticeMessage}>{item.message ?? ''}</Text>
      </View>
    ),
    []
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + rem(12) }]}>
          <Text style={styles.title}>Driver Notes</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {isError ? (
            <View style={styles.centerPad}>
              <Text style={styles.loadError}>Failed to load notices.</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={styles.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              style={styles.list}
              data={notices}
              keyExtractor={(item, idx) =>
                item.id != null ? String(item.id) : `notice-${idx}`
              }
              renderItem={renderItem}
              ListHeaderComponent={listHeader}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom, rem(20)) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) fetchNextPage();
              }}
              onEndReachedThreshold={0.35}
              ListEmptyComponent={
                isPending ? (
                  <View style={styles.centerPad}>
                    <ActivityIndicator size="large" color={colors.primary.blue} />
                  </View>
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No notices for this driver.</Text>
                  </View>
                )
              }
              ListFooterComponent={
                isFetchingNextPage ? (
                  <ActivityIndicator
                    style={{ marginVertical: rem(12) }}
                    color={colors.primary.blue}
                  />
                ) : null
              }
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(20),
    paddingBottom: rem(16),
    backgroundColor: colors.primary.violet,
  },
  title: {
    fontSize: fp(24),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  close: {
    fontSize: fp(17),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  keyboardWrap: {
    flex: 1,
  },
  list: {
    flex: 1,
    paddingHorizontal: rem(20),
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: rem(16),
  },
  sectionLabel: {
    marginTop: rem(18),
    marginBottom: rem(8),
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  textArea: {
    minHeight: rem(100),
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    paddingHorizontal: rem(14),
    paddingVertical: Platform.OS === 'ios' ? rem(12) : rem(10),
    fontSize: fp(15),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    marginBottom: rem(10),
    backgroundColor: colors.neutral.white,
  },
  addError: {
    fontSize: fp(13),
    color: colors.semantic.error,
    marginBottom: rem(8),
  },
  btnPrimary: {
    paddingVertical: rem(14),
    borderRadius: rem(10),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rem(4),
  },
  btnPrimaryDisabled: {
    opacity: 0.55,
  },
  btnPrimaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rem(8),
  },
  btnPrimaryIcon: {
    width: rem(28),
    height: rem(28),
  },
  btnPrimaryText: {
    fontSize: fp(16),
    fontFamily: fonts['700'],
    color: colors.neutral.white,
  },
  driverCountBlock: {
    marginBottom: rem(8),
  },
  driverCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(10),
  },
  driverNameInModal: {
    flex: 1,
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  countBadge: {
    minWidth: rem(32),
    paddingHorizontal: rem(8),
    paddingVertical: rem(4),
    borderRadius: rem(14),
    backgroundColor: colors.primary.blue,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: fp(12),
    fontFamily: fonts['600'],
    color: colors.neutral.white,
  },
  noticeCard: {
    borderWidth: 1,
    borderColor: colors.neutral.lightGrey,
    borderRadius: rem(10),
    padding: rem(14),
    marginBottom: rem(12),
    backgroundColor: colors.neutral.veryLightGrey,
  },
  noticeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: rem(8),
  },
  noticeAuthor: {
    flex: 1,
    fontSize: fp(13),
    fontFamily: fonts['600'],
    color: colors.neutral.darkGrey,
  },
  noticeDate: {
    fontSize: fp(12),
    color: colors.neutral.grey,
  },
  noticeMessage: {
    marginTop: rem(8),
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    lineHeight: fp(20),
  },
  centerPad: {
    padding: rem(24),
    alignItems: 'center',
  },
  loadError: {
    fontSize: fp(14),
    color: colors.semantic.error,
    marginBottom: rem(8),
  },
  retry: {
    fontSize: fp(15),
    fontFamily: fonts['600'],
    color: colors.primary.blue,
  },
  emptyBox: {
    paddingVertical: rem(16),
    paddingHorizontal: rem(12),
    borderRadius: rem(10),
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  emptyText: {
    fontSize: fp(14),
    color: colors.primary.blue,
    textAlign: 'center',
  },
});
