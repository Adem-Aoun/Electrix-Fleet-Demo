'use strict';

(async function bootstrap() {
  const entrypointUrl = document.currentScript.src;
  const scripts = [
    'core/runtime.js',
    'services/mqtt-simulator.js',
    'data/demo-data.js',
    'core/app-state.js',
    'features/dashboard/dashboard.js',
    'features/devices/device-list.js',
    'features/telemetry/telemetry-core.js',
    'features/devices/device-detail.js',
    'features/telemetry/telemetry-page.js',
    'features/alarms/alarms.js',
    'features/automation/automation.js',
    'features/firmware/firmware.js',
    'features/interlocks/interlocks.js',
    'features/settings/settings.js',
    'core/actions.js',
    'core/events.js',
    'core/lifecycle.js',
  ];

  try {
    for (const source of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(source, entrypointUrl).href;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Unable to load frontend script: ${source}`));
        document.body.appendChild(script);
      });
    }
  } catch (error) {
    console.error(error);
    const message = document.createElement('div');
    message.className = 'app-load-error';
    message.setAttribute('role', 'alert');
    message.textContent = 'The application could not load. Check the browser console and reload the page.';
    document.body.appendChild(message);
  }
})();
