import axios from 'axios';

import BaseApi from '@/js/apis/BaseApi';
import config from '@/js/config';

// V1 forum service, extended for the V3 in-app Discourse client. Read
// paths go through the standard BaseApi (no cookies). Write paths
// (post a reply, like) need the user's Discourse session cookie and a
// CSRF token — those live on a separate `authAxios` with
// `withCredentials: true`.
function Forum() {
  BaseApi.call(this, config.urls.forum);
  this.authAxios = axios.create({
    baseURL: config.urls.forum,
    timeout: 15000,
    withCredentials: true,
  });
}

Forum.prototype = Object.create(BaseApi.prototype);
Forum.prototype.constructor = Forum;

Object.defineProperty(Forum.prototype, 'url', {
  get() {
    return config.urls.forum;
  },
});

// ---- Reads ----------------------------------------------------------

Forum.prototype.getTopic = function (topicId, postNumber) {
  // `postNumber` opens the topic starting from that post so a very
  // long topic can be paginated instead of loading all posts at once.
  if (postNumber) {
    return this.get('/t/' + topicId + '/' + postNumber + '.json');
  }
  return this.get('/t/title/' + topicId + '.json');
};

Forum.prototype.getPostsRange = function (topicId, postIds) {
  // Fetch a specific window of posts inside a topic. Discourse gives
  // us `post_stream.stream` (all post ids) but only ~20 hydrated
  // posts; this endpoint fetches the missing ones by id.
  const params = postIds.map((id) => 'post_ids[]=' + id).join('&');
  return this.get('/t/' + topicId + '/posts.json?' + params);
};

Forum.prototype.getLatest = function (excludeCategoryIds) {
  const q = excludeCategoryIds ? '?' + excludeCategoryIds.map((id) => `exclude_category_ids[]=${id}`).join('&') : '';
  const result = this.get(`/latest.json${q}`);
  result.then((response) => Forum.prototype._hydrateLastPosters(response.data));
  return result;
};

// Top topics — most popular over a period. Public endpoint (no
// cookie needed). period: 'all' | 'yearly' | 'quarterly' | 'monthly'
// | 'weekly' | 'daily'.
Forum.prototype.getTop = function (period = 'monthly') {
  const result = this.get(`/top.json?period=${encodeURIComponent(period)}`);
  result.then((response) => Forum.prototype._hydrateLastPosters(response.data));
  return result;
};

// All tags known to Discourse (grouped or ungrouped). Public.
Forum.prototype.getTags = function () {
  return this.get('/tags.json');
};

// Topics carrying a given tag. Public.
Forum.prototype.getTagTopics = function (tag) {
  const result = this.get(`/tag/${encodeURIComponent(tag)}.json`);
  result.then((response) => Forum.prototype._hydrateLastPosters(response.data));
  return result;
};

// All categories, subcategories included. Discourse returns a flat
// list; the tree is reconstructed via `parent_category_id` in the
// components that need it.
Forum.prototype.getCategories = function () {
  return this.get('/categories.json?include_subcategories=true');
};

// Topics inside a category (with pagination page 0..N).
Forum.prototype.getCategoryTopics = function (slug, id, page) {
  const p = page ? `?page=${page}` : '';
  const result = this.get(`/c/${slug}/${id}.json${p}`);
  result.then((response) => Forum.prototype._hydrateLastPosters(response.data));
  return result;
};

// User summary (profile page). Discourse returns a rich blob:
// user (bio, badges, stats), user_actions (recent activity), etc.
// Discourse usernames are case-insensitive server-side but their URLs
// are canonical lowercase. Hitting `/u/Sixte-dsm.json` triggers a
// 302 redirect to `/u/sixte-dsm.json` and, depending on the
// middleware, the redirect can end up serving the HTML page instead
// of the JSON — the caller then chokes on a `<!DOCTYPE ...>` reply.
// Normalise here so every callsite lands directly on the JSON.
function canonicalUsername(username) {
  return encodeURIComponent(String(username || '').toLowerCase());
}

Forum.prototype.getUser = function (username) {
  return this.get(`/u/${canonicalUsername(username)}.json`);
};

Forum.prototype.getUserSummary = function (username) {
  return this.get(`/u/${canonicalUsername(username)}/summary.json`);
};

Forum.prototype.getUserTopics = function (username) {
  const result = this.get(`/topics/created-by/${canonicalUsername(username)}.json`);
  result.then((response) => Forum.prototype._hydrateLastPosters(response.data));
  return result;
};

