import type { ChatRoom } from '@/components/ChatListItem';

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function isPhoneLikeQuery(query: string): boolean {
  const trimmed = query.replace(/\s/g, '');
  if (!trimmed) return false;
  const digits = normalizePhoneDigits(trimmed);
  return digits.length >= 3 && digits.length / trimmed.length >= 0.5;
}

export type UserSearchFields = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
};

/** Match contact/user against name, email, externalId, or phone (digits-normalized). */
export function userMatchesSearchQuery(user: UserSearchFields, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  const phone = String(user.phone ?? '').trim();
  if (phone && isPhoneLikeQuery(q)) {
    if (phoneMatchesQuery(phone, q.toLowerCase(), normalizePhoneDigits(q))) {
      return true;
    }
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  return tokens.every((token) => {
    const tLower = token.toLowerCase();
    const tDigits = normalizePhoneDigits(token);
    const haystack = `${user.firstName ?? ''} ${user.lastName ?? ''} ${user.email ?? ''}`.toLowerCase();
    if (haystack.includes(tLower)) return true;

    const externalId = String(user.externalId ?? '').trim();
    if (externalId && externalId.toLowerCase().includes(tLower)) return true;

    if (phone && phoneMatchesQuery(phone, tLower, tDigits)) return true;

    return false;
  });
}

function phoneMatchesQuery(phoneRaw: string, qLower: string, qDigits: string): boolean {
  const phone = phoneRaw.trim();
  if (!phone) return false;
  if (phone.toLowerCase().includes(qLower)) return true;
  if (qDigits.length < 3) return false;
  return normalizePhoneDigits(phone).includes(qDigits);
}

function collectSearchPhones(chatRoom: ChatRoom): string[] {
  const phones: string[] = [];
  for (const participant of chatRoom.participants) {
    const phone = String(participant.user.phone ?? '').trim();
    if (phone) phones.push(phone);
  }
  const lastMessage = chatRoom.lastMessage;
  if (lastMessage?.sender?.phone) {
    phones.push(String(lastMessage.sender.phone));
  }
  if (lastMessage?.receiver?.phone) {
    phones.push(String(lastMessage.receiver.phone));
  }
  return phones;
}

function collectSearchExternalIds(chatRoom: ChatRoom): string[] {
  const externalIds: string[] = [];
  for (const participant of chatRoom.participants) {
    const externalId = String(participant.user.externalId ?? '').trim();
    if (externalId) externalIds.push(externalId);
  }
  const lastMessage = chatRoom.lastMessage;
  if (lastMessage?.sender?.externalId) {
    externalIds.push(String(lastMessage.sender.externalId).trim());
  }
  if (lastMessage?.receiver?.externalId) {
    externalIds.push(String(lastMessage.receiver.externalId).trim());
  }
  return externalIds;
}

function externalIdMatchesQuery(externalIdRaw: string, qLower: string): boolean {
  const externalId = externalIdRaw.trim();
  if (!externalId) return false;
  return externalId.toLowerCase().includes(qLower);
}

/** Display name + optional LOAD participant phones / driver externalIds. */
export function chatRoomMatchesSearchQuery(
  chatRoom: ChatRoom,
  query: string,
  getDisplayName: (room: ChatRoom) => string,
  options?: { includeParticipantPhones?: boolean },
): boolean {
  const q = query.trim();
  if (!q) return true;

	const qLower = q.toLowerCase();
  if (getDisplayName(chatRoom).toLowerCase().includes(qLower)) {
    return true;
  }

  const loadId = chatRoom.loadId?.trim();
  if (loadId && loadId.toLowerCase().includes(qLower)) {
    return true;
  }

  if (options?.includeParticipantPhones === false) {
    return false;
  }

  const qDigits = normalizePhoneDigits(q);
  for (const phone of collectSearchPhones(chatRoom)) {
    if (phoneMatchesQuery(phone, qLower, qDigits)) {
      return true;
    }
  }

  for (const externalId of collectSearchExternalIds(chatRoom)) {
    if (externalIdMatchesQuery(externalId, qLower)) {
      return true;
    }
  }

  return false;
}
