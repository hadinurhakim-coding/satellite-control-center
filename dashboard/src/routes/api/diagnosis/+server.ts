import { json, type RequestHandler } from '@sveltejs/kit';
import { diagnoseWithGemini } from '$lib/server/gemini';
import { readSettings } from '$lib/server/settings';
import { readTelemetry } from '$lib/server/telemetry';
import { isInSatelliteOperationsContext } from '$lib/server/topic-guard';

export const POST: RequestHandler = async ({ request }) => {
  const { question = '' } = (await request.json().catch(() => ({}))) as { question?: string };
  if (!isInSatelliteOperationsContext(question)) {
    return json({
      diagnosis: 'You are asking outside the context.',
      severity: 'unknown',
      affectedSatellites: [],
      recommendedActions: ['Ask about satellite telemetry, signal, power, temperature, altitude, or fleet health.'],
      model: 'topic-guard'
    });
  }

  const settings = await readSettings();

  if (!settings.apiKey) {
    return json(
      { message: 'Gemini is not configured. Add your API key on the Settings page.' },
      { status: 400 }
    );
  }

  const telemetry = await readTelemetry();
  if (telemetry.length === 0) {
    return json({ message: 'No telemetry data found. Start the Go simulator first.' }, { status: 400 });
  }

  try {
    return json(await diagnoseWithGemini(settings, question, telemetry));
  } catch (error) {
    return json(
      { message: error instanceof Error ? error.message : 'Gemini diagnosis failed.' },
      { status: 502 }
    );
  }
};
