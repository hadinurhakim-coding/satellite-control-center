import { json } from '@sveltejs/kit';
import { readSettings, toStatus } from '$lib/server/settings';

export async function GET() {
  return json(toStatus(await readSettings()));
}
