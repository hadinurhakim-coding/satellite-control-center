import { json } from '@sveltejs/kit';
import { latestBySatellite, readTelemetry } from '$lib/server/telemetry';

export async function GET() {
  const telemetry = await readTelemetry();
  return json({
    satellites: latestBySatellite(telemetry),
    recent: telemetry.slice(-50),
    count: telemetry.length
  });
}
