import { execFile } from 'node:child_process';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { runtimeDir, simulatorDir } from './paths';
import type { SimulatorStatus } from '$lib/types';

const execFileAsync = promisify(execFile);
const simulatorPidPath = `${runtimeDir}/simulator.json`;

type SimulatorState = {
  process: ChildProcessWithoutNullStreams | null;
  startedAt: string | null;
  lastMessage: string;
};

const globalSimulator = globalThis as typeof globalThis & {
  __satelliteSimulatorState?: SimulatorState;
};

const state: SimulatorState =
  globalSimulator.__satelliteSimulatorState ??
  (globalSimulator.__satelliteSimulatorState = {
    process: null,
    startedAt: null,
    lastMessage: 'Simulator is stopped.'
  });

export function simulatorStatus(): SimulatorStatus {
  const memoryRunning = Boolean(
    state.process && !state.process.killed && state.process.exitCode === null
  );
  if (!memoryRunning && state.process?.exitCode !== null) {
    state.process = null;
    state.startedAt = null;
  }

  return {
    running: memoryRunning,
    pid: memoryRunning ? state.process?.pid ?? null : null,
    startedAt: memoryRunning ? state.startedAt : null,
    message: memoryRunning ? 'Simulator is running.' : state.lastMessage
  };
}

export async function getSimulatorStatus(): Promise<SimulatorStatus> {
  const current = simulatorStatus();
  if (current.running) return current;

  const saved = await readPidFile();
  if (saved && (await processExists(saved.pid))) {
    return {
      running: true,
      pid: saved.pid,
      startedAt: saved.startedAt,
      message: 'Simulator is running.'
    };
  }

  const orphanPid = await findSimulatorExecutablePid();
  if (orphanPid) {
    return {
      running: true,
      pid: orphanPid,
      startedAt: null,
      message: 'Simulator is running.'
    };
  }

  await clearPidFile();
  return current;
}

export async function startSimulator(): Promise<SimulatorStatus> {
  const current = await getSimulatorStatus();
  if (current.running) return current;

  const child = spawn('go', ['run', '.'], {
    cwd: simulatorDir,
    windowsHide: true,
    stdio: 'pipe'
  });

  state.process = child;
  state.startedAt = new Date().toISOString();
  state.lastMessage = 'Simulator is running.';
  if (child.pid) {
    await writePidFile({ pid: child.pid, startedAt: state.startedAt });
  }

  child.stdout.on('data', (chunk) => {
    state.lastMessage = chunk.toString().trim() || state.lastMessage;
  });

  child.stderr.on('data', (chunk) => {
    state.lastMessage = chunk.toString().trim() || state.lastMessage;
  });

  child.on('exit', (code) => {
    state.lastMessage =
      code === 0 ? 'Simulator stopped.' : `Simulator stopped with exit code ${code ?? 'unknown'}.`;
    state.process = null;
    state.startedAt = null;
    void clearPidFile();
  });

  return simulatorStatus();
}

export async function stopSimulator(): Promise<SimulatorStatus> {
  const current = await getSimulatorStatus();
  const pid = current.pid;
  if (!current.running || !pid) return current;

  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']);
      await killWindowsSimulatorExecutables();
    } else {
      state.process?.kill('SIGTERM');
    }
    state.lastMessage = 'Simulator stopped.';
  } catch (error) {
    state.lastMessage = error instanceof Error ? error.message : 'Failed to stop simulator.';
  } finally {
    state.process = null;
    state.startedAt = null;
    await clearPidFile();
  }

  return getSimulatorStatus();
}

async function readPidFile(): Promise<{ pid: number; startedAt: string } | null> {
  try {
    const parsed = JSON.parse(await readFile(simulatorPidPath, 'utf-8')) as {
      pid?: unknown;
      startedAt?: unknown;
    };
    if (typeof parsed.pid !== 'number' || typeof parsed.startedAt !== 'string') return null;
    return { pid: parsed.pid, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

async function writePidFile(value: { pid: number; startedAt: string }): Promise<void> {
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(simulatorPidPath, JSON.stringify(value, null, 2), 'utf-8');
}

async function clearPidFile(): Promise<void> {
  await rm(simulatorPidPath, { force: true });
}

async function processExists(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`]);
      return stdout.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findSimulatorExecutablePid(): Promise<number | null> {
  if (process.platform !== 'win32') return null;

  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI',
      'IMAGENAME eq iot-simulator.exe',
      '/FO',
      'CSV',
      '/NH'
    ]);
    const line = stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith('"iot-simulator.exe"'));
    if (!line) return null;

    const [, pid] = line.split(',').map((item) => item.replace(/^"|"$/g, ''));
    const parsed = Number(pid);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function killWindowsSimulatorExecutables(): Promise<void> {
  if (process.platform !== 'win32') return;

  try {
    await execFileAsync('taskkill', ['/IM', 'iot-simulator.exe', '/F']);
  } catch {
    // It is fine if no orphaned simulator executable exists.
  }
}
