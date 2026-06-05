import { json } from '@sveltejs/kit';
import { readTelemetry } from '$lib/server/telemetry';

export async function GET() {
  const telemetry = await readTelemetry();
  return json({ telemetry, count: telemetry.length });
}
