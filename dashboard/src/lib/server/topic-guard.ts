const domainTerms = [
  'satellite',
  'sat',
  'telemetry',
  'temperature',
  'power',
  'altitude',
  'signal',
  'dbm',
  'battery',
  'payload',
  'orbit',
  'ground station',
  'anomaly',
  'diagnosis',
  'fleet',
  'iot',
  'sensor',
  'weak signal',
  'overheating',
  'low power',
  'health'
];

const broadOperationsTerms = ['status', 'problem', 'issue', 'failure', 'warning', 'critical', 'normal'];

export function isInSatelliteOperationsContext(question: string): boolean {
  const normalized = question.toLowerCase().trim();
  if (!normalized) return true;

  const hasDomainTerm = domainTerms.some((term) => normalized.includes(term));
  if (hasDomainTerm) return true;

  return broadOperationsTerms.some((term) => normalized.includes(term)) && normalized.length <= 80;
}
