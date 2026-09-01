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
    },

    created() {
      this.commitToLocaleStorage_();
      this.installExpiredTokenInterceptor();
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
        this.expire = null;

        this.commitToLocaleStorage_();
      },

      // Build the Discourse avatar URL from the forumUsername alone
      // — no JSON round-trip needed. Same URL pattern V1's
      // Navigation.vue uses (line 128), which we know works because
      // camptocamp.org uses it to show the top-right avatar of every
      // logged-in user. Discourse serves the current avatar at
      // `/user_avatar/{hostname}/{username}/{size}/1_1.png` regardless
      // of the actual version hash — internal redirects handle it.
      // Username must be lowercase to avoid a 302 → HTML redirect on
      // camptocamp's Discourse (which hides /u/:username.json behind
      // a login wall for the uppercase canonical variant).
      //
      // Falling back to initials in the UI is handled by the caller
      // via <img @error>; if this URL 404s (unknown username, offline,
      // etc.) the fa-icon takes over.
      avatarUrl(size = 96) {
        if (!this.forumUsername) return null;
        const username = String(this.forumUsername).toLowerCase();
        // Extract the hostname from config.urls.forum without adding
        // a URL constructor dependency — the config value is stable
        // (`https://forum.camptocamp.org` / `.demov6.` variants) so
        // stripping the scheme is enough.
        const hostname = config.urls.forum.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `${config.urls.forum}/user_avatar/${hostname}/${encodeURIComponent(username)}/${size}/1_1.png`;
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

  // Debug helper exposed at module scope so it is guaranteed
  // available as soon as this plugin is installed. Usage from any
  // devtools console (Chrome desktop, remote Safari inspector, etc.):
  //   await __c2cAvatarDebug()
  // Prints logged / userName / forumUsername / the URL the plugin
  // builds, plus a live HEAD probe on that URL (status + content-type)
  // so we can pinpoint why an avatar doesn't show.
  if (typeof window !== 'undefined') {
    window.__c2cAvatarDebug = async () => {
      const u = Vue.prototype.$user;
      const url96 = u?.avatarUrl?.(96);
      const state = {
        isLogged: u?.isLogged,
        userName: u?.userName,
        forumUsername: u?.forumUsername,
        forumBase: config.urls.forum,
        avatarUrl96: url96,
      };
      // eslint-disable-next-line no-console
      console.log('[c2cAvatarDebug] state:', state);
      if (!url96) return state;
      try {
        // HEAD probe — cheap, follows redirects, tells us if the
        // pattern URL resolves to a real image on Discourse.
        const resp = await fetch(url96, { method: 'HEAD', credentials: 'omit' });
        const result = {
          url: url96,
          status: resp.status,
          ok: resp.ok,
          contentType: resp.headers.get('content-type'),
        };
        // eslint-disable-next-line no-console
        console.log('[c2cAvatarDebug] image probe:', result);
        return { state, probe: result };
      } catch (err) {
        const errInfo = { url: url96, name: err?.name, message: err?.message || String(err) };
        // eslint-disable-next-line no-console
        console.log('[c2cAvatarDebug] probe error:', errInfo);
        return { state, error: errInfo };
      }
    };
  }
}
