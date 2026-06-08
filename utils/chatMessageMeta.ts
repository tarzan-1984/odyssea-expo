import type { Message } from '@/components/ChatListItem';

const LOAD_TRACKING_ROLES = new Set([
	'TRACKING_TL',
	'TRACKING',
	'MORNING_TRACKING',
	'NIGHTSHIFT_TRACKING',
]);

export type IncomingMessageMeta = {
	senderNameLabel: string;
	phone: string | null;
	showPhone: boolean;
	showFooter: boolean;
};

/** Incoming footer: phone only (role + time are shown inside the bubble). */
export function getIncomingMessageMeta(
	message: Message,
	chatType?: string
): IncomingMessageMeta {
	const senderFirstName = String(message.sender?.firstName ?? '').trim();
	const senderExternalId = String(
		(message.sender as { externalId?: string | null })?.externalId ?? ''
	).trim();
	const senderRole = message.sender?.role?.toUpperCase().trim() ?? '';
	const senderPhone = String((message.sender as { phone?: string | null })?.phone ?? '').trim();
	const normalizedChatType = (chatType || '').trim().toUpperCase();

	const isDriverSender = senderRole === 'DRIVER';
	const isLoadTrackingRoleSender = LOAD_TRACKING_ROLES.has(senderRole);
	const shouldShowDriverExternalId = isDriverSender && Boolean(senderExternalId);
	const driverExternalIdPrefix = shouldShowDriverExternalId ? `(${senderExternalId}) ` : '';

	const shouldShowPhone =
		Boolean(senderPhone) &&
		(normalizedChatType === 'LOAD'
			? isDriverSender || isLoadTrackingRoleSender
			: isDriverSender);

	const senderNameLabel = `${driverExternalIdPrefix}${senderFirstName}`.trim();

	return {
		senderNameLabel,
		phone: shouldShowPhone ? senderPhone : null,
		showPhone: shouldShowPhone,
		showFooter: shouldShowPhone,
	};
}

export function getPhoneDialUrl(phone: string): string | null {
	const cleaned = phone.replace(/[^\d+]/g, '');
	if (cleaned) return `tel:${cleaned}`;
	const trimmed = phone.trim();
	return trimmed ? `tel:${encodeURIComponent(trimmed)}` : null;
}
