import type { ManagerOptions, SocketOptions } from 'socket.io-client';

/** Shared Socket.IO client tuning for fast, resilient reconnects. */
export const SOCKET_IO_CLIENT_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  timeout: 20000,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.3,
};

/** Fallback interval when Socket.IO exhausts its internal reconnect cycle. */
export const SOCKET_PERIODIC_RETRY_MS = 5000;

/** Debounce before showing offline in UI (avoids flicker on sub-second reconnects). */
export const SOCKET_OFFLINE_UI_DEBOUNCE_MS = 2000;

/**
 * If the socket stays disconnected this long (including stuck `socket.active` reconnect),
 * tear down and create a fresh Socket.IO client.
 */
export const SOCKET_STUCK_OFFLINE_FORCE_RECREATE_MS = 12000;
