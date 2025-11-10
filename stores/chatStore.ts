import { create, type StateCreator } from 'zustand';
import type { ChatRoom, Message } from '@/components/ChatListItem';

type ChatState = {
  chatRooms: ChatRoom[];
  messagesByRoom: Record<string, Message[]>;
  setChatRooms: (rooms: ChatRoom[]) => void;
  mergeChatRooms: (rooms: ChatRoom[]) => void;
  updateChatRoom: (chatRoomId: string, updates: Partial<ChatRoom>) => void;
  setMessages: (chatRoomId: string, messages: Message[]) => void;
  addMessage: (chatRoomId: string, message: Message) => void;
  updateMessage: (chatRoomId: string, messageId: string, updates: Partial<Message>) => void;
  markMessagesRead: (chatRoomId: string, messageIds: string[], userId: string) => void;
};

const storeCreator: StateCreator<ChatState> = (set, get) => ({
  chatRooms: [],
  messagesByRoom: {},

  setChatRooms: (rooms) => set({ chatRooms: rooms }),

  mergeChatRooms: (rooms) => {
    const map = new Map<string, ChatRoom>();
    get().chatRooms.forEach((r) => map.set(r.id, r));
    rooms.forEach((r) => {
      const existing = map.get(r.id);
      if (!existing) {
        map.set(r.id, r);
      } else {
        // merge lastMessage and updatedAt предпочтительно более новое
        const next: ChatRoom = { ...existing, ...r } as ChatRoom;
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

    // обновить lastMessage в чате
    const room = get().chatRooms.find((r) => r.id === chatRoomId);
    if (room) {
      get().updateChatRoom(chatRoomId, { lastMessage: message });
    }
  },

  updateMessage: (chatRoomId, messageId, updates) => {
    const current = get().messagesByRoom[chatRoomId] || [];
    const next = current.map((m) => (m.id === messageId ? ({ ...m, ...updates } as Message) : m));
    set({ messagesByRoom: { ...get().messagesByRoom, [chatRoomId]: next } });
  },

  markMessagesRead: (chatRoomId, messageIds, userId) => {
    // обновляем сообщения в комнате
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

    // если последнее сообщение — в списке id, обновляем lastMessage
    const room = get().chatRooms.find((r) => r.id === chatRoomId);
    if (room?.lastMessage && messageIds.includes(room.lastMessage.id)) {
      const readBy = room.lastMessage.readBy || [];
      const withUser = readBy.includes(userId) ? readBy : [...readBy, userId];
      get().updateChatRoom(chatRoomId, {
        lastMessage: { ...room.lastMessage, isRead: true, readBy: withUser } as Message,
      });
    }
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


