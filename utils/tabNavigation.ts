import { router, type Href } from 'expo-router';

export type TabRoot = '/final-verify' | '/work' | '/messages' | '/profile' | '/settings';

const NAV_LOCK_MS = 400;
let navLockedUntil = 0;

function normalizePath(pathname: string): string {
	const trimmed = (pathname || '').replace(/\/$/, '');
	return trimmed || '/';
}

/** True when pathname is already the tab root (no nested screens). */
export function isOnTabRoot(pathname: string, tab: TabRoot): boolean {
	const path = normalizePath(pathname);
	switch (tab) {
		case '/messages':
			return path === '/messages';
		case '/work':
			return path === '/work';
		case '/profile':
			return path === '/profile';
		case '/settings':
			return path === '/settings';
		case '/final-verify':
			return path.includes('final-verify');
		default:
			return path === tab;
	}
}

/** True when the active tab section matches (including nested routes). */
export function isInTabSection(pathname: string, tab: TabRoot): boolean {
	const path = normalizePath(pathname);
	switch (tab) {
		case '/messages':
			return path.includes('messages') || path.includes('/chat');
		case '/work':
			return path.includes('work');
		case '/profile':
			return path.includes('profile');
		case '/settings':
			return path.includes('settings');
		case '/final-verify':
			return path.includes('final-verify');
		default:
			return path === tab;
	}
}

/**
 * Switch to a main tab without stacking routes (dismissTo root).
 * Skips when already on tab root; pops nested screens when on same tab.
 */
export function navigateToTabRoot(pathname: string, tab: TabRoot): void {
	const now = Date.now();
	if (now < navLockedUntil) return;

	if (isOnTabRoot(pathname, tab)) return;

	navLockedUntil = now + NAV_LOCK_MS;
	router.dismissTo(tab as Href);
}
