# Electrix-Fleet-Demo

## Run locally

Open `index.html` in a modern browser. This is a static frontend and has no build or install step. The app currently loads Lucide icons from its CDN, so icons require an internet connection.

## Frontend layout

```text
index.html                 HTML shell
src/
  main.js                   Ordered frontend bootstrap
  styles.css                Application styles
  core/                     Shared runtime, state, actions, events, lifecycle
  data/                     Demo fixtures
  features/                 Dashboard, devices, telemetry, alarms, automation,
                            firmware, and settings
  services/                 Simulated MQTT transport
```

`main.js` loads the classic scripts sequentially. Keep the order in its `scripts` list: the current implementation shares top-level declarations and relies on core utilities, demo fixtures, and feature functions being available before later scripts execute. The loader reports a failed script in the browser console and displays an on-page error.

The stylesheet and bootstrap script use a `v` query parameter as a cache-busting release version. When deploying frontend changes, bump that value on both references in `index.html`; the bootstrap propagates it to every feature script it loads.

This is a compatibility-preserving first restructuring, not a full module conversion. Keeping classic scripts means the app can still be opened directly with `file://`. Feature files still share global state, and the MQTT service is a simulator rather than a backend adapter.

## Next architecture step

As the backend is introduced, define explicit interfaces for fleet/device data and commands, then put HTTP or MQTT implementations behind those interfaces. Migrate feature scripts to ES modules with explicit imports and a deliberate app context; validate that migration through a local web server, since browsers restrict module loading from `file://`. Keep demo fixtures and service implementations replaceable so features do not need to know whether their data comes from the simulator or the backend.
