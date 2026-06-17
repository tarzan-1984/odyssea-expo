import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { forceSyncChatRoomsFromApi } from '@/services/chatRoomsForegroundSync';
import { catchUpChatsOnReconnect } from '@/services/chatReconnectSync';
import { eventBus, AppEvents } from '@/services/EventBus';

/**
 * Keeps chat list + unread badge in sync app-wide (not only on Messages screen).
 * Drivers on Home still see the chat tab badge after a background push.
 */
export function useGlobalChatRoomsSync(): void {
	const { authState } = useAuth();
	const appStateRef = useRef<AppStateStatus>(AppState.currentState);
	const wasInBackgroundRef = useRef(false);
	const initialLoadDoneRef = useRef(false);
	const isCatchUpRunningRef = useRef(false);

	const syncOptions = {
		userId: authState.user?.id,
		userRole: authState.user?.role,
	};

	const runCatchUp = () => {
		if (!authState.isAuthenticated || isCatchUpRunningRef.current) {
			return;
		}
		isCatchUpRunningRef.current = true;
		void catchUpChatsOnReconnect(syncOptions)
			.catch((error) => {
				console.error('[GlobalChatRoomsSync] Catch-up sync failed:', error);
			})
			.finally(() => {
				isCatchUpRunningRef.current = false;
			});
	};

	useEffect(() => {
		if (!authState.isAuthenticated) {
			initialLoadDoneRef.current = false;
			return;
		}

		if (!initialLoadDoneRef.current) {
			initialLoadDoneRef.current = true;
			void forceSyncChatRoomsFromApi(syncOptions).catch((error) => {
				console.error('[GlobalChatRoomsSync] Initial sync failed:', error);
			});
		}

		const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
			if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
				wasInBackgroundRef.current = true;
			}

			if (nextAppState === 'active' && wasInBackgroundRef.current) {
				wasInBackgroundRef.current = false;
				runCatchUp();
			}

			appStateRef.current = nextAppState;
		});

		const offReconnect = eventBus.on(AppEvents.WebSocketReconnected, () => {
			runCatchUp();
		});

		return () => {
			subscription.remove();
			offReconnect();
		};
	}, [authState.isAuthenticated, authState.user?.id, authState.user?.role]);
}
