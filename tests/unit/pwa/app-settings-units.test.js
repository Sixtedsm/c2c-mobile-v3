// The wiring between the unit preference and the displays that read it.
//
// Worth its own test because it is exactly what broke while writing this:
// the settings view reads `$appSettings.state.units`, while every display
// reads `$appSettings.units`. Without the shortcut the second is
// undefined, every conversion silently falls back to metric, and the
// setting appears to do nothing at all — a failure with no error message.
//
// The plugin keeps its state in a module-level singleton, so a test that
// wants a fresh one has to reset the module registry. Re-installing on a
// new Vue is not enough, and a test that forgets this passes for the
// wrong reason.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function freshSettings() {
  vi.resetModules();
  const { default: install } = await import('@/js/vue-plugins/app-settings');
  const LocalVue = Vue.extend();
  install(LocalVue);
  return LocalVue.prototype.$appSettings;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('the unit preference', () => {
  it('is metric until someone changes it', async () => {
    expect((await freshSettings()).units).toBe('metric');
  });

  it('is readable through the shortcut the displays use', async () => {
    const settings = await freshSettings();
    settings.setUnits('imperial');
    // Both spellings must agree — the settings view writes through one and
    // the document renderers read through the other.
    expect(settings.units).toBe('imperial');
    expect(settings.state.units).toBe('imperial');
  });

  it('refuses a value that is not a known system', async () => {
    const settings = await freshSettings();
    settings.setUnits('imperial');
    settings.setUnits('furlongs');
    expect(settings.units).toBe('imperial');
  });

  it('survives a reload', async () => {
    (await freshSettings()).setUnits('imperial');
    // A genuinely new module instance, reading localStorage from scratch.
    expect((await freshSettings()).units).toBe('imperial');
  });

  it('ignores a corrupted stored value rather than starting broken', async () => {
    window.localStorage.setItem('v3.appSettings', JSON.stringify({ units: 'furlongs' }));
    expect((await freshSettings()).units).toBe('metric');
  });
});
