import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { forceSyncChatRoomsFromApi } from '@/services/chatRoomsForegroundSync';

/**
 * Keeps chat list + unread badge in sync app-wide (not only on Messages screen).
 * Drivers on Home still see the chat tab badge after a background push.
 */
export function useGlobalChatRoomsSync(): void {
	const { authState } = useAuth();
	const appStateRef = useRef<AppStateStatus>(AppState.currentState);
	const wasInBackgroundRef = useRef(false);
	const initialLoadDoneRef = useRef(false);

	useEffect(() => {
		if (!authState.isAuthenticated) {
			initialLoadDoneRef.current = false;
			return;
		}

		const syncOptions = {
			userId: authState.user?.id,
			userRole: authState.user?.role,
		};

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
				void forceSyncChatRoomsFromApi(syncOptions).catch((error) => {
					console.error('[GlobalChatRoomsSync] Foreground sync failed:', error);
				});
			}

			appStateRef.current = nextAppState;
		});

		return () => subscription.remove();
	}, [authState.isAuthenticated, authState.user?.id, authState.user?.role]);
}
