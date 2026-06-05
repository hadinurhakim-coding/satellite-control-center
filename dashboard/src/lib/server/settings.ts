import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { runtimeDir, settingsPath } from './paths';
import type { GeminiSettings, SettingsStatus } from '$lib/types';

const defaults = {
  model: 'gemini-2.5-flash',
  temperature: 0.2,
  maxOutputTokens: 1024
};

const deprecatedModels = new Set(['gemini-1.5-flash']);

export async function readSettings(): Promise<GeminiSettings> {
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GeminiSettings>;
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: normalizeModel(parsed.model),
      temperature:
        typeof parsed.temperature === 'number' ? parsed.temperature : defaults.temperature,
      maxOutputTokens:
        typeof parsed.maxOutputTokens === 'number'
          ? parsed.maxOutputTokens
          : defaults.maxOutputTokens
    };
  } catch {
    return { apiKey: '', ...defaults };
  }
}

export async function saveSettings(settings: GeminiSettings): Promise<SettingsStatus> {
  const normalized: GeminiSettings = {
    apiKey: settings.apiKey.trim(),
    model: normalizeModel(settings.model),
    temperature: clampNumber(settings.temperature, 0, 1, defaults.temperature),
    maxOutputTokens: Math.round(clampNumber(settings.maxOutputTokens, 64, 8192, defaults.maxOutputTokens))
  };

  await mkdir(runtimeDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(normalized, null, 2), 'utf-8');
  return toStatus(normalized);
}

export function toStatus(settings: GeminiSettings): SettingsStatus {
  return {
    configured: Boolean(settings.apiKey),
    model: settings.model,
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeModel(value: unknown): string {
  if (typeof value !== 'string') return defaults.model;
  const model = value.trim();
  if (!model || deprecatedModels.has(model)) return defaults.model;
  return model;
}
