// When a 401 is allowed to end a session.
//
// A moderator saving an outing got an error screen and was signed out;
// his work was not queued and the form went away with the redirect.
// The interceptor behind it signed out on any 401 from any request, and
// navigated away from wherever the user was — including a half-filled
// outing form.
//
// A 401 is a claim that the session is dead. This guard checks the claim
// before acting on it, never acts on an inconclusive check (offline, API
// refusing the app, server error), and never pulls the user out of an
// edition form: signing out is recoverable, losing the form is not.

import { describe, expect, it, vi } from 'vitest';

import { createExpiredTokenHandler, isEditionRoute, isLoginCall, verifySession } from '@/js/session-guard';

const error401 = (url = '/outings') => ({ response: { status: 401 }, config: { url } });

function setup({ verdict = 'invalid', route = { name: 'route', fullPath: '/routes/1/fr' }, token = 'T' } = {}) {
  const state = { token };
  const deps = {
    getToken: () => state.token,
    verify: vi.fn(async () => verdict),
    signout: vi.fn(() => {
      state.token = null;
    }),
    redirectToLogin: vi.fn(),
    notifySignedOut: vi.fn(),
    getCurrentRoute: () => route,
  };
  return { state, deps, handle: createExpiredTokenHandler(deps) };
}

describe('createExpiredTokenHandler', () => {
  it('signs out and redirects when the server confirms the session is dead', async () => {
    const { deps, handle } = setup({ verdict: 'invalid' });
    expect(await handle(error401())).toBe('signed-out');
    expect(deps.verify).toHaveBeenCalledWith('T');
    expect(deps.signout).toHaveBeenCalledTimes(1);
    expect(deps.redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the check says it is still valid', async () => {
    const { deps, handle } = setup({ verdict: 'valid' });
    expect(await handle(error401())).toBe('kept');
    expect(deps.signout).not.toHaveBeenCalled();
    expect(deps.redirectToLogin).not.toHaveBeenCalled();
  });

  it('keeps the session when the check is inconclusive', async () => {
    // Offline, the API refusing this app, a 500: none of these say
    // anything about the token, and none of them may cost the user a login.
    const { deps, handle } = setup({ verdict: 'unknown' });
    expect(await handle(error401())).toBe('kept');
    expect(deps.signout).not.toHaveBeenCalled();
  });

  it('never leaves an edition form, even when the session is really dead', async () => {
    const { deps, handle } = setup({ verdict: 'invalid', route: { name: 'outing-add', fullPath: '/outings/add/fr' } });
    expect(await handle(error401())).toBe('signed-out-stayed');
    expect(deps.signout).toHaveBeenCalledTimes(1);
    // The redirect is what lost the moderator's half-filled outing.
    expect(deps.redirectToLogin).not.toHaveBeenCalled();
    expect(deps.notifySignedOut).toHaveBeenCalledTimes(1);
  });

  it('ignores everything that is not a 401', async () => {
    const { deps, handle } = setup();
    expect(await handle({ response: { status: 403 }, config: { url: '/outings' } })).toBe('ignored');
    expect(await handle({ response: { status: 500 }, config: { url: '/outings' } })).toBe('ignored');
    // A request that never got an answer is not an auth verdict either.
    expect(await handle({ message: 'Network Error', config: { url: '/outings' } })).toBe('ignored');
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it('ignores the login endpoints themselves', async () => {
    const { deps, handle } = setup();
    expect(await handle(error401('/users/login'))).toBe('ignored');
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it('does nothing for someone who was not signed in', async () => {
    const { deps, handle } = setup({ token: null });
    expect(await handle(error401())).toBe('ignored');
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it('does not sign out a user who signed in again while the check was running', async () => {
    let release;
    const { state, deps, handle } = setup();
    deps.verify.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const pending = handle(error401());
    await Promise.resolve();
    state.token = 'NEW';
    release('invalid');
    expect(await pending).toBe('kept');
    expect(deps.signout).not.toHaveBeenCalled();
  });

  it('checks once for a burst of 401s', async () => {
    const { deps, handle } = setup({ verdict: 'invalid' });
    const results = await Promise.all([handle(error401('/a')), handle(error401('/b')), handle(error401('/c'))]);
    expect(deps.verify).toHaveBeenCalledTimes(1);
    expect(deps.signout).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r === 'signed-out')).toHaveLength(1);
  });
});

describe('verifySession', () => {
  it('reads a 2xx as valid', async () => {
    const get = vi.fn(async () => ({ status: 200 }));
    expect(await verifySession('T', { apiBase: 'https://api.x', get })).toBe('valid');
    const [url, options] = get.mock.calls[0];
    expect(url).toBe('https://api.x/users/preferences');
    expect(options.headers.Authorization).toBe('JWT token="T"');
  });

  it('reads only a 401 as invalid', async () => {
    const get401 = vi.fn(async () => Promise.reject({ response: { status: 401 } }));
    expect(await verifySession('T', { apiBase: 'https://api.x', get: get401 })).toBe('invalid');
  });

  it('reads everything else as unknown', async () => {
    for (const failure of [
      { message: 'Network Error' },
      { response: { status: 403 } },
      { response: { status: 502 } },
    ]) {
      const get = vi.fn(async () => Promise.reject(failure));
      expect(await verifySession('T', { apiBase: 'https://api.x', get })).toBe('unknown');
    }
  });
});

describe('route helpers', () => {
  it('recognises edition routes', () => {
    expect(isEditionRoute({ name: 'outing-add' })).toBe(true);
    expect(isEditionRoute({ name: 'route-edit' })).toBe(true);
    expect(isEditionRoute({ name: 'outing' })).toBe(false);
    expect(isEditionRoute(null)).toBe(false);
  });

  it('recognises login calls', () => {
    expect(isLoginCall('/users/login')).toBe(true);
    expect(isLoginCall('https://api.x/users/register')).toBe(true);
    expect(isLoginCall('/users/validate_register_email/abc')).toBe(true);
    expect(isLoginCall('/outings')).toBe(false);
  });
});
