// Filling the %{placeholders} of a translated string.
//
// Four call sites in the forum used $gettextInterpolate — the standard
// vue-gettext companion to $gettext — and it had never been defined on
// the Vue prototype. Each one threw during render, and a render that
// throws leaves the previous DOM untouched: the component's state was
// right, the screen kept showing what was there before. On a discussion
// that meant the loading spinner, forever.
//
// The reason it looked like a network problem is worth keeping: the call
// sits inside "Charger les %{n} messages suivants", which only renders
// when a topic has more posts than the twenty Discourse hydrates. Short
// discussions opened instantly, long ones never opened at all.

import Vue from 'vue';
import { beforeAll, describe, expect, it } from 'vitest';

import install from '@/js/vue-plugins/gettext-plugin';

let interpolate;

beforeAll(() => {
  const LocalVue = Vue.extend();
  install(LocalVue);
  interpolate = LocalVue.prototype.$gettextInterpolate.bind(LocalVue.prototype);
});

describe('$gettextInterpolate', () => {
  it('exists at all', () => {
    // The whole bug in one assertion.
    expect(typeof interpolate).toBe('function');
  });

  it('fills a single placeholder', () => {
    expect(interpolate('Charger les %{n} messages suivants', { n: 3382 })).toBe('Charger les 3382 messages suivants');
  });

  it('fills several, including repeats', () => {
    expect(interpolate('Réponse à @%{u} · message #%{n}', { u: 'gilles74', n: 12 })).toBe(
      'Réponse à @gilles74 · message #12'
    );
    expect(interpolate('%{a} et %{a}', { a: 'x' })).toBe('x et x');
  });

  it('coerces whatever it is handed', () => {
    expect(interpolate('%{n}', { n: 0 })).toBe('0');
    expect(interpolate('%{d}', { d: new Date(0).getFullYear() })).toBe('1970');
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    // A visible %{msg} says something is wrong; an empty space hides it.
    expect(interpolate('Publication impossible : %{msg}', {})).toBe('Publication impossible : %{msg}');
  });

  it('is harmless without a context', () => {
    expect(interpolate('rien à remplacer')).toBe('rien à remplacer');
    expect(interpolate('%{n} messages')).toBe('%{n} messages');
  });

  it('never throws on junk, because throwing is what froze the screen', () => {
    expect(interpolate(null, { n: 1 })).toBe('');
    expect(interpolate(undefined)).toBe('');
    expect(interpolate(42)).toBe('');
  });
});
