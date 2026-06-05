import { json, type RequestHandler } from '@sveltejs/kit';
import { saveSettings } from '$lib/server/settings';
import type { GeminiSettings } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as Partial<GeminiSettings>;
  const status = await saveSettings({
    apiKey: String(body.apiKey ?? ''),
    model: String(body.model ?? 'gemini-2.5-flash'),
    temperature: Number(body.temperature ?? 0.2),
    maxOutputTokens: Number(body.maxOutputTokens ?? 1024)
  });

  return json(status);
};
