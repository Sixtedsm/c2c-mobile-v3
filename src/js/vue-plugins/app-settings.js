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
};

const allowed = {
  theme: ['auto', 'light', 'dark'],
  textSize: ['small', 'normal', 'large'],
  gpsIntervalS: ['5', '15', '30'],
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

function apply(state) {
  const root = document.documentElement;
  const theme = effectiveTheme(state.theme);
  root.setAttribute('data-theme', theme);
  // Drop the blanket "light only" so OS controls (scrollbar, native pickers)
  // can paint dark when the user opts into dark mode.
  root.style.colorScheme = theme;
  root.setAttribute('data-text-size', state.textSize);
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
  get effectiveTheme() {
    return effectiveTheme(state.theme);
  },
  get gpsIntervalMs() {
    return (Number(state.gpsIntervalS) || 5) * 1000;
  },
};

export default function install(Vue) {
  Vue.prototype.$appSettings = api;
}
