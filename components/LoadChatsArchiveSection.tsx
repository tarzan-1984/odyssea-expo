import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import ArrowDownIcon from '@/icons/ArrowDownIcon';
import SearchIcon from '@/icons/SearchIcon';
import ClearIcon from '@/icons/ClearIcon';
import ChatListItem, { ChatRoom } from '@/components/ChatListItem';
import { chatApi } from '@/app-api/chatApi';
import { eventBus, AppEvents } from '@/services/EventBus';
import { ARCHIVED_LOAD_CHATS_QUERY_KEY } from '@/components/loadArchivedChatsQueryKey';
import { removeArchivedLoadChatFromCache } from '@/utils/removeArchivedLoadChatFromCache';
import { chatRoomMatchesSearchQuery } from '@/utils/chatSearch';
import { normalizeChatParticipants } from '@/utils/normalizeChatParticipants';

const PAGE_SIZE = 10;

type ArchivedPage = {
  chatRooms: ChatRoom[];
  pagination: { page: number; limit: number; hasMore: boolean };
};

interface LoadChatsArchiveSectionProps {
  tabActive: boolean;
  pinnedToBottom?: boolean;
  selectedChatId?: string | null;
  currentUserId?: string;
  isUserOnline: (userId: string) => boolean;
  mergeChatRooms: (rooms: ChatRoom[]) => void;
  onChatPress: (chatRoom: ChatRoom) => void;
  openDropdownId?: string | null;
  setOpenDropdownId?: (id: string | null) => void;
}

function archivedChatTitle(chatRoom: ChatRoom): string {
  if (chatRoom.name?.trim()) return chatRoom.name.trim();
  if (chatRoom.loadId?.trim()) return `#${chatRoom.loadId.trim()}`;
  return 'Archived shipment';
}

/** Mirrors Next.js ChatList.getChatDisplayName; LOAD behaves like GROUP for participant fallback. */
function getArchiveChatDisplayName(
  chatRoom: ChatRoom,
  currentUserId?: string,
): string {
  if (
    chatRoom.type === 'DIRECT' &&
    chatRoom.participants.length === 2 &&
    currentUserId
  ) {
    const otherParticipant = chatRoom.participants.find(
      (p) => p.user.id !== currentUserId,
    );
    if (otherParticipant) {
      return `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}`;
    }
  }

  if (chatRoom.name) {
    return chatRoom.name;
  }

  if (chatRoom.type === 'GROUP' || chatRoom.type === 'BID' || chatRoom.type === 'LOAD' || chatRoom.type === 'OFFER') {
    const participantNames = chatRoom.participants
      .slice(0, 2)
      .map((p) => p.user.firstName)
      .join(', ');
    return participantNames + (chatRoom.participants.length > 2 ? '...' : '');
  }

  return 'Unknown Chat';
}

