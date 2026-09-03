// V3-local user preferences stored in localStorage under v3.appSettings.
// Exposed as vm.$appSettings.{theme,textSize} and toggled via
// setTheme()/setTextSize(). Applies as data-theme + data-text-size on
// <html>; the global SCSS in App.vue reacts to those attributes,
// repainting both the V3 shell and the V1 content surfaces (cards,
// boxes, forms, tables, dropdowns, ag-grid). Spot overrides for
// components that bake their own colors live next to those components.

import Vue from 'vue';

const STORAGE_KEY = 'v3.appSettings';

const defaults = {
  theme: 'auto',
  textSize: 'normal',
  // GPS sample interval (CDC §2.9). '5' = one fix every 5 s (default,
  // trades battery for a precise trace); '15' balanced; '30' battery-
  // saver for long days where a coarser trace is fine.
  gpsIntervalS: '5',
  // Shell mode — picks between the V3 mobile shell (BottomNav, top
  // bar, no side menu) and the V1 desktop shell (SideMenu +
  // Navigation, no bottom nav). 'auto' defers to the viewport (mobile
  // shell on <= tablet, desktop shell on >= desktop). Explicit values
  // let a user override the auto-detection — the "Version ordinateur"
  // / "Version mobile" toggle in MoreView / SideMenu writes here.
  shellMode: 'auto',
  // Display units (CDC §2.9). Storage and the API stay metric always;
  // this only changes what is printed.
  units: 'metric',
};

const allowed = {
  theme: ['auto', 'light', 'dark'],
  textSize: ['small', 'normal', 'large'],
  gpsIntervalS: ['5', '15', '30'],
  shellMode: ['auto', 'mobile', 'desktop'],
  units: ['metric', 'imperial'],
};

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    const result = { ...defaults };
    for (const k of Object.keys(defaults)) {
      if (parsed[k] && allowed[k].includes(parsed[k])) {
        result[k] = parsed[k];
      }
    }
    return result;
  } catch {
    return { ...defaults };
  }
}

function persist(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or disabled — settings will not persist this session
  }
}

function prefersDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function effectiveTheme(theme) {
  return theme === 'auto' ? (prefersDark() ? 'dark' : 'light') : theme;
}

function prefersDesktopViewport() {
  return !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
}

function effectiveShellMode(mode) {
  if (mode === 'mobile' || mode === 'desktop') return mode;
  // auto — Bulma's desktop breakpoint is 1024 px (App.vue uses it too
  // for the layout switch).
  return prefersDesktopViewport() ? 'desktop' : 'mobile';
}

function apply(state) {
  const root = document.documentElement;
  const theme = effectiveTheme(state.theme);
  root.setAttribute('data-theme', theme);
  // Drop the blanket "light only" so OS controls (scrollbar, native pickers)
  // can paint dark when the user opts into dark mode.
  root.style.colorScheme = theme;
  root.setAttribute('data-text-size', state.textSize);
  root.setAttribute('data-shell', effectiveShellMode(state.shellMode));
}

const state = Vue.observable(load());
apply(state);

if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (state.theme === 'auto') apply(state);
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);

  // Re-apply the shell mode when the viewport crosses the desktop
  // breakpoint — only in 'auto' mode; explicit choices stick.
  const shellMq = window.matchMedia('(min-width: 1024px)');
  const onShellChange = () => {
    if (state.shellMode === 'auto') apply(state);
  };
  if (shellMq.addEventListener) shellMq.addEventListener('change', onShellChange);
  else if (shellMq.addListener) shellMq.addListener(onShellChange);
}

const api = {
  state,
  options: allowed,
  setTheme(value) {
    if (!allowed.theme.includes(value)) return;
    state.theme = value;
    persist(state);
    apply(state);
  },
  setTextSize(value) {
    if (!allowed.textSize.includes(value)) return;
    state.textSize = value;
    persist(state);
    apply(state);
  },
  setGpsIntervalS(value) {
    const str = String(value);
    if (!allowed.gpsIntervalS.includes(str)) return;
    state.gpsIntervalS = str;
    persist(state);
    // No visual side-effect: $outingSession reads the value on next
    // startGpsWatch() call, so no apply() step needed here.
  },
  setUnits(value) {
    if (!allowed.units.includes(value)) return;
    state.units = value;
    persist(state);
    // Nothing to apply to the DOM: every display reads $appSettings.units
    // through a computed, so the change repaints on its own.
  },
  setShellMode(value) {
    if (!allowed.shellMode.includes(value)) return;
    state.shellMode = value;
    persist(state);
    apply(state);
  },
  get effectiveTheme() {
    return effectiveTheme(state.theme);
  },
  get effectiveShellMode() {
    return effectiveShellMode(state.shellMode);
  },
  // Read by every display that shows a distance or an elevation. A
  // shortcut over state.units so call sites do not each reach through
  // `state` — and reactive, since `state` is a Vue observable.
  get units() {
    return state.units;
  },
  get gpsIntervalMs() {
    return (Number(state.gpsIntervalS) || 5) * 1000;
  },
};

export default function install(Vue) {
  Vue.prototype.$appSettings = api;
}
