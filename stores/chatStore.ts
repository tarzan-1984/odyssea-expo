import { create, type StateCreator } from 'zustand';
import type { ChatRoom, Message } from '@/components/ChatListItem';

type ChatState = {
  chatRooms: ChatRoom[];
  messagesByRoom: Record<string, Message[]>;
  messagesTab: 'chats' | 'shipments' | 'offers' | 'my-loads' | 'my-team';
  setMessagesTab: (tab: 'chats' | 'shipments' | 'offers' | 'my-loads' | 'my-team') => void;
  setChatRooms: (rooms: ChatRoom[]) => void;
  mergeChatRooms: (rooms: ChatRoom[]) => void;
  updateChatRoom: (chatRoomId: string, updates: Partial<ChatRoom>) => void;
  setMessages: (chatRoomId: string, messages: Message[]) => void;
  addMessage: (chatRoomId: string, message: Message) => void;
  updateMessage: (chatRoomId: string, messageId: string, updates: Partial<Message>) => void;
  removeMessage: (chatRoomId: string, messageId: string) => void;
  markMessagesRead: (chatRoomId: string, messageIds: string[], userId: string) => void;
  /** Optimistic sync when user taps "Read all" (before API / WebSocket). */
  markChatRoomsAsReadLocally: (chatRoomIds: string[], userId: string) => void;
  removeChatRoom: (chatRoomId: string) => void;
  reset: () => void;
};

const storeCreator: StateCreator<ChatState> = (set, get) => ({
  chatRooms: [],
  messagesByRoom: {},
  messagesTab: 'chats',
  setMessagesTab: (tab) => set({ messagesTab: tab }),

  setChatRooms: (rooms) => set({ chatRooms: rooms }),

  mergeChatRooms: (rooms) => {
    const map = new Map<string, ChatRoom>();
    get().chatRooms.forEach((r) => map.set(r.id, r));
    rooms.forEach((r) => {
      const existing = map.get(r.id);
      if (!existing) {
        map.set(r.id, r);
      } else {
        const next: ChatRoom = { ...existing, ...r } as ChatRoom;
        if (!r.participants?.length && existing.participants?.length) {
          next.participants = existing.participants;
        }
        map.set(r.id, next);
      }
    });
    set({ chatRooms: Array.from(map.values()) });
  },

  updateChatRoom: (chatRoomId, updates) => {
    set({
      chatRooms: get().chatRooms.map((room) =>
        room.id === chatRoomId ? ({ ...room, ...updates } as ChatRoom) : room
      ),
    });
  },

  setMessages: (chatRoomId, messages) => {
    set({
      messagesByRoom: { ...get().messagesByRoom, [chatRoomId]: messages },
    });
  },

  addMessage: (chatRoomId, message) => {
    const current = get().messagesByRoom[chatRoomId] || [];
    if (current.some((m) => m.id === message.id)) return;
    const next = [...current, message].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    set({ messagesByRoom: { ...get().messagesByRoom, [chatRoomId]: next } });

    // Update lastMessage in chat
    const room = get().chatRooms.find((r) => r.id === chatRoomId);
    if (room) {
      get().updateChatRoom(chatRoomId, { lastMessage: message });
    }
  },

  updateMessage: (chatRoomId, messageId, updates) => {
    const current = get().messagesByRoom[chatRoomId] || [];
    const next = current.map((m) => (m.id === messageId ? ({ ...m, ...updates } as Message) : m));
    set({ messagesByRoom: { ...get().messagesByRoom, [chatRoomId]: next } });

    const room = get().chatRooms.find((r) => r.id === chatRoomId);
    if (room?.lastMessage?.id === messageId) {
      get().updateChatRoom(chatRoomId, {
        lastMessage: { ...room.lastMessage, ...updates } as Message,
      });
    }
  },

  removeMessage: (chatRoomId, messageId) => {
    const current = get().messagesByRoom[chatRoomId] || [];
    const next = current.filter((m) => m.id !== messageId);
    set({ messagesByRoom: { ...get().messagesByRoom, [chatRoomId]: next } });

    const room = get().chatRooms.find((r) => r.id === chatRoomId);
    if (room?.lastMessage?.id === messageId) {
      get().updateChatRoom(chatRoomId, {
        lastMessage: next[next.length - 1],
      });
    }
  },

  markChatRoomsAsReadLocally: (chatRoomIds, userId) => {
    if (!chatRoomIds.length || !userId) return;

    const roomIdSet = new Set(chatRoomIds);
    const { chatRooms, messagesByRoom } = get();

    const nextMessagesByRoom = { ...messagesByRoom };
    for (const roomId of chatRoomIds) {
      const roomMessages = nextMessagesByRoom[roomId];
      if (!roomMessages?.length) continue;
      nextMessagesByRoom[roomId] = roomMessages.map((m) => {
        const readBy = m.readBy || [];
        const withUser = readBy.includes(userId) ? readBy : [...readBy, userId];
        return { ...m, isRead: true, readBy: withUser } as Message;
      });
    }

    const nextRooms = chatRooms.map((room) => {
      if (!roomIdSet.has(room.id)) return room;
      const next: ChatRoom = { ...room, unreadCount: 0 };
      if (room.lastMessage) {
        const readBy = room.lastMessage.readBy || [];
        const withUser = readBy.includes(userId) ? readBy : [...readBy, userId];
        next.lastMessage = {
          ...room.lastMessage,
          isRead: true,
          readBy: withUser,
        } as Message;
      }
      return next;
    });

    set({ chatRooms: nextRooms, messagesByRoom: nextMessagesByRoom });
  },

  markMessagesRead: (chatRoomId, messageIds, userId) => {
    // Update messages in room
    const current = get().messagesByRoom[chatRoomId] || [];
    if (current.length) {
      const next = current.map((m) => {
        if (!messageIds.includes(m.id)) return m;
        const readBy = m.readBy || [];
        const withUser = readBy.includes(userId) ? readBy : [...readBy, userId];
        return { ...m, isRead: true, readBy: withUser } as Message;
      });
      set({ messagesByRoom: { ...get().messagesByRoom, [chatRoomId]: next } });
    }

    // If last message is in the id list, update lastMessage
    const room = get().chatRooms.find((r) => r.id === chatRoomId);
    if (room?.lastMessage && messageIds.includes(room.lastMessage.id)) {
      const readBy = room.lastMessage.readBy || [];
      const withUser = readBy.includes(userId) ? readBy : [...readBy, userId];
      get().updateChatRoom(chatRoomId, {
        lastMessage: { ...room.lastMessage, isRead: true, readBy: withUser } as Message,
      });
    }
  },

  removeChatRoom: (chatRoomId) => {
    const state = get();
    const updatedRooms = state.chatRooms.filter((room) => room.id !== chatRoomId);
    const updatedMessages = { ...state.messagesByRoom };
    delete updatedMessages[chatRoomId];
    set({
      chatRooms: updatedRooms,
      messagesByRoom: updatedMessages,
    });
  },

  reset: () => {
    set({
      chatRooms: [],
      messagesByRoom: {},
    });
  },
});

export const useChatStore = create<ChatState>(storeCreator);

// Helpers to update only lastMessage fields safely
export function updateLastMessage(chatRoomId: string, next: Partial<Message>) {
  const { chatRooms, updateChatRoom } = useChatStore.getState();
  const room = chatRooms.find((r) => r.id === chatRoomId);
  if (!room || !room.lastMessage) return;
  updateChatRoom(chatRoomId, {
    lastMessage: {
      ...room.lastMessage,
      ...next,
    } as Message,
  });
}


