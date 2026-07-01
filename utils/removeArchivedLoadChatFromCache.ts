import { type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { type ChatRoom } from '@/components/ChatListItem';
import { ARCHIVED_LOAD_CHATS_QUERY_KEY } from '@/components/loadArchivedChatsQueryKey';

type ArchivedPage = {
  chatRooms: ChatRoom[];
  pagination: { page: number; limit: number; hasMore: boolean };
};

/** Removes a LOAD chat from archived infinite-query cache when it is reactivated. */
export function removeArchivedLoadChatFromCache(
  queryClient: QueryClient,
  chatRoomId: string,
): void {
  queryClient.setQueriesData<InfiniteData<ArchivedPage>>(
    { queryKey: [...ARCHIVED_LOAD_CHATS_QUERY_KEY] },
    (prev) => {
      if (!prev?.pages?.length) return prev;

      const pages = prev.pages.map((page) => ({
        ...page,
        chatRooms: page.chatRooms.filter((room) => room.id !== chatRoomId),
      }));

      const changed = pages.some(
        (page, index) =>
          page.chatRooms.length !== prev.pages[index].chatRooms.length,
      );
      if (!changed) return prev;

      return { ...prev, pages };
    },
  );
}