// Full-text search across the forum. Discourse `q` accepts operators
// (in:pinned, category:slug, user:xxx, after:yyyy-mm-dd, …). Callers
// pass the raw query plus optional structured filters that we glue
// on with the right operators — keeps the callers from having to
// remember the exact operator syntax.
Forum.prototype.search = function (query, { categorySlug, username, after, before } = {}) {
  let full = String(query || '').trim();
  if (categorySlug) full += ` category:${categorySlug}`;
  if (username) full += ` user:${String(username).toLowerCase()}`;
  if (after) full += ` after:${after}`;
  if (before) full += ` before:${before}`;
  return this.get(`/search.json?q=${encodeURIComponent(full.trim())}`);
};

// Read the raw markdown of a post — used to build a `[quote]` block
// when the user chooses "Reply to this post".
Forum.prototype.getPostRaw = function (postId) {
  return this.get(`/posts/${postId}.json`);
};

// ---- Writes (require Discourse session cookie) ----------------------

Forum.prototype._getCsrf = async function () {
  const resp = await this.authAxios.get('/session/csrf.json');
  return resp?.data?.csrf;
};

Forum.prototype.postReply = async function ({ topicId, raw, replyToPostNumber } = {}) {
  if (!topicId || !raw) throw new Error('topicId and raw are required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({ topic_id: String(topicId), raw });
  if (replyToPostNumber) body.set('reply_to_post_number', String(replyToPostNumber));
  return this.authAxios.post('/posts.json', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

Forum.prototype.likePost = async function (postId) {
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({
    id: String(postId),
    post_action_type_id: '2', // Discourse "like"
    flag_topic: 'false',
  });
  return this.authAxios.post('/post_actions.json', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Flag a post for moderation. Discourse post_action_type_id values:
//   3 = off_topic, 4 = inappropriate, 8 = spam — no message needed;
//   7 = notify_moderators — free-text `message` is required.
// These are the same four reasons the flag dialog offers on
// forum.camptocamp.org, so a flag raised from the app lands in the
// moderation queue identically to one raised from the site.
Forum.prototype.flagPost = async function (postId, { actionTypeId = 7, message = '' } = {}) {
  if (!postId) throw new Error('postId is required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({
    id: String(postId),
    post_action_type_id: String(actionTypeId),
    flag_topic: 'false',
  });
  // Only notify_moderators carries a message; sending one with the
  // other types makes Discourse 400.
  if (Number(actionTypeId) === 7 && message) body.set('message', message);
  return this.authAxios.post('/post_actions.json', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

Forum.prototype.unlikePost = async function (postId) {
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  return this.authAxios.delete(`/post_actions/${postId}.json?post_action_type_id=2`, {
    headers: {
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Create a brand-new topic in a category. Discourse's /posts.json
// creates a topic when `title` + `category` are passed alongside
// `raw`. Returns the created topic id so the caller can redirect.
Forum.prototype.createTopic = async function ({ title, raw, category } = {}) {
  if (!title || !raw || !category) throw new Error('title, raw and category are required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({
    title,
    raw,
    category: String(category),
    // 'regular' = normal topic (as opposed to private message).
    archetype: 'regular',
  });
  return this.authAxios.post('/posts.json', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Edit an existing post (user's own). Discourse expects the raw
// markdown body + an edit_reason (optional). Returns the updated
// post payload.
Forum.prototype.editPost = async function (postId, { raw, editReason } = {}) {
  if (!postId || !raw) throw new Error('postId and raw are required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({ 'post[raw]': raw });
  if (editReason) body.set('post[edit_reason]', editReason);
  return this.authAxios.put(`/posts/${postId}.json`, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Bookmark endpoints — Discourse's bookmark model attaches to a
// specific post (bookmarking the first post of a topic = bookmarking
// the topic itself, which is how the site UI does it too).
Forum.prototype.bookmarkPost = async function (postId, { reminderAt } = {}) {
  if (!postId) throw new Error('postId is required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({
    bookmarkable_id: String(postId),
    bookmarkable_type: 'Post',
  });
  if (reminderAt) body.set('reminder_at', reminderAt);
  return this.authAxios.post('/bookmarks.json', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

Forum.prototype.deleteBookmark = async function (bookmarkId) {
  if (!bookmarkId) throw new Error('bookmarkId is required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  return this.authAxios.delete(`/bookmarks/${bookmarkId}.json`, {
    headers: {
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Bookmarks list for the current user — Discourse exposes it under
// /u/:username/bookmarks.json. Requires the user's Discourse session
// cookie so we go through authAxios (withCredentials: true) so any
// cookie already set for forum.camptocamp.org (via a previous SSO
// login on that domain) is sent along.
Forum.prototype.getUserBookmarks = async function (username) {
  return this.authAxios.get(`/u/${canonicalUsername(username)}/bookmarks.json`);
};

// Notifications — the bell inbox on the forum. Same cookie-based
// auth as bookmarks: needs the Discourse session cookie to succeed.
Forum.prototype.getNotifications = async function ({ recent = false, limit = 30 } = {}) {
  const params = new URLSearchParams();
  if (recent) params.set('recent', 'true');
  if (limit) params.set('limit', String(limit));
  return this.authAxios.get(`/notifications.json?${params.toString()}`);
};

Forum.prototype.markNotificationsRead = async function (notificationId) {
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = notificationId ? new URLSearchParams({ id: String(notificationId) }) : new URLSearchParams();
  return this.authAxios.put('/notifications/mark-read.json', body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Set the current user's notification level on a topic. Discourse
// levels: 0 = Muted, 1 = Regular (default), 2 = Tracking (notify on
// mentions + first unread on visit), 3 = Watching (notify on every
// new post). Requires a session cookie on forum.camptocamp.org.
Forum.prototype.setTopicNotificationLevel = async function (topicId, level) {
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const body = new URLSearchParams({ notification_level: String(level) });
  return this.authAxios.post(`/t/${topicId}/notifications.json`, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// Upload endpoint — used by the reply editor when the user picks an
// image. Returns the URL to embed in the markdown as ![alt](url).
// `type` is 'composer' for a post upload.
Forum.prototype.uploadFile = async function (file, { type = 'composer' } = {}) {
  if (!file) throw new Error('file is required');
  const csrf = await this._getCsrf();
  if (!csrf) throw new Error('no-csrf');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('type', type);
  return this.authAxios.post('/uploads.json', form, {
    headers: {
      'X-CSRF-Token': csrf,
      'Discourse-Logged-In': 'true',
    },
  });
};

// ---- Legacy helpers (kept for existing callers) --------------------

Forum.prototype.readAnnouncement = function (lang) {
  lang = ['zh_CN', 'hu', 'sl'].includes(lang) ? 'en' : lang;
  return this.get('/t/annonce-' + lang + '.json');
};

Forum.prototype.readBoardAnnouncement = function () {
  return this.get('/t/publication-ca.json');
};

Forum.prototype.getAvatarUrl = function (user, size) {
  if (!user?.avatar_template) return null;
  const template = user.avatar_template.startsWith('/') ? this.url + user.avatar_template : user.avatar_template;
  return template.replace('{size}', String(size));
};

// Direct-URL fallback for when we don't have the user object (e.g.
// Discourse serves an HTML login page instead of /u/:username.json
// because `hide_user_profiles_from_public` is on). This mirrors the
// V1 pattern in Navigation.vue and is what forum.camptocamp.org
// itself serves at that path. Always use for the current viewer's
// own avatar or when we only have a username.
Forum.prototype.avatarUrlByUsername = function (username, size = 96) {
  if (!username) return null;
  const lower = String(username).toLowerCase();
  const hostname = this.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `${this.url}/user_avatar/${hostname}/${encodeURIComponent(lower)}/${size}/1_1.png`;
};

// Convert a Discourse `avatar_template` (path with {size} placeholder)
// into a fully-qualified URL — handy when we only have the raw
// template string (as returned in `/latest.json.users[]`).
Forum.prototype.avatarUrlFromTemplate = function (template, size) {
  if (!template) return null;
  const path = template.replace('{size}', String(size));
  return path.startsWith('http') ? path : this.url + path;
};

// Attach a `last_poster_user` object on each topic so templates can
// render an avatar without indexing back into the users[] array. Also
// stash a lookup on the payload for callers that need it (e.g. an
// avatar for the first poster).
Forum.prototype._hydrateLastPosters = function (data) {
  const users = data?.users || [];
  const byUsername = {};
  const byId = {};
  users.forEach((u) => {
    if (u.username) byUsername[u.username] = u;
    if (u.id != null) byId[u.id] = u;
  });
  data.usersByUsername = byUsername;
  data.usersById = byId;
  const topics = data?.topic_list?.topics || [];
  topics.forEach((t) => {
    if (t.last_poster_username) {
      t.last_poster_user = byUsername[t.last_poster_username] || null;
    }
    const first = t.posters?.[0];
    if (first?.user_id != null) {
      t.first_poster_user = byId[first.user_id] || null;
    }
  });
};

export default new Forum();
