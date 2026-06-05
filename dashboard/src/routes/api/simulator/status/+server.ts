import { json } from '@sveltejs/kit';
import { getSimulatorStatus } from '$lib/server/simulator';

export async function GET() {
  return json(await getSimulatorStatus());
}
