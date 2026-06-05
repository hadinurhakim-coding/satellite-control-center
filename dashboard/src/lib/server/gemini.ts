import type { DiagnosisResult, GeminiSettings, TelemetryPoint } from '$lib/types';

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
};

export async function diagnoseWithGemini(
  settings: GeminiSettings,
  question: string,
  telemetry: TelemetryPoint[]
): Promise<DiagnosisResult> {
  if (!settings.apiKey) {
    throw new Error('Gemini is not configured. Add your API key on the Settings page.');
  }

  const prompt = buildPrompt(question, telemetry);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    settings.model
  )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        responseMimeType: 'application/json'
      }
    })
  });

  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Gemini request failed.');
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
  return parseDiagnosis(text, settings.model);
}

function buildPrompt(question: string, telemetry: TelemetryPoint[]): string {
  const recent = telemetry.slice(-30);
  return `You are an AI satellite operations engineer.

Analyze the telemetry and answer only as JSON with this exact shape:
{
  "diagnosis": "brief operational diagnosis",
  "severity": "normal | warning | critical | unknown",
  "affectedSatellites": ["SAT1"],
  "recommendedActions": ["action 1", "action 2"]
}

Rules:
- Base the answer only on the telemetry provided.
- Mention satellite IDs as SAT1, SAT2, etc.
- Use warning when a metric is drifting or near unsafe range.
- Use critical when temperature, power, altitude, or signal appears operationally unsafe.
- If data is insufficient, use severity "unknown".

Operator question: ${question || 'Analyze the latest satellite telemetry and identify anomalies.'}

Telemetry JSON:
${JSON.stringify(recent, null, 2)}`;
}

function parseDiagnosis(text: string, model: string): DiagnosisResult {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<DiagnosisResult>;
    return {
      diagnosis: parsed.diagnosis || 'Gemini returned an empty diagnosis.',
      severity: normalizeSeverity(parsed.severity),
      affectedSatellites: Array.isArray(parsed.affectedSatellites) ? parsed.affectedSatellites : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
      model
    };
  } catch {
    return {
      diagnosis: cleaned || 'Gemini returned an empty diagnosis.',
      severity: 'unknown',
      affectedSatellites: [],
      recommendedActions: [],
      model
    };
  }
}

function normalizeSeverity(value: unknown): DiagnosisResult['severity'] {
  return value === 'normal' || value === 'warning' || value === 'critical' || value === 'unknown'
    ? value
    : 'unknown';
}
