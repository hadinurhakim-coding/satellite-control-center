<script lang="ts">
  import { onMount } from 'svelte';
  import type { SettingsStatus } from '$lib/types';

  let apiKey = '';
  let model = 'gemini-2.5-flash';
  let temperature = 0.2;
  let maxOutputTokens = 512;
  let status: SettingsStatus | null = null;
  let message = '';
  let saving = false;

  onMount(loadStatus);

  async function loadStatus() {
    const response = await fetch('/api/settings/status');
    status = await response.json();
    model = status?.model ?? model;
    temperature = status?.temperature ?? temperature;
    maxOutputTokens = status?.maxOutputTokens ?? maxOutputTokens;
  }

  async function save() {
    saving = true;
    message = '';
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey, model, temperature, maxOutputTokens })
    });
    status = await response.json();
    saving = false;
    apiKey = '';
    message = response.ok ? 'Settings saved. The API key remains server-side.' : 'Could not save settings.';
  }
</script>

<svelte:head>
  <title>Settings | Satellite Control Center</title>
</svelte:head>

<main class="shell narrow">
  <header class="topbar">
    <div>
      <p class="eyebrow">Configuration</p>
      <h1>Settings</h1>
    </div>
    <nav>
      <a class="nav-link" href="/">Dashboard</a>
      <a class="nav-link active" href="/settings">Settings</a>
    </nav>
  </header>

  <section class="panel settings-panel">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Gemini API</p>
        <h2>Server-side LLM Provider</h2>
      </div>
      <span class={`badge ${status?.configured ? 'normal' : 'warning'}`}>
        {status?.configured ? 'configured' : 'missing key'}
      </span>
    </div>

    <label>
      Gemini API key
      <input
        bind:value={apiKey}
        type="password"
        autocomplete="off"
        placeholder={status?.configured ? 'Enter a new key to replace the saved key' : 'Paste Gemini API key'}
      />
    </label>

    <label>
      Model
      <input bind:value={model} placeholder="gemini-2.5-flash" />
    </label>

    <div class="form-grid">
      <label>
        Temperature
        <input bind:value={temperature} type="number" min="0" max="1" step="0.1" />
      </label>
      <label>
        Max output tokens
        <input bind:value={maxOutputTokens} type="number" min="64" max="8192" step="64" />
      </label>
    </div>

    <button class="primary" on:click={save} disabled={saving}>
      {saving ? 'Saving...' : 'Save Settings'}
    </button>

    {#if message}
      <div class="success">{message}</div>
    {/if}
  </section>
</main>
