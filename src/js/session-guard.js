// When a 401 is allowed to end a session.
//
// The interceptor this replaces signed the user out on any 401 from any
// API call, and pushed them to the login page from wherever they were. A
// moderator saving an outing hit it: error screen, signed out, and the
// outing was neither published nor kept — the redirect took the form
// with it.
//
// A 401 is a claim that the session is dead, and claims get checked:
//
//   - the token is verified against an endpoint that answers 401 only for
//     a bad token (GET /users/preferences);
//   - only a confirmed 401 signs out. Offline, the API refusing this app,
//     a server error — none of these say anything about the token, and
//     none of them may cost the user their login;
//   - an edition form is never left on the user's behalf. Being signed
//     out can be undone in ten seconds; a lost half-written trip report
//     cannot.
//
// Kept free of Vue and router imports so the decision can be tested on
// its own; user.js wires the real collaborators in.

const LOGIN_CALL = /\/users\/(login|register|validate_)/;

export function isLoginCall(url) {
  return LOGIN_CALL.test(String(url || ''));
}

// Route names are `<type>-add` / `<type>-edit` for every wiki form.
export function isEditionRoute(route) {
  return /-(add|edit)$/.test(String(route?.name || ''));
}

// 'valid' | 'invalid' | 'unknown'. Only a 401 is a verdict on the token.
// `get` must NOT go through the intercepted axios instance, or a dead
// token would re-enter the handler it is being checked for.
export async function verifySession(token, { apiBase, get, timeout = 10000 }) {
  try {
    await get(`${String(apiBase).replace(/\/+$/, '')}/users/preferences`, {
      headers: { Authorization: `JWT token="${token}"` },
      timeout,
    });
    return 'valid';
  } catch (error) {
    return error?.response?.status === 401 ? 'invalid' : 'unknown';
  }
}

// Returns an async function taking an axios error and resolving to what
// it did: 'ignored' | 'kept' | 'signed-out' | 'signed-out-stayed'. It never
// rethrows; the interceptor still rejects the original error so callers
// see the failure they would have seen anyway.
export function createExpiredTokenHandler({
  getToken,
  verify,
  signout,
  redirectToLogin,
  notifySignedOut,
  getCurrentRoute,
}) {
  // One check for a burst of 401s: a page firing five requests with a dead
  // token must not sign out five times or verify five times.
  let pending = null;
  let pendingToken = null;
  let decided = null;

  return async function handle(error) {
    const status = error?.response?.status;
    if (status !== 401 || isLoginCall(error?.config?.url)) return 'ignored';

    const token = getToken();
    if (!token) return 'ignored';

    if (!pending || pendingToken !== token) {
      pendingToken = token;
      decided = null;
      pending = Promise.resolve()
        .then(() => verify(token))
        .catch(() => 'unknown')
        .then(async (verdict) => {
          // The user may have signed in again while the check was running;
          // the verdict is about the old token, not the current session.
          if (verdict !== 'invalid' || getToken() !== token) return 'kept';
          signout();
          const route = getCurrentRoute();
          if (isEditionRoute(route)) {
            notifySignedOut(route);
            return 'signed-out-stayed';
          }
          if (route?.name !== 'auth') redirectToLogin(route);
          return 'signed-out';
        })
        .finally(() => {
          pending = null;
        });
      decided = pending;
      return pending;
    }

    // Joined an in-flight check: report the outcome without acting twice.
    const outcome = await decided;
    return outcome === 'kept' ? 'kept' : 'joined';
  };
}
