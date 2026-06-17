import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '@/components/ChatListItem';

const OUTBOX_STORAGE_KEY = '@chat_message_outbox_v1';

export type OutboxMessageKind = 'text' | 'media';

export type OutboxLocalFile = {
	uri: string;
	name: string;
	mimeType?: string;
	size?: number;
	originalName?: string;
};

export type OutboxUploadedAttachment = {
	fileUrl: string;
	fileName: string;
	fileSize: number;
};

export type ChatOutboxItem = {
	clientMessageId: string;
	chatRoomId: string;
	kind: OutboxMessageKind;
	content: string;
	replyData?: Message['replyData'];
	localFiles?: OutboxLocalFile[];
	uploadedAttachments?: OutboxUploadedAttachment[];
	status: 'uploading' | 'sending' | 'failed';
	serverMessageId?: string;
	createdAt: string;
	retryCount: number;
};

class ChatOutboxService {
	private async readAll(): Promise<ChatOutboxItem[]> {
		try {
			const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
			if (!raw) return [];
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as ChatOutboxItem[]) : [];
		} catch {
			return [];
		}
	}

	private async writeAll(items: ChatOutboxItem[]): Promise<void> {
		await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
	}

	async getAll(): Promise<ChatOutboxItem[]> {
		return this.readAll();
	}

	async getForRoom(chatRoomId: string): Promise<ChatOutboxItem[]> {
		const all = await this.readAll();
		return all
			.filter((item) => item.chatRoomId === chatRoomId)
			.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
	}

	async getPending(): Promise<ChatOutboxItem[]> {
		const all = await this.readAll();
		return all.filter((item) => item.status === 'uploading' || item.status === 'sending');
	}

	async upsert(item: ChatOutboxItem): Promise<void> {
		const all = await this.readAll();
		const index = all.findIndex((row) => row.clientMessageId === item.clientMessageId);
		if (index >= 0) {
			all[index] = item;
		} else {
			all.push(item);
		}
		await this.writeAll(all);
	}

	async patch(
		clientMessageId: string,
		patch: Partial<ChatOutboxItem>,
	): Promise<ChatOutboxItem | null> {
		const all = await this.readAll();
		const index = all.findIndex((row) => row.clientMessageId === clientMessageId);
		if (index < 0) return null;
		const next = { ...all[index], ...patch };
		all[index] = next;
		await this.writeAll(all);
		return next;
	}

	async remove(clientMessageId: string): Promise<void> {
		const all = await this.readAll();
		const next = all.filter((row) => row.clientMessageId !== clientMessageId);
		if (next.length === all.length) return;
		await this.writeAll(next);
	}

	async markAcknowledged(clientMessageId: string, serverMessageId: string): Promise<void> {
		await this.patch(clientMessageId, { serverMessageId, status: 'sending' });
	}

	async markFailed(clientMessageId: string): Promise<void> {
		const item = await this.patch(clientMessageId, { status: 'failed' });
		if (!item) return;
		await this.patch(clientMessageId, { retryCount: (item.retryCount ?? 0) + 1 });
	}

	async clearAll(): Promise<void> {
		await AsyncStorage.removeItem(OUTBOX_STORAGE_KEY);
	}
}

export const chatOutboxService = new ChatOutboxService();

export function createClientMessageId(): string {
	return `cmid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}
