// The end of a sync pass, and the retry cycle around it.
//
// Every pass used to end on `remaining.length` — a variable that stopped
// existing when decisions moved to per-item commits. The ReferenceError
// was swallowed by runGuardedSync and shown as "Synchronisation
// interrompue", on failures and on successful publishes alike, and the
// real per-item error never reached the user. The existing suite did not
// see it: it asserts on the queue and on the API calls, and the toast was
// only a mock nobody read.
//
// These tests read the toasts, and run the cycle a real device goes
// through: failure → wait → retry → success.

import Vue from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/js/apis/c2c', () => ({
  default: {
    outing: { create: vi.fn() },
    createImages: vi.fn(async () => ({ data: { images: [] } })),
  },
}));

vi.mock('@/js/config', () => ({
  default: { urls: { api: 'https://api.example.test', forum: 'https://forum.example.test' } },
}));

vi.mock('bulma-toast', () => ({ toast: vi.fn() }));

// The sync pass asks whether the API will accept this app before spending
// an attempt (src/pwa/api-access.js). These tests are about what happens
// once it does, so the probe answers 'ok' unless a test says otherwise.
vi.mock('@/pwa/api-access', () => ({ probeApiAccess: vi.fn(async () => 'ok') }));

// An in-memory queue, so decisions committed mid-pass are really read back.
let disk = [];
vi.mock('@/pwa/offline-store', () => ({
  listDocuments: vi.fn(async () => []),
  listFolders: vi.fn(async () => []),
  listPendingOutings: vi.fn(async () => disk.map((item) => ({ ...item }))),
  replacePendingOutings: vi.fn(async (queue) => {
    disk = queue.map((item) => ({ ...item }));
  }),
  enqueuePendingOuting: vi.fn(async (entry) => {
    const item = { id: 'p' + (disk.length + 1), attempts: 0, ...entry };
    disk.push(item);
    return item;
  }),
  removePendingOuting: vi.fn(async (id) => {
    disk = disk.filter((item) => item.id !== id);
  }),
  saveDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  saveFolder: vi.fn(async () => {}),
  deleteFolder: vi.fn(async () => {}),
  setDocumentFolder: vi.fn(async () => {}),
  getDocument: vi.fn(async () => null),
  estimateUsage: vi.fn(async () => ({})),
}));

import { toast } from 'bulma-toast';

import c2c from '@/js/apis/c2c';
import install from '@/js/vue-plugins/offline';
import { probeApiAccess } from '@/pwa/api-access';

const item = (id = 'p1', extra = {}) => ({
  id,
  payload: { locales: [{ title: 'Course test' }], associations: { users: [{ document_id: 7 }] } },
  photos: [],
  attempts: 0,
  conflict: false,
  needsRouteAssoc: false,
  ...extra,
});

// What axios hands back when no response ever arrived.
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

function mountPlugin() {
  const LocalVue = Vue.extend();
  LocalVue.prototype.$user = { id: 7 };
  install(LocalVue);
  const vm = LocalVue.prototype.$offline;
  vm.online = true;
  return vm;
}

const toastMessages = () => toast.mock.calls.map(([options]) => String(options?.message || ''));

beforeEach(() => {
  vi.clearAllMocks();
  disk = [];
});

describe('the end of a sync pass', () => {
  it('reports a successful publish, and nothing else', async () => {
    disk = [item()];
    c2c.outing.create.mockResolvedValue({ data: { document_id: 42 } });
    const vm = mountPlugin();

    await vm.syncPendingOutings();

    expect(c2c.outing.create).toHaveBeenCalledTimes(1);
    expect(disk).toHaveLength(0);
    expect(toastMessages().some((m) => /publiée/.test(m))).toBe(true);
    // The whole bug in one line: a publish that worked used to be
    // followed by "Synchronisation interrompue".
    expect(toastMessages().some((m) => /interrompue/.test(m))).toBe(false);
    expect(vm.syncing).toBe(false);
  });

  it('reports a failed attempt as a failure, keeping the real error on the item', async () => {
    disk = [item()];
    c2c.outing.create.mockRejectedValue(networkError());
    const vm = mountPlugin();

    await vm.syncPendingOutings();

    expect(toastMessages().some((m) => /interrompue/.test(m))).toBe(false);
    expect(toastMessages().some((m) => /Échec de la synchronisation/.test(m))).toBe(true);
    expect(disk).toHaveLength(1);
    expect(disk[0].attempts).toBe(1);
    // What the user needs to see in "Mes topos", instead of a generic toast.
    expect(disk[0].lastError).toMatch(/Network Error/);
  });

  it('stays quiet when there was nothing it could attempt', async () => {
    disk = [item('p1', { conflict: true }), item('p2', { needsRouteAssoc: true })];
    const vm = mountPlugin();

    await vm.syncPendingOutings();

    expect(c2c.outing.create).not.toHaveBeenCalled();
    expect(toastMessages().some((m) => /interrompue|Échec/.test(m))).toBe(false);
    expect(disk).toHaveLength(2);
  });
});

