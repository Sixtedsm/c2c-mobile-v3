// <map-view> is no longer a global component: registered globally, it pulled
// OpenLayers into the startup bundle of every page. Each file that draws a
// map imports it. A file that forgets renders an unknown tag — which Vue
// shows as nothing, with no error, and which lint, build and the rest of
// this suite cannot see. This test can.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../src');

function vueFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return vueFiles(p);
    return e.name.endsWith('.vue') ? [p] : [];
  });
}

const users = vueFiles(SRC).filter((f) => /<map-view\b/.test(fs.readFileSync(f, 'utf8')));

describe('<map-view> registration', () => {
  it('is used somewhere (otherwise this test checks nothing)', () => {
    expect(users.length).toBeGreaterThan(0);
  });

  it.each(users.map((f) => [path.relative(SRC, f).split(path.sep).join('/'), f]))('%s registers MapView', (_, f) => {
    const s = fs.readFileSync(f, 'utf8');
    expect(s).toMatch(/import MapView from '@\/components\/map\/OlMap'/);
    expect(s).toMatch(/components:\s*\{[^}]*\bMapView\b/);
  });
});
