/** In-memory locks so dispatch + background flush don't double-upload the same outbox item. */
const activeMediaUploads = new Set<string>();

export function beginOutboxMediaUpload(clientMessageId: string): boolean {
	if (activeMediaUploads.has(clientMessageId)) return false;
	activeMediaUploads.add(clientMessageId);
	return true;
}

export function endOutboxMediaUpload(clientMessageId: string): void {
	activeMediaUploads.delete(clientMessageId);
}

export function isOutboxMediaUploadActive(clientMessageId: string): boolean {
	return activeMediaUploads.has(clientMessageId);
}

export function hasActiveOutboxMediaUploads(): boolean {
	return activeMediaUploads.size > 0;
}
