<template>
  <div class="reply-editor" :class="{ 'is-disabled': disabled }">
    <!-- Toolbar — minimal Markdown helpers. Each button wraps or
         inserts the appropriate syntax at the current caret. Upload
         goes through Discourse's /uploads.json endpoint and inserts
         the returned URL as ![filename](url). -->
    <div class="re-toolbar" role="toolbar" aria-label="Format">
      <button type="button" class="re-tool" :disabled="disabled" @click="wrap('**', '**')" title="Gras">
        <fa-icon icon="bold" />
      </button>
      <button type="button" class="re-tool" :disabled="disabled" @click="wrap('*', '*')" title="Italique">
        <fa-icon icon="italic" />
      </button>
      <button type="button" class="re-tool" :disabled="disabled" @click="wrap('`', '`')" title="Code">
        <fa-icon icon="code" />
      </button>
      <button type="button" class="re-tool" :disabled="disabled" @click="insertPrefix('> ')" title="Citation">
        <fa-icon icon="quote-right" />
      </button>
      <button type="button" class="re-tool" :disabled="disabled" @click="insertPrefix('- ')" title="Liste">
        <fa-icon icon="list-ul" />
      </button>
      <button type="button" class="re-tool" :disabled="disabled" @click="insertLink" title="Lien">
        <fa-icon icon="link" />
      </button>
      <label class="re-tool re-upload" :class="{ 'is-disabled': disabled || uploading }" :title="$gettext('Image')">
        <fa-icon :icon="uploading ? 'spinner' : 'image'" :spin="uploading" />
        <input ref="fileInput" type="file" accept="image/*" :disabled="disabled || uploading" @change="onFilePicked" />
      </label>
    </div>
    <textarea
      ref="textarea"
      :value="value"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      class="re-textarea"
      @input="$emit('input', $event.target.value)"
    />
  </div>
</template>

<script>
// Shared Markdown-aware editor for the forum: reply to a topic,
// reply to a specific post, create a new topic, edit an existing
// post. Emits `input` with the current textarea value so it plugs
// into any v-model callsite.
//
// The toolbar is deliberately minimal (bold / italic / code /
// quote / list / link / image) — matches what mobile users
// realistically use one-handed. Image upload goes straight to
// Discourse via /uploads.json and inserts a markdown image link
// at the caret position.

import { toast } from 'bulma-toast';

import forum from '@/js/apis/forum';

export default {
  name: 'ForumReplyEditor',

  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    rows: { type: [Number, String], default: 5 },
  },

  data() {
    return { uploading: false };
  },

  methods: {
    // Read the current caret window on the textarea, wrap the
    // selected text with `before` / `after`, and re-emit the new
    // value. Cursor stays inside the wrapped selection so the user
    // keeps typing without breaking their flow.
    wrap(before, after) {
      const ta = this.$refs.textarea;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const selected = val.slice(start, end);
      const next = val.slice(0, start) + before + selected + after + val.slice(end);
      this.$emit('input', next);
      this.$nextTick(() => {
        ta.focus();
        ta.selectionStart = start + before.length;
        ta.selectionEnd = end + before.length;
      });
    },

    // Prefix each line of the current selection (or the current
    // line if there is no selection) with `prefix`. Used for
    // block-level constructs: quotes, lists.
    insertPrefix(prefix) {
      const ta = this.$refs.textarea;
      if (!ta) return;
      const val = ta.value;
      let { selectionStart: start, selectionEnd: end } = ta;
      // Extend selection to whole-line boundaries so we don't
      // prefix mid-line.
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = val.indexOf('\n', end);
      const cut = lineEnd === -1 ? val.length : lineEnd;
      const chunk = val.slice(lineStart, cut);
      const prefixed = chunk
        .split('\n')
        .map((l) => prefix + l)
        .join('\n');
      const next = val.slice(0, lineStart) + prefixed + val.slice(cut);
      this.$emit('input', next);
      this.$nextTick(() => {
        ta.focus();
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + prefixed.length;
      });
    },

    insertLink() {
      const ta = this.$refs.textarea;
      if (!ta) return;
      const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd) || this.$gettext('texte du lien');
      const url = window.prompt(this.$gettext('URL du lien :'), 'https://');
      if (!url) return;
      this.wrapWith(`[${selected}](${url})`);
    },

    // Insert a raw fragment at the caret (or replace the current
    // selection). Used by the link + image helpers where the
    // fragment is already fully-formed.
    wrapWith(fragment) {
      const ta = this.$refs.textarea;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const next = val.slice(0, start) + fragment + val.slice(end);
      this.$emit('input', next);
      this.$nextTick(() => {
        ta.focus();
        ta.selectionStart = start + fragment.length;
        ta.selectionEnd = start + fragment.length;
      });
    },

    async onFilePicked(event) {
      const file = event.target.files?.[0];
      // Reset the input so picking the same file twice fires the
      // handler again.
      event.target.value = '';
      if (!file) return;
      // 8 MB soft cap — Discourse configs vary but this is a
      // reasonable mobile ceiling before the upload takes forever.
      const MAX_BYTES = 8 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Image trop lourde (max 8 Mo).'),
        });
        return;
      }
      this.uploading = true;
      try {
        const resp = await forum.uploadFile(file);
        const url = resp?.data?.url;
        const shortUrl = resp?.data?.short_url;
        const filename = resp?.data?.original_filename || file.name;
        if (!url && !shortUrl) throw new Error('no-url');
        // Discourse's "short_url" (upload://…) is the canonical form
        // — it renders properly in the cooked HTML and survives
        // domain moves. Fall back to the absolute URL if missing.
        const mdSrc = shortUrl || url;
        this.wrapWith(`\n![${filename}](${mdSrc})\n`);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 419) {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4500,
            message: this.$gettext('Connectez-vous au forum pour envoyer une image.'),
          });
        } else {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            message: this.$gettext("Échec de l'envoi de l'image."),
          });
        }
      } finally {
        this.uploading = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.reply-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  overflow: hidden;
  background: white;

  &:focus-within {
    border-color: #ff9933;
    box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.25);
  }

  &.is-disabled {
    opacity: 0.6;
  }
}

.re-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem;
  padding: 0.35rem 0.4rem;
  background: rgba(0, 0, 0, 0.04);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.re-tool {
  flex: 0 0 auto;
  min-width: 34px;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.5rem;
  background: transparent;
  border: none;
  color: #4a4a4a;
  font-size: 0.9rem;
  cursor: pointer;
  border-radius: 4px;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
  }
  &:disabled,
  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.re-upload {
  position: relative;
  cursor: pointer;

  input[type='file'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    &:disabled {
      cursor: not-allowed;
    }
  }
}

.re-textarea {
  border: none;
  outline: none;
  resize: vertical;
  min-height: 6rem;
  padding: 0.6rem 0.7rem;
  font-size: 0.9rem;
  font-family: inherit;
  color: #4a4a4a;
  background: transparent;

  &::placeholder {
    color: #9a9a9a;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .reply-editor {
    background: #1f1f1f;
    border-color: rgba(255, 255, 255, 0.15);
  }
  .re-toolbar {
    background: rgba(255, 255, 255, 0.05);
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }
  .re-tool {
    color: #e5e5e5;
    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
    }
  }
  .re-textarea {
    color: #e5e5e5;
    &::placeholder {
      color: #6b6b6b;
    }
  }
}
</style>
