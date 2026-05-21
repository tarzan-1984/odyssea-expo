import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { colors, fonts, rem, fp, borderRadius } from '@/lib';
import ArrowDownIcon from '@/icons/ArrowDownIcon';
import ChatListItem, { ChatRoom } from '@/components/ChatListItem';
import { chatApi } from '@/app-api/chatApi';
import { eventBus, AppEvents } from '@/services/EventBus';
import { ARCHIVED_LOAD_CHATS_QUERY_KEY } from '@/components/loadArchivedChatsQueryKey';

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

function normalizeParticipants(participants: any[]): ChatRoom['participants'] {
  return (participants ?? []).map((p) => ({
    ...p,
    user: {
      ...p.user,
      avatar: p.user.avatar || p.user.profilePhoto,
    },
  }));
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
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const mergeNormalized = useCallback((list: ChatRoom[]): ChatRoom[] => {
    return list.map((room) => ({
      ...room,
      participants: normalizeParticipants(room.participants || []),
      name: archivedChatTitle(room),
      isLoadArchived: true as const,
    }));
  }, []);

  const patchArchiveRoomInState = useCallback(
    (chatRoomId: string, updates: Partial<ChatRoom>) => {
      queryClient.setQueryData<
        InfiniteData<ArchivedPage>
      >([...ARCHIVED_LOAD_CHATS_QUERY_KEY], (prev) => {
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
      });
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

  useEffect(() => {
    if (displayRooms.length > 0) {
      mergeChatRooms(displayRooms);
    }
  }, [displayRooms, mergeChatRooms]);

  useEffect(() => {
    const off = eventBus.on(AppEvents.ArchivedLoadChatsNeedRefresh, () => {
      void queryClient.invalidateQueries({
        queryKey: [...ARCHIVED_LOAD_CHATS_QUERY_KEY],
      });
    });
    return () => void off();
  }, [queryClient]);

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const closeAllDropdowns = useCallback(() => {
    setOpenDropdownId?.(null);
  }, [setOpenDropdownId]);

  const onToggle = useCallback(() => {
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
    return (
      <View style={styles.centerPad}>
        <Text style={styles.muted}>No archived shipments</Text>
      </View>
    );
  }, [error, isError, isPending]);

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
          <FlatList
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={[styles.listPanel, pinnedToBottom && styles.listPanelSticky]}
            contentContainerStyle={
              displayRooms.length === 0
                ? [
                    styles.archiveListPaddingOnly,
                    styles.archiveListInnerCentered,
                  ]
                : styles.archiveListPaddingOnly
            }
            data={displayRooms}
            keyExtractor={(item) => `arch-${item.id}`}
            renderItem={renderItem}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.35}
          />
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
  listPanel: {
    maxHeight: rem(340),
    borderTopWidth: 1,
    borderTopColor: 'rgba(96, 102, 197, 0.15)',
    backgroundColor: 'rgba(247, 248, 255, 0.96)',
  },
  listPanelSticky: {
    maxHeight: rem(280),
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
