import c2c from '@/js/apis/c2c';
import trackingService from '@/js/apis/tracking-service';
import config from '@/js/config';
import router from '@/js/vue-plugins/router';

export default function install(Vue) {
  Vue.prototype.$user = new Vue({
    name: 'User',

    data() {
      const data = this.$localStorage.get(config.urls.api, {});

      // token expiration date
      const expire = data['expire'] ?? null;
      // The unique name, used to login
      const userName = data['userName'] ?? null;
      // unique numerical ID
      const id = data['id'] ?? null;
      // user lang, read write property everywhere : this.$user.lang
      const lang = data['lang'] ?? this.$language.current;
      // list of roles
      const roles = data['roles'] ?? [];
      // public name, a simple label
      const name = data['name'] ?? null;
      // forum name
      const forumUsername = data['forumUsername'] ?? null;
      // Discourse `avatar_template` (path with a {size} placeholder).
      // Cached in localStorage so the profile picture shows up
      // immediately on cold boot without waiting for the Discourse
      // round-trip.
      const avatarTemplate = data['avatarTemplate'] ?? null;
      // private token used for API auth
      const token = data['token'] ?? null;

      const expired = this.checkExpiration(expire, token);

      return expired
        ? {
            userName: null,
            id: null,
            lang,
            roles: [],
            name: null,
            forumUsername: null,
            avatarTemplate: null,
            token: null,
            expire: null,
          }
        : {
            userName,
            id,
            lang,
            roles,
            name,
            forumUsername,
            avatarTemplate,
            token,
            expire,
          };
    },

    computed: {
      isModerator() {
        return this.roles.includes('moderator');
      },
      isLogged() {
        return Boolean(this.token);
      },
    },

    watch: {
      token: {
        handler: 'updateToken',
        immediate: true,
      },
      // Refresh the Discourse avatar whenever the forumUsername
      // changes — covers first sign-in AND account-page edits. Kept
      // silent on failure: the initials fallback keeps the UI
      // usable without a photo.
      forumUsername: {
        handler(value) {
          if (value) this.refreshDiscourseAvatar(value);
        },
        immediate: false,
      },
    },

    created() {
      this.commitToLocaleStorage_();
      this.installExpiredTokenInterceptor();
      // Warm the avatar on cold boot when the user is already logged
      // in (came back to the app after quitting). The cached
      // avatarTemplate paints instantly; the refresh below ensures a
      // profile picture change made on the forum eventually reaches
      // the app.
      if (this.isLogged && this.forumUsername) {
        this.refreshDiscourseAvatar(this.forumUsername);
      }
    },

    methods: {
      signIn(username, password, acceptTos) {
        return c2c.userProfile.login(username, password, acceptTos).then((response) => {
          this.lang = response.data.lang;
          this.token = response.data.token;
          this.roles = response.data.roles;
          this.id = response.data.id;
          this.userName = response.data.username;
          this.name = response.data.name;
          this.forumUsername = response.data.forum_username;
          this.expire = response.data.expire;

          this.$language.setCurrent(this.lang);
          this.commitToLocaleStorage_();
        });
      },

      expiredTokenLogout(token) {
        c2c.userProfile.expiredTokenLogout(token);
      },

      signout() {
        c2c.userProfile.logout();

        this.token = null;
        this.roles = [];
        this.id = null;
        this.userName = null;
        this.name = null;
        this.forumUsername = null;
        this.avatarTemplate = null;
        this.expire = null;

        this.commitToLocaleStorage_();
      },

      // Look up the current user's Discourse profile to grab their
      // `avatar_template` — Discourse serves the same avatar to
      // camptocamp.org (via SSO) so this is the profile picture the
      // user set on the C2C site.
      //
      // Written against the browser `fetch` API on purpose: BaseApi's
      // Promise wrapper (ApiData) has broken chaining under some
      // conditions (a rejection on the outer promise_ can slip past
      // the .then, and the .catch is attached to a sibling chain),
      // which made this fetch look "silent" in practice. Straight
      // fetch is a handful of lines and lets us surface every failure
      // mode clearly in the console — the caller (MobileTopBar,
      // MeView, ForumBottomNav) can decide when to re-trigger.
      //
      // Concurrent-call guard: multiple views mount at the same time
      // and each calls refreshDiscourseAvatar. Cache the in-flight
      // promise so a burst of calls results in one network request.
      async refreshDiscourseAvatar(usernameArg) {
        const username = usernameArg || this.forumUsername;
        if (!username) return null;
        if (this._avatarFetch) return this._avatarFetch;
        const url = `${config.urls.forum}/u/${encodeURIComponent(username)}.json`;
        this._avatarFetch = (async () => {
          try {
            const resp = await fetch(url, {
              method: 'GET',
              // Discourse's /u/:username.json is public, no cookies
              // needed. omit avoids preflight and the CORS-with-
              // credentials trap when the SSO domain differs.
              credentials: 'omit',
              headers: { Accept: 'application/json' },
            });
            if (!resp.ok) {
              // eslint-disable-next-line no-console
              console.warn(`[$user] Discourse avatar fetch: HTTP ${resp.status} on ${url}`);
              return null;
            }
            const payload = await resp.json();
            const template = payload?.user?.avatar_template;
            if (!template) {
              // eslint-disable-next-line no-console
              console.warn('[$user] Discourse response missing avatar_template', payload?.user);
              return null;
            }
            if (template !== this.avatarTemplate) {
              this.avatarTemplate = template;
              this.commitToLocaleStorage_();
            }
            return template;
          } catch (err) {
            // Network error, DNS, CORS. Kept warn-level so it shows
            // up in devtools without blowing up the app.
            // eslint-disable-next-line no-console
            console.warn('[$user] Discourse avatar fetch failed', err?.message || err);
            return null;
          } finally {
            this._avatarFetch = null;
          }
        })();
        return this._avatarFetch;
      },

      // Build a fully-qualified avatar URL for a given pixel size.
      // Returns null when no template has been fetched yet, so the
      // caller can render the initials placeholder in the meantime.
      // Also a no-op guard against non-string templates (defensive
      // — a corrupted localStorage entry would otherwise 500 the
      // template string manipulation below).
      avatarUrl(size = 96) {
        const template = this.avatarTemplate;
        if (!template || typeof template !== 'string') return null;
        const path = template.replace('{size}', String(size));
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        return config.urls.forum + (path.startsWith('/') ? path : '/' + path);
      },

      updateAccount(currentpassword, name, forum_username, email, is_profile_public, newpassword) {
        return c2c.userProfile.account
          .post(currentpassword, name, forum_username, email, is_profile_public, newpassword)
          .then(() => {
            this.forumUsername = forum_username === null ? this.forumUsername : forum_username;
            this.name = name === null ? this.name : name;
            this.commitToLocaleStorage_();
          });
      },

      updateToken() {
        c2c.setAuthorizationToken(this.token);
        trackingService.setAuthorizationToken(this.token);
      },

      installExpiredTokenInterceptor() {
        // Task 13: when the server rejects an authenticated request with
        // 401, the local token is no longer valid — invalidated by a
        // password change, role revoked, account banned, or simply the
        // server-side session expired earlier than our `expire` timestamp.
        // Sign the user out locally and bounce them to the login page so
        // they can re-auth, with the current path stored for redirect.
        c2c.axios.interceptors.response.use(
          (response) => response,
          (error) => {
            const status = error?.response?.status;
            const requestUrl = error?.config?.url || '';
            // Only react when we actually thought we were logged in. Don't
            // react on the login endpoint itself (bad credentials would
            // otherwise auto-redirect to /auth in a loop).
            const looksLikeLoginCall = /\/users\/(login|register|validate_)/.test(requestUrl);
            if (status === 401 && this.isLogged && !looksLikeLoginCall) {
              this.signout();
              const current = router.currentRoute?.fullPath;
              const isOnAuth = router.currentRoute?.name === 'auth';
              if (!isOnAuth) {
                router.push({
                  name: 'auth',
                  query: current && current !== '/' ? { redirect: current } : undefined,
                });
              }
            }
            return Promise.reject(error);
          }
        );
      },

      saveLangPreference(lang) {
        // keep in last, because it will fail in read only mode
        if (this.isLogged && lang !== this.lang) {
          this.lang = lang;
          this.commitToLocaleStorage_();
          c2c.userProfile.update_preferred_language(this.lang);
        }
      },

      commitToLocaleStorage_() {
        this.$localStorage.set(config.urls.api, this.$data);
      },

      checkExpiration(expire, token) {
        if (!expire) {
          return true;
        }

        const now = Date.now() / 1000; // in seconds

        if (now > expire) {
          this.expiredTokenLogout(token);
          return true;
        }

        return false;
      },
    },
  });

  // Expose a debug entry point OUTSIDE any Vue hook so it is
  // guaranteed available as soon as this plugin is installed —
  // even if the User instance's created() hook errored out
  // for some reason. Usage from any devtools console:
  //   await __c2cAvatarDebug()
  // Prints logged/username/forumUsername/cached avatarTemplate,
  // the URL the plugin builds, and a fresh live fetch response
  // (status + body) so we can pinpoint why an avatar doesn't show.
  if (typeof window !== 'undefined') {
    window.__c2cAvatarDebug = async () => {
      const u = Vue.prototype.$user;
      const state = {
        isLogged: u?.isLogged,
        userName: u?.userName,
        forumUsername: u?.forumUsername,
        avatarTemplate: u?.avatarTemplate,
        avatarUrl96: u?.avatarUrl?.(96),
        forumBase: config.urls.forum,
      };
      // eslint-disable-next-line no-console
      console.log('[c2cAvatarDebug] state:', state);
      if (!u?.forumUsername) return state;
      const url = `${config.urls.forum}/u/${encodeURIComponent(u.forumUsername)}.json`;
      try {
        const resp = await fetch(url, {
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        const body = resp.ok ? await resp.json() : await resp.text();
        const result = {
          url,
          status: resp.status,
          ok: resp.ok,
          template: typeof body === 'object' ? body?.user?.avatar_template : undefined,
          body,
        };
        // eslint-disable-next-line no-console
        console.log('[c2cAvatarDebug] fetch:', result);
        return { state, fetch: result };
      } catch (err) {
        const errInfo = { url, name: err?.name, message: err?.message || String(err) };
        // eslint-disable-next-line no-console
        console.log('[c2cAvatarDebug] fetch error:', errInfo);
        return { state, error: errInfo };
      }
    };
  }
}
