import snapshot from '../.generated/content.json';

export const docs: Record<string, { source: string; markdown: string }> = snapshot.docs;
export const sources: Record<string, string> = snapshot.sources;
