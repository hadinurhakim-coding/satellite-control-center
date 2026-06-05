import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(here, '..', '..', '..', '..');
export const telemetryJsonPath = resolve(repoRoot, 'logs', 'telemetri.json');
export const runtimeDir = resolve(repoRoot, 'dashboard', '.runtime');
export const settingsPath = resolve(runtimeDir, 'settings.json');
