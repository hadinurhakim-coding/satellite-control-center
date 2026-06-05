import type { DiagnosisResult, GeminiSettings, TelemetryPoint } from '$lib/types';

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
  };
  finishReason?: string;
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
        maxOutputTokens: Math.max(settings.maxOutputTokens, 1024),
        thinkingConfig: {
          thinkingBudget: 0
        },
        responseMimeType: 'application/json'
      }
    })
  });

  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Gemini request failed.');
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n') ?? '';
  const finishReason = payload.candidates?.[0]?.finishReason;
  return parseDiagnosis(text, settings.model, telemetry, finishReason);
}

function buildPrompt(question: string, telemetry: TelemetryPoint[]): string {
  const recent = summarizeTelemetry(telemetry);
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
- Keep the diagnosis under 45 words.
- Return valid JSON only. Do not include markdown, comments, or extra text.

Operator question: ${question || 'Analyze the latest satellite telemetry and identify anomalies.'}

Telemetry JSON:
${JSON.stringify(recent, null, 2)}`;
}

function parseDiagnosis(
  text: string,
  model: string,
  telemetry: TelemetryPoint[],
  finishReason?: string
): DiagnosisResult {
  const cleaned = stripMarkdownFence(text);
  const jsonText = extractJsonObject(cleaned);
  try {
    const parsed = JSON.parse(jsonText) as Partial<DiagnosisResult>;
    const result = normalizeDiagnosis(parsed, model);
    if (result.diagnosis) return result;
  } catch {
    // Fall through to deterministic telemetry-based fallback.
  }

  return fallbackDiagnosis(telemetry, model, finishReason);
}

function normalizeSeverity(value: unknown): DiagnosisResult['severity'] {
  return value === 'normal' || value === 'warning' || value === 'critical' || value === 'unknown'
    ? value
    : 'unknown';
}

function normalizeDiagnosis(parsed: Partial<DiagnosisResult>, model: string): DiagnosisResult {
  return {
    diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis.trim() : '',
    severity: normalizeSeverity(parsed.severity),
    affectedSatellites: normalizeStringArray(parsed.affectedSatellites),
    recommendedActions: normalizeStringArray(parsed.recommendedActions),
    model
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function stripMarkdownFence(text: string): string {
  return text.replace(/```json|```/g, '').trim();
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return text;
  return text.slice(start, end + 1);
}

function summarizeTelemetry(telemetry: TelemetryPoint[]): TelemetryPoint[] {
  const latest = new Map<number, TelemetryPoint>();
  for (const point of telemetry) {
    const current = latest.get(point.satellite_id);
    if (!current || Date.parse(point.timestamp) > Date.parse(current.timestamp)) {
      latest.set(point.satellite_id, point);
    }
  }
  return [...latest.values()].sort((a, b) => a.satellite_id - b.satellite_id);
}

function fallbackDiagnosis(
  telemetry: TelemetryPoint[],
  model: string,
  finishReason?: string
): DiagnosisResult {
  const latest = summarizeTelemetry(telemetry);
  if (latest.length === 0) {
    return {
      diagnosis: 'No telemetry is available for diagnosis.',
      severity: 'unknown',
      affectedSatellites: [],
      recommendedActions: ['Start the IoT simulator and wait for telemetry samples.'],
      model
    };
  }

  const weakSignal = latest.filter((point) => point.signal_strength < -88);
  const lowPower = latest.filter((point) => point.power < 85);
  const hot = latest.filter((point) => point.temperature >= 31);
  const critical = latest.filter(
    (point) => point.signal_strength < -94 || point.power < 65 || point.temperature >= 34
  );

  const affected = [...new Set([...weakSignal, ...lowPower, ...hot].map((point) => `SAT${point.satellite_id}`))];
  const severity: DiagnosisResult['severity'] =
    critical.length > 0 ? 'critical' : affected.length > 0 ? 'warning' : 'normal';

  const findings: string[] = [];
  if (weakSignal.length) {
    findings.push(
      `weak signal on ${weakSignal
        .map((point) => `SAT${point.satellite_id} (${point.signal_strength.toFixed(1)} dBm)`)
        .join(', ')}`
    );
  }
  if (lowPower.length) {
    findings.push(
      `low power on ${lowPower
        .map((point) => `SAT${point.satellite_id} (${point.power.toFixed(1)} W)`)
        .join(', ')}`
    );
  }
  if (hot.length) {
    findings.push(
      `high temperature on ${hot
        .map((point) => `SAT${point.satellite_id} (${point.temperature.toFixed(1)} C)`)
        .join(', ')}`
    );
  }

  const diagnosis =
    findings.length > 0
      ? `Telemetry indicates ${findings.join('; ')}.`
      : 'Latest telemetry is within the expected operating range.';

  const suffix =
    finishReason === 'MAX_TOKENS'
      ? ' Gemini response was truncated, so this result uses telemetry fallback.'
      : '';

  return {
    diagnosis: `${diagnosis}${suffix}`,
    severity,
    affectedSatellites: affected,
    recommendedActions:
      severity === 'normal'
        ? ['Continue monitoring telemetry trends.']
        : [
            'Check antenna alignment and ground-station link quality.',
            'Review recent telemetry trend for the affected satellite.',
            'Escalate if signal, power, or temperature continues degrading.'
          ],
    model
  };
}
