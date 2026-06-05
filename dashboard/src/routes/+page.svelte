<script lang="ts">
  import { onMount } from 'svelte';
  import type { DiagnosisResult, SettingsStatus, SimulatorStatus, TelemetryPoint } from '$lib/types';

  let satellites: TelemetryPoint[] = [];
  let recent: TelemetryPoint[] = [];
  let settings: SettingsStatus | null = null;
  let simulator: SimulatorStatus | null = null;
  let loading = true;
  let question = '';
  let diagnosis: DiagnosisResult | null = null;
  let diagnosisError = '';
  let diagnosing = false;
  let simulatorBusy = false;
  let simulatorError = '';
  let selectedMetric: keyof Pick<
    TelemetryPoint,
    'temperature' | 'power' | 'altitude' | 'signal_strength'
  > = 'temperature';

  const metricLabels = {
    temperature: 'Temperature',
    power: 'Power',
    altitude: 'Altitude',
    signal_strength: 'Signal'
  };

  const metricUnits = {
    temperature: 'C',
    power: 'W',
    altitude: 'km',
    signal_strength: 'dBm'
  };

  onMount(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  });

  async function refresh() {
    const [telemetryResponse, settingsResponse, simulatorResponse] = await Promise.all([
      fetch('/api/telemetry/latest'),
      fetch('/api/settings/status'),
      fetch('/api/simulator/status')
    ]);
    const telemetryPayload = await telemetryResponse.json();
    satellites = telemetryPayload.satellites ?? [];
    recent = telemetryPayload.recent ?? [];
    settings = await settingsResponse.json();
    simulator = await simulatorResponse.json();
    loading = false;
  }

  async function controlSimulator(action: 'start' | 'stop') {
    simulatorBusy = true;
    simulatorError = '';

    const response = await fetch(`/api/simulator/${action}`, { method: 'POST' });
    const payload = await response.json();
    simulatorBusy = false;

    if (!response.ok) {
      simulatorError = payload.message ?? `Failed to ${action} simulator.`;
      return;
    }

    simulator = payload;
    await refresh();
  }

  async function runDiagnosis() {
    diagnosing = true;
    diagnosis = null;
    diagnosisError = '';

    const response = await fetch('/api/diagnosis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const payload = await response.json();
    diagnosing = false;

    if (!response.ok) {
      diagnosisError = payload.message ?? 'Diagnosis failed.';
      return;
    }

    diagnosis = payload;
  }

  function statusFor(point: TelemetryPoint): 'normal' | 'warning' | 'critical' {
    if (point.temperature >= 34 || point.power < 65 || point.signal_strength < -94) return 'critical';
    if (point.temperature >= 31 || point.power < 85 || point.signal_strength < -88) return 'warning';
    return 'normal';
  }

  function latestValue(metric: typeof selectedMetric) {
    if (satellites.length === 0) return 'No data';
    const values = satellites.map((point) => point[metric]);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${avg.toFixed(metric === 'signal_strength' ? 1 : 2)} ${metricUnits[metric]}`;
  }

  function chartPath(metric: typeof selectedMetric) {
    const points = recent.slice(-30);
    if (points.length < 2) return '';
    const values = points.map((point) => point[metric]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * 100;
        const y = 88 - ((point[metric] - min) / spread) * 76;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }
</script>

<svelte:head>
  <title>Satellite Control Center</title>
</svelte:head>

<main class="shell">
  <header class="topbar">
    <div>
      <p class="eyebrow">AI Satellite Operations</p>
      <h1>Satellite Control Center</h1>
    </div>
    <nav>
      <a class="nav-link active" href="/">Dashboard</a>
      <a class="nav-link" href="/settings">Settings</a>
    </nav>
  </header>

  <section class="status-grid">
    <div class="panel metric-panel">
      <span>Fleet</span>
      <strong>{satellites.length || 0} satellites</strong>
      <small>{loading ? 'Loading telemetry' : 'Live from simulator JSON'}</small>
    </div>
    <div class="panel metric-panel control-panel">
      <span>IoT Simulator</span>
      <strong>{simulator?.running ? 'Running' : 'Stopped'}</strong>
      <small>{simulator?.pid ? `PID ${simulator.pid}` : simulator?.message || 'Server-side control'}</small>
      <div class="control-row">
        <button
          class="secondary"
          on:click={() => controlSimulator('start')}
          disabled={simulatorBusy || simulator?.running}
        >
          Start
        </button>
        <button
          class="danger"
          on:click={() => controlSimulator('stop')}
          disabled={simulatorBusy || !simulator?.running}
        >
          Stop
        </button>
      </div>
      {#if simulatorError}
        <small class="inline-error">{simulatorError}</small>
      {/if}
    </div>
    <div class="panel metric-panel">
      <span>Gemini</span>
      <strong>{settings?.configured ? 'Configured' : 'Not configured'}</strong>
      <small>{settings?.model ?? 'Open Settings to add API key'}</small>
    </div>
    <div class="panel metric-panel">
      <span>{metricLabels[selectedMetric]} average</span>
      <strong>{latestValue(selectedMetric)}</strong>
      <small>Latest sample per satellite</small>
    </div>
  </section>

  <section class="workspace">
    <div class="panel chart-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Telemetry Trend</p>
          <h2>{metricLabels[selectedMetric]}</h2>
        </div>
        <select bind:value={selectedMetric} aria-label="Select metric">
          {#each Object.entries(metricLabels) as [key, label]}
            <option value={key}>{label}</option>
          {/each}
        </select>
      </div>

      {#if recent.length > 1}
        <svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
          <path d={chartPath(selectedMetric)} />
        </svg>
      {:else}
        <div class="empty-state">Start the Go simulator to generate telemetry.</div>
      {/if}
    </div>

    <div class="panel ai-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Gemini Diagnosis</p>
          <h2>AI Operations Brief</h2>
        </div>
      </div>
      <textarea
        bind:value={question}
        placeholder="Ask about overheating, weak signal, low power, or fleet health."
      ></textarea>
      <button class="primary" on:click={runDiagnosis} disabled={diagnosing}>
        {diagnosing ? 'Running diagnosis...' : 'Run Diagnosis'}
      </button>

      {#if diagnosisError}
        <div class="alert">{diagnosisError}</div>
      {/if}

      {#if diagnosis}
        <div class={`diagnosis ${diagnosis.severity}`}>
          <span>{diagnosis.severity}</span>
          <p>{diagnosis.diagnosis}</p>
          <strong>Affected</strong>
          <p>{diagnosis.affectedSatellites.join(', ') || 'None reported'}</p>
          <strong>Recommended actions</strong>
          <ul>
            {#each diagnosis.recommendedActions as action}
              <li>{action}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </section>

  <section class="panel table-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Latest Telemetry</p>
        <h2>Satellite Fleet</h2>
      </div>
      <button class="secondary" on:click={refresh}>Refresh</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Satellite</th>
            <th>Status</th>
            <th>Temperature</th>
            <th>Power</th>
            <th>Altitude</th>
            <th>Signal</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {#each satellites as point}
            <tr>
              <td>SAT{point.satellite_id}</td>
              <td><span class={`badge ${statusFor(point)}`}>{statusFor(point)}</span></td>
              <td>{point.temperature.toFixed(2)} C</td>
              <td>{point.power.toFixed(2)} W</td>
              <td>{point.altitude.toFixed(2)} km</td>
              <td>{point.signal_strength.toFixed(2)} dBm</td>
              <td>{new Date(point.timestamp).toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</main>
