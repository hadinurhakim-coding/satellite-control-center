export type TelemetryPoint = {
  timestamp: string;
  satellite_id: number;
  temperature: number;
  power: number;
  altitude: number;
  signal_strength: number;
};

export type GeminiSettings = {
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
};

export type SettingsStatus = {
  configured: boolean;
  model: string;
  temperature: number;
  maxOutputTokens: number;
};

export type DiagnosisResult = {
  diagnosis: string;
  severity: 'normal' | 'warning' | 'critical' | 'unknown';
  affectedSatellites: string[];
  recommendedActions: string[];
  model: string;
};

export type SimulatorStatus = {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  message: string;
};