export default function LoadChatsArchiveSection({
  tabActive,
  pinnedToBottom = false,
  selectedChatId,
  currentUserId,
  isUserOnline,
  mergeChatRooms,
  onChatPress,
  openDropdownId,
  setOpenDropdownId,
}: LoadChatsArchiveSectionProps) {
  const { height: winH } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [debouncedArchiveSearch, setDebouncedArchiveSearch] = useState('');

  const clearArchiveSearch = useCallback(() => {
    setArchiveSearchQuery('');
    setDebouncedArchiveSearch('');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedArchiveSearch(archiveSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [archiveSearchQuery]);

  const mergeNormalized = useCallback((list: ChatRoom[]): ChatRoom[] => {
    return list.map((room) => ({
      ...room,
      participants: normalizeChatParticipants(room.participants || []),
      name: archivedChatTitle(room),
      isLoadArchived: true as const,
    }));
  }, []);

  const patchArchiveRoomInState = useCallback(
    (chatRoomId: string, updates: Partial<ChatRoom>) => {
      queryClient.setQueryData<InfiniteData<ArchivedPage>>(
        [...ARCHIVED_LOAD_CHATS_QUERY_KEY],
        (prev) => {
          if (!prev?.pages?.length) return prev;
          const nextPages = prev.pages.map((page) => ({
            ...page,
            chatRooms: (page.chatRooms ?? []).map((r) =>
              r.id === chatRoomId ? ({ ...r, ...updates } as ChatRoom) : r,
            ),
          }));

          let mergedPatch: ChatRoom | null = null;
          for (const p of nextPages) {
            const hit = p.chatRooms.find((r) => r.id === chatRoomId);
            if (hit) {
              mergedPatch = hit as ChatRoom;
              break;
            }
          }

          const nextData: InfiniteData<ArchivedPage> = {
            ...prev,
            pages: nextPages,
          };

          if (mergedPatch) {
            mergeChatRooms([mergedPatch]);
          }

          return nextData;
        },
      );
    },
    [mergeChatRooms, queryClient],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [...ARCHIVED_LOAD_CHATS_QUERY_KEY],
    queryFn: ({ pageParam }) =>
      chatApi.getArchivedLoadChatRooms(Number(pageParam) || 1, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: tabActive && expanded,
    staleTime: 10 * 60 * 1000,
  });

  const archivedRooms = useMemo(() => {
    const pages = data?.pages;
    if (!Array.isArray(pages)) return [];
    return pages.flatMap((p) =>
      Array.isArray((p as ArchivedPage)?.chatRooms)
        ? (p as ArchivedPage).chatRooms
        : [],
    );
  }, [data]);

  const displayRooms = useMemo(
    () => mergeNormalized(archivedRooms),
    [archivedRooms, mergeNormalized],
  );

  const filteredDisplayRooms = useMemo(() => {
    const q = debouncedArchiveSearch.trim();
    if (!q) return displayRooms;
    return displayRooms.filter((room) =>
      chatRoomMatchesSearchQuery(
        room,
        q,
        (r) => getArchiveChatDisplayName(r, currentUserId),
        { includeParticipantPhones: true },
      ),
    );
  }, [displayRooms, debouncedArchiveSearch, currentUserId]);

  useEffect(() => {
    if (displayRooms.length > 0) {
      mergeChatRooms(displayRooms);
    }
  }, [displayRooms, mergeChatRooms]);

  useEffect(() => {
    const off = eventBus.on(
      AppEvents.ArchivedLoadChatsNeedRefresh,
      (payload?: { chatRoomId?: string; reactivated?: boolean }) => {
        if (payload?.reactivated && payload.chatRoomId) {
          removeArchivedLoadChatFromCache(queryClient, payload.chatRoomId);
          return;
        }
        void queryClient.invalidateQueries({
          queryKey: [...ARCHIVED_LOAD_CHATS_QUERY_KEY],
        });
      },
    );
    return () => void off();
  }, [queryClient]);

  const isArchiveSearchActive = debouncedArchiveSearch.trim().length > 0;

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isArchiveSearchActive) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isArchiveSearchActive, isFetchingNextPage]);

  /** Search row + padded outer (~archiveSearchOuter vertical padding). */
  const archiveFlatListHeight = useMemo(() => {
    const searchStripeH = Platform.OS === 'android' ? rem(68) : rem(70);
    const blockMinPx = Math.floor(winH * 0.5);
    const computed = Math.max(blockMinPx - searchStripeH, rem(170));
    const cap = Math.floor(winH * (pinnedToBottom ? 0.52 : 0.62));
    return Math.min(computed, cap);
  }, [pinnedToBottom, winH]);

  const closeAllDropdowns = useCallback(() => {
    setOpenDropdownId?.(null);
  }, [setOpenDropdownId]);

  const onToggle = useCallback(() => {
    Keyboard.dismiss();
    setExpanded((x) => !x);
    closeAllDropdowns();
  }, [closeAllDropdowns]);

  const renderItem = useCallback(
    ({ item: chatRoom }: { item: ChatRoom }) => {
      let userStatus: 'online' | 'offline' = 'offline';
      if (
        chatRoom.type === 'DIRECT' &&
        chatRoom.participants.length === 2 &&
        currentUserId
      ) {
        const other = chatRoom.participants.find(
          (p) => p.user.id !== currentUserId,
        );
        if (other && isUserOnline(other.user.id)) {
          userStatus = 'online';
        }
      }
      return (
        <ChatListItem
          chatRoom={chatRoom}
          isSelected={selectedChatId === chatRoom.id}
          status={userStatus}
          onPress={onChatPress}
          currentUserId={currentUserId}
          onChatRoomUpdate={(chatRoomId, updates) =>
            patchArchiveRoomInState(chatRoomId, updates)
          }
          isDropdownOpen={openDropdownId === chatRoom.id}
          onDropdownToggle={(isOpen, chatId) => {
            if (isOpen) setOpenDropdownId?.(chatId);
            else if (openDropdownId === chatId) setOpenDropdownId?.(null);
          }}
          onCloseAllDropdowns={closeAllDropdowns}
        />
      );
    },
    [
      closeAllDropdowns,
      currentUserId,
      isUserOnline,
      onChatPress,
      openDropdownId,
      patchArchiveRoomInState,
      selectedChatId,
      setOpenDropdownId,
    ],
  );

  const ListEmpty = useMemo(() => {
    if (isPending) {
      return (
        <View style={styles.centerPad}>
          <ActivityIndicator color={colors.primary.violet} />
          <Text style={styles.muted}>Loading archive…</Text>
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.centerPad}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Failed to load archive'}
          </Text>
        </View>
      );
    }
    if (
      archivedRooms.length > 0 &&
      filteredDisplayRooms.length === 0 &&
      debouncedArchiveSearch.trim()
    ) {
      return (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>No chats found</Text>
          <Text style={styles.emptyHint}>Try a different search term</Text>
        </View>
      );
    }
    return (
      <View style={styles.centerPad}>
        <Text style={styles.muted}>No archived shipments</Text>
      </View>
    );
  }, [
    archivedRooms.length,
    debouncedArchiveSearch,
    error,
    filteredDisplayRooms.length,
    isError,
    isPending,
  ]);

  const ListFooter = useMemo(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator color={colors.primary.blue} />
        <Text style={styles.footerLoadingText}>Loading more…</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  if (!tabActive) {
    return null;
  }

  return (
    <View style={[styles.wrap, pinnedToBottom && styles.wrapPinned]}>
      <View style={styles.cardOuter}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onToggle}
          activeOpacity={0.75}
          style={styles.sectionHeaderBtn}
        >
          <Text style={styles.sectionHeaderText}>ARCHIVE</Text>
          <View style={[styles.chevronWrap, expanded && styles.chevronRotated]}>
            <ArrowDownIcon />
          </View>
        </TouchableOpacity>

        {expanded && (
          <>
            <View
              style={[
                styles.archiveExpandedBody,
                { minHeight: Math.floor(winH * 0.5) },
              ]}
            >
            <View style={styles.archiveSearchOuter}>
              <View style={styles.archiveSearchInner}>
                <View style={styles.archiveSearchIcon}>
                  <SearchIcon />
                </View>
                <TextInput
                  style={styles.archiveSearchInput}
                  placeholder="Search chats..."
                  placeholderTextColor={colors.neutral.darkGrey}
                  value={archiveSearchQuery}
                  onChangeText={setArchiveSearchQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Search archived chats"
                />
                {archiveSearchQuery.length > 0 ? (
                  <TouchableOpacity
                    style={styles.archiveSearchClear}
                    onPress={clearArchiveSearch}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Clear archived chat search"
                  >
                    <ClearIcon />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <FlatList
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={[
                styles.listPanel,
                { height: archiveFlatListHeight },
              ]}
              contentContainerStyle={
                filteredDisplayRooms.length === 0
                  ? [
                      styles.archiveListPaddingOnly,
                      styles.archiveListInnerCentered,
                    ]
                  : styles.archiveListPaddingOnly
              }
              data={filteredDisplayRooms}
              keyExtractor={(item) => `arch-${item.id}`}
              renderItem={renderItem}
              ListEmptyComponent={ListEmpty}
              ListFooterComponent={ListFooter}
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.35}
              onScrollBeginDrag={() => Keyboard.dismiss()}
              onMomentumScrollBegin={() => Keyboard.dismiss()}
            />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: rem(12),
  },
  wrapPinned: {
    marginTop: 0,
  },
  cardOuter: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.2)',
    backgroundColor: colors.neutral.white,
    overflow: 'hidden',
  },
  sectionHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rem(12),
    paddingVertical: rem(10),
    backgroundColor: 'rgba(96, 102, 197, 0.12)',
  },
  sectionHeaderText: {
    fontSize: fp(12),
    fontFamily: fonts['700'],
    letterSpacing: 0.8,
    color: colors.primary.blue,
  },
  chevronWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  archiveSearchOuter: {
    paddingHorizontal: rem(10),
    paddingVertical: rem(8),
    backgroundColor: 'rgba(247, 248, 255, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(96, 102, 197, 0.15)',
  },
  archiveSearchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: rem(100),
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    minHeight: rem(36),
    paddingHorizontal: rem(12),
  },
  archiveSearchIcon: {
    marginRight: rem(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveSearchInput: {
    flex: 1,
    fontSize: fp(14),
    fontFamily: fonts['400'],
    color: colors.primary.blue,
    ...(Platform.OS === 'android'
      ? {
          paddingVertical: 0,
          textAlignVertical: 'center' as const,
          includeFontPadding: false as const,
          lineHeight: rem(36),
        }
      : {
          paddingVertical: rem(8),
          lineHeight: fp(14),
        }),
  },
  archiveSearchClear: {
    marginLeft: rem(8),
    padding: rem(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveExpandedBody: {
    flexDirection: 'column',
  },
  listPanel: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(96, 102, 197, 0.15)',
    backgroundColor: 'rgba(247, 248, 255, 0.96)',
  },
  archiveListPaddingOnly: {
    paddingVertical: rem(6),
    paddingHorizontal: rem(8),
    paddingBottom: rem(12),
  },
  archiveListInnerCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: rem(120),
  },
  centerPad: {
    paddingVertical: rem(20),
    alignItems: 'center',
    gap: rem(8),
  },
  muted: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
  },
  emptyHint: {
    marginTop: rem(6),
    fontSize: fp(12),
    fontFamily: fonts['400'],
    color: colors.neutral.darkGrey,
    textAlign: 'center',
  },
  errorText: {
    fontSize: fp(13),
    fontFamily: fonts['400'],
    color: colors.semantic.error,
    textAlign: 'center',
  },
  footerLoading: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: rem(8),
    paddingVertical: rem(10),
    borderTopWidth: 1,
    borderTopColor: 'rgba(96, 102, 197, 0.12)',
  },
  footerLoadingText: {
    fontSize: fp(12),
    fontFamily: fonts['500'],
    color: colors.neutral.darkGrey,
  },
});
