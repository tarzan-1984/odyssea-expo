import { abbreviateStateInLocationString } from '@/utils/formatDriverLocation';
import { formatOfferChatDriverDisplayName } from '@/utils/chatPeerDisplayName';

const ROUTE_SEPARATORS = [' — ', ' - ', ' → ', '–'] as const;

/** Chat name format: "firstName lastName (id: offerId)\\npickUp - delivery" */
export function parseOfferChatRouteLine(chatName: string | null | undefined): string {
  if (!chatName?.trim()) return '';

  const lines = chatName.trim().split('\n');
  if (lines.length > 1) {
    return lines.slice(1).join('\n').trim();
  }

  return '';
}

function splitRouteHalves(route: string): [string, string] | null {
  for (const sep of ROUTE_SEPARATORS) {
    const idx = route.indexOf(sep);
    if (idx === -1) continue;

    const left = route.slice(0, idx).trim();
    const right = route.slice(idx + sep.length).trim();
    if (left && right) return [left, right];
  }

  return null;
}

/** Driver-facing offer route: abbreviated states, em dash between pick-up and delivery. */
export function formatOfferRouteLineForDriver(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return 'Offer';

  const halves = splitRouteHalves(trimmed);
  if (halves) {
    const [pickUp, delivery] = halves;
    return `${abbreviateStateInLocationString(pickUp)} — ${abbreviateStateInLocationString(delivery)}`;
  }

  return abbreviateStateInLocationString(trimmed);
}

export function getDriverOfferChatTitle(chatName: string | null | undefined): string {
  const route = parseOfferChatRouteLine(chatName);
  return formatOfferRouteLineForDriver(route || 'Offer');
}

export function isDriverViewer(role: string | null | undefined): boolean {
  return role?.trim().toUpperCase() === 'DRIVER';
}

function getOtherParticipant(
  chatRoom: {
    participants: Array<{ user: { id: string } }>;
  },
  currentUserId?: string | null,
) {
  return chatRoom.participants.find((participant) => participant.user.id !== currentUserId);
}

/** Staff-facing OFFER chat header: "unit firstName lastName\\nroute" (no offer id). */
export function getOfferChatStaffHeaderTitle(
  chatRoom: {
    name?: string;
    participants: Array<{
      user: {
        id: string;
        firstName: string;
        lastName: string;
        role?: string;
        externalId?: string | null;
        unit?: string;
      };
    }>;
  },
  currentUserId?: string | null,
): string {
  const otherParticipant = getOtherParticipant(chatRoom, currentUserId);
  if (!otherParticipant) {
    const fallbackLine =
      chatRoom.name?.split('\n')[0]?.replace(/\(id:\s*[^)]+\)/, '').trim() || 'Unknown Chat';
    return fallbackLine;
  }

  const driverName = formatOfferChatDriverDisplayName(otherParticipant.user);
  const route = parseOfferChatRouteLine(chatRoom.name);
  if (route) {
    return `${driverName}\n${formatOfferRouteLineForDriver(route)}`;
  }

  return driverName;
}
