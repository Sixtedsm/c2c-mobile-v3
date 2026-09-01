import c2c from '@/js/apis/c2c';
import forum from '@/js/apis/forum';
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
      // user set on the C2C site. Cheap: one JSON call, silent on
      // failure. The template lives in localStorage between sessions
      // via commitToLocaleStorage_().
      refreshDiscourseAvatar(username) {
        forum
          .getUser(username)
          .then((response) => {
            const template = response?.data?.user?.avatar_template;
            if (template && template !== this.avatarTemplate) {
              this.avatarTemplate = template;
              this.commitToLocaleStorage_();
            } else if (!template) {
              // Discourse answered but had no avatar_template on the
              // user payload — highly unusual. Surface it in the
              // console so a maintainer can inspect the response
              // shape rather than staring at "no photo shows up".
              // eslint-disable-next-line no-console
              console.warn('Discourse user response missing avatar_template', response?.data?.user);
            }
          })
          .catch((err) => {
            // 404 / offline / rate-limited / CORS — keep whatever we
            // had cached, fall back to initials in the UI. A one-line
            // warning helps diagnose the "photo doesn't show" case
            // without breaking anything at runtime.
            // eslint-disable-next-line no-console
            console.warn('Discourse avatar fetch failed for', username, err?.message || err);
          });
      },

      // Build a fully-qualified avatar URL for a given pixel size.
      // Returns null when no template has been fetched yet, so the
      // caller can render the initials placeholder in the meantime.
      avatarUrl(size = 96) {
        if (!this.avatarTemplate) return null;
        return forum.avatarUrlFromTemplate(this.avatarTemplate, size);
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
}
