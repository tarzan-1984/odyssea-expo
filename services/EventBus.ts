type Listener<T = any> = (payload: T) => void;

class EventBus {
  private listeners: Record<string, Set<Listener>> = {};

  on<T = any>(event: string, listener: Listener<T>) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(listener as Listener);
    return () => this.off(event, listener);
  }

  off<T = any>(event: string, listener: Listener<T>) {
    this.listeners[event]?.delete(listener as Listener);
  }

  emit<T = any>(event: string, payload: T) {
    this.listeners[event]?.forEach((l) => l(payload));
  }
}

export const eventBus = new EventBus();

// App event names
export const AppEvents = {
	NavigateToChat: 'navigate-to-chat',
	/** Open Work → Offers list (e.g. after tapping an offer-related push) */
	NavigateToOffers: 'navigate-to-offers',
  ChatRoomAdded: 'chatRoomAdded',
  ChatRoomUpdated: 'chatRoomUpdated',
  WebSocketReconnected: 'webSocketReconnected',
  WebSocketDisconnect: 'webSocketDisconnect',
  MessageRead: 'messageRead',
  MessageDeleted: 'messageDeleted',
  MessagesMarkedAsRead: 'messagesMarkedAsRead',
  DriverStatusUpdated: 'DRIVER_STATUS_UPDATED',
  /** Reload paginated archived LOAD chats when LOAD rooms change via WS/sync. */
  ArchivedLoadChatsNeedRefresh: 'ARCHIVED_LOAD_CHATS_NEED_REFRESH',
} as const;
