import { json } from '@sveltejs/kit';
import { startSimulator } from '$lib/server/simulator';

export async function POST() {
  return json(await startSimulator());
}
