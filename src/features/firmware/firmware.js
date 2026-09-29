'use strict';

const OTA_NOT_LIVE_BANNER = `
  <div class="not-live">
    <div class="nl-icon">${icon('alert-triangle')}</div>
    <div class="nl-body">
      <b>Not available yet</b>
      The firmware does not publish <span class="mono">ota/available</span> or
      <span class="mono">ota/status</span>. Nothing on this screen is a real
      update pipeline. When OTA lands on-device, this banner disappears.
    </div>
  </div>`;
function renderOTA(main) {
  main.innerHTML = `
    <div class="main-head">
      <h1>Firmware / OTA</h1>
      <div class="main-head-actions"><span class="count">not live</span></div>
    </div>
    ${OTA_NOT_LIVE_BANNER}
    <div class="panel" style="padding:0;overflow:hidden;">
      <div style="padding:48px 24px;text-align:center;color:var(--content-faint);">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:var(--surface-2);color:var(--content-dim);margin-bottom:16px;">
          ${icon('upload-cloud')}
        </div>
        <div style="font-size:14px;font-weight:600;color:var(--content);margin-bottom:6px;">Nothing to show yet</div>
        <div style="font-size:12.5px;max-width:440px;margin:0 auto;line-height:1.55;">
          Once <span class="mono">electrix/{device_id}/ota/available</span> and
          <span class="mono">.../ota/status</span> exist on the firmware side,
          this screen lists per-device current/target version, rollout progress,
          and lets an admin trigger a staged rollout.
        </div>
      </div>
    </div>`;
    refreshIcons(main);
}
