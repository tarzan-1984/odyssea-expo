let currentChatRoomId: string | null = null;

export function setActiveChatRoomId(chatRoomId: string | null): void {
  currentChatRoomId = chatRoomId;
}

export function getActiveChatRoomId(): string | null {
  return currentChatRoomId;
}


