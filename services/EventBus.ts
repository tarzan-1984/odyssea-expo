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
  ChatRoomAdded: 'chatRoomAdded',
  ChatRoomUpdated: 'chatRoomUpdated',
  WebSocketReconnected: 'webSocketReconnected',
  WebSocketDisconnect: 'webSocketDisconnect',
  MessageRead: 'messageRead',
  MessagesMarkedAsRead: 'messagesMarkedAsRead',
} as const;
