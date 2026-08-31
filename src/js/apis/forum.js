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
Forum.prototype.getUser = function (username) {
  return this.get(`/u/${encodeURIComponent(username)}.json`);
};

Forum.prototype.getUserSummary = function (username) {
  return this.get(`/u/${encodeURIComponent(username)}/summary.json`);
};

Forum.prototype.getUserTopics = function (username) {
  const result = this.get(`/topics/created-by/${encodeURIComponent(username)}.json`);
  result.then((response) => Forum.prototype._hydrateLastPosters(response.data));
  return result;
};

// Full-text search across the forum. Discourse `q` accepts operators
// (in:pinned, category:slug, …) but we pass the raw query and let the
// user learn what they want.
Forum.prototype.search = function (query) {
  return this.get(`/search.json?q=${encodeURIComponent(query)}`);
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
