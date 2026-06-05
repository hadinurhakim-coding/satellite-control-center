import { json } from '@sveltejs/kit';
import { stopSimulator } from '$lib/server/simulator';

export async function POST() {
  return json(await stopSimulator());
}