describe('failure → wait → retry → success', () => {
  it('publishes exactly once and leaves a clean queue', async () => {
    disk = [item()];
    const vm = mountPlugin();

    // Monday evening: the request fails.
    c2c.outing.create.mockRejectedValueOnce(networkError());
    await vm.syncPendingOutings();
    expect(disk).toHaveLength(1);
    expect(disk[0].attempts).toBe(1);
    expect(disk[0].conflict).toBe(false);

    // Later, the user taps "Publier maintenant" again and it goes through.
    c2c.outing.create.mockResolvedValueOnce({ data: { document_id: 99 } });
    await vm.syncPendingOutings();

    expect(c2c.outing.create).toHaveBeenCalledTimes(2);
    expect(disk).toHaveLength(0);
    expect(vm.pendingOutings).toHaveLength(0);
    expect(toastMessages().some((m) => /interrompue/.test(m))).toBe(false);

    // A third pass must not publish anything again.
    await vm.syncPendingOutings();
    expect(c2c.outing.create).toHaveBeenCalledTimes(2);
  });

  it('keeps the other items untouched while one of them fails', async () => {
    disk = [item('ok'), item('ko')];
    c2c.outing.create.mockImplementation(async (payload) => {
      if (payload === undefined) throw new Error('unexpected');
      return c2c.outing.create.mock.calls.length === 1 ? { data: { document_id: 1 } } : Promise.reject(networkError());
    });
    const vm = mountPlugin();

    await vm.syncPendingOutings();

    expect(disk.map((i) => i.id)).toEqual(['ko']);
    expect(disk[0].attempts).toBe(1);
    expect(toastMessages().some((m) => /interrompue/.test(m))).toBe(false);
  });
});

// Since the API release of 2026-09-13, the Camptocamp API answers requests
// from origins outside its allowlist with a 400 the browser cannot read.
// Every publish then fails as "Network Error", and each attempt used to
// count towards the freeze — ending with an outing marked "impossible de
// savoir si elle a été publiée" when nothing had ever left the phone.
describe('an API that refuses this app', () => {
  it('spends no attempt and says why, instead of pretending the network is down', async () => {
    disk = [item()];
    probeApiAccess.mockResolvedValueOnce('refused');
    const vm = mountPlugin();

    await vm.syncPendingOutings();

    expect(c2c.outing.create).not.toHaveBeenCalled();
    expect(disk[0].attempts).toBe(0);
    expect(disk[0].conflict).toBe(false);
    expect(vm.apiAccess).toBe('refused');
    expect(toastMessages().some((m) => /refuse/.test(m))).toBe(true);
    expect(toastMessages().some((m) => /interrompue|Échec/.test(m))).toBe(false);
  });

  it('spends no attempt while offline either', async () => {
    disk = [item()];
    probeApiAccess.mockResolvedValueOnce('offline');
    const vm = mountPlugin();

    await vm.syncPendingOutings();

    expect(c2c.outing.create).not.toHaveBeenCalled();
    expect(disk[0].attempts).toBe(0);
  });

  it('publishes normally once access comes back', async () => {
    disk = [item()];
    c2c.outing.create.mockResolvedValue({ data: { document_id: 7 } });
    const vm = mountPlugin();

    probeApiAccess.mockResolvedValueOnce('refused');
    await vm.syncPendingOutings();
    expect(disk).toHaveLength(1);

    probeApiAccess.mockResolvedValueOnce('ok');
    await vm.syncPendingOutings();
    expect(disk).toHaveLength(0);
    expect(c2c.outing.create).toHaveBeenCalledTimes(1);
  });

  it('does not probe at all when nothing is attemptable', async () => {
    disk = [item('p1', { conflict: true })];
    const vm = mountPlugin();
    probeApiAccess.mockClear();

    await vm.syncPendingOutings();

    expect(probeApiAccess).not.toHaveBeenCalled();
  });
});
