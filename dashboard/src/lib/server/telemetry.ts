import { readFile } from 'node:fs/promises';
import { telemetryJsonPath } from './paths';
import type { TelemetryPoint } from '$lib/types';

function isTelemetryPoint(value: unknown): value is TelemetryPoint {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.timestamp === 'string' &&
    typeof item.satellite_id === 'number' &&
    typeof item.temperature === 'number' &&
    typeof item.power === 'number' &&
    typeof item.altitude === 'number' &&
    typeof item.signal_strength === 'number'
  );
}

export async function readTelemetry(): Promise<TelemetryPoint[]> {
  try {
    const raw = await readFile(telemetryJsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isTelemetryPoint)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  } catch {
    return [];
  }
}

export function latestBySatellite(points: TelemetryPoint[]): TelemetryPoint[] {
  const latest = new Map<number, TelemetryPoint>();
  for (const point of points) {
    const current = latest.get(point.satellite_id);
    if (!current || Date.parse(point.timestamp) > Date.parse(current.timestamp)) {
      latest.set(point.satellite_id, point);
    }
  }
  return [...latest.values()].sort((a, b) => a.satellite_id - b.satellite_id);
}
