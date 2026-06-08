import type { ChatRoom } from '@/components/ChatListItem';

const EXPIRED_DRIVER_ALLOWED_ROLES = new Set([
	'RECRUITER',
	'RECRUITER_TL',
	'ADMINISTRATOR',
	'EXPEDITE_MANAGER',
]);

export function countTotalUnreadMessages(
	chatRooms: ChatRoom[],
	options: {
		userId?: string;
		userRole?: string;
		driverStatus?: string | null;
	}
): number {
	const { userId, userRole, driverStatus } = options;
	const isExpiredDocumentsDriver =
		userRole === 'DRIVER' && driverStatus === 'expired_documents';

	return chatRooms.reduce((total, room) => {
		if (isExpiredDocumentsDriver) {
			if (room.type !== 'DIRECT') return total;
			const otherParticipant = room.participants.find((p) => p.user.id !== userId);
			const otherRole = otherParticipant?.user.role;
			if (!otherRole || !EXPIRED_DRIVER_ALLOWED_ROLES.has(otherRole)) {
				return total;
			}
		}
		return total + (room.unreadCount || 0);
	}, 0);
}
