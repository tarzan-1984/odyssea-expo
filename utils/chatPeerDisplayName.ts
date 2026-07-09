import type { User } from '@/components/ChatListItem';

function getDriverUnitNumber(user: {
  externalId?: string | null;
  unit?: string | null;
}): string {
  return String(user.externalId ?? user.unit ?? '').trim();
}

/** DIRECT / OFFER list title for the other participant when they are a driver. */
export function formatChatPeerDisplayName(
  user: Pick<User, 'firstName' | 'lastName' | 'role' | 'externalId' | 'unit'>,
): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Unknown';
  const isDriver = user.role?.toUpperCase().trim() === 'DRIVER';
  const unitNumber = getDriverUnitNumber(user);

  if (isDriver && unitNumber) {
    return `${unitNumber} ${name}`;
  }

  return name;
}

/** OFFER chat driver title: "(U:3343) firstName lastName". */
export function formatOfferChatDriverDisplayName(
  user: Pick<User, 'firstName' | 'lastName' | 'role' | 'externalId' | 'unit'>,
): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Unknown';
  const isDriver = user.role?.toUpperCase().trim() === 'DRIVER';
  const unitNumber = getDriverUnitNumber(user);

  if (isDriver && unitNumber) {
    return `(U:${unitNumber}) ${name}`;
  }

  return name;
}
