<template>
  <div class="reply-editor" :class="{ 'is-disabled': disabled }">
    <!-- Toolbar. Same buttons, same order and the same toggle semantics
         as the composer on forum.camptocamp.org, built on V1's own
         EditorButton so the two editors in this app look identical. -->
    <div class="re-toolbar" role="toolbar" :aria-label="$gettext('Mise en forme')">
      <editor-button icon="bold" :disabled="disabled" :tooltip="$gettext('Gras')" @click="handleBold" />
      <editor-button icon="italic" :disabled="disabled" :tooltip="$gettext('Italique')" @click="handleItalic" />
      <editor-button icon="heading" :disabled="disabled" :tooltip="$gettext('Titre')" @click="handleHeading" />
      <editor-button icon="quote-right" :disabled="disabled" :tooltip="$gettext('Citation')" @click="handleQuote" />
      <editor-button icon="code" :disabled="disabled" :tooltip="$gettext('Code')" @click="handleCode" />
      <editor-button icon="list-ul" :disabled="disabled" :tooltip="$gettext('Liste à puces')" @click="handleListUl" />
      <editor-button icon="list-ol" :disabled="disabled" :tooltip="$gettext('Liste numérotée')" @click="handleListOl" />
      <editor-button icon="link" :disabled="disabled" :tooltip="$gettext('Lien')" @click="handleLink" />
      <editor-button icon="grin" :disabled="disabled" :tooltip="$gettext('Émoji')" @click="emojiOpen = !emojiOpen" />
      <label class="button has-text-primary re-upload" :class="{ 'is-disabled': disabled || uploading }">
        <span class="icon">
          <fa-icon :icon="uploading ? 'spinner' : 'image'" :spin="uploading" />
        </span>
        <input ref="fileInput" type="file" accept="image/*" :disabled="disabled || uploading" @change="onFilePicked" />
      </label>
    </div>

    <!-- Emoji palette. Discourse's own picker lists hundreds behind a
         search box; on a phone a short grid of the ones actually used on
         the C2C forum is more useful than a searchable wall. Inserts the
         :shortcode: form, which is what Discourse stores. -->
    <div v-if="emojiOpen" class="re-emoji" role="menu">
      <button
        v-for="e in emojis"
        :key="e.code"
        type="button"
        class="re-emoji-item"
        :title="':' + e.code + ':'"
        @click="insertEmoji(e.code)"
      >
        {{ e.char }}
      </button>
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
// Markdown editor for the forum: reply to a topic, reply to a specific
// post, create a new topic, edit an existing post. Emits `input` with
// the current value so it plugs into any v-model callsite.
//
// Why this is not simply V1's MarkdownEditor: that component is bound to
// the c2c wiki dialect. Its preview goes through the c2c /cooker API, its
// image button inserts `[img=ID right]…[/img]`, and its "hashtag" button
// inserts a climbing pitch table. None of those mean anything on
// Discourse, and sending forum text to the c2c cooker would be wrong.
//
// What *is* shared, because it is dialect-neutral: the Selection helper
// (extracted out of MarkdownEditor into @/js/markdown-selection) and the
// EditorButton component. That is what gives this toolbar the same toggle
// behaviour as V1 — pressing bold twice unbolds, pressing list twice
// unlists — instead of a second, subtly different implementation.

import { toast } from 'bulma-toast';

import EditorButton from '@/components/markdown-editor/EditorButton';
import forum from '@/js/apis/forum';
import Selection from '@/js/markdown-selection';

// Shortcodes Discourse ships by default, picked for what actually comes
// up on a mountaineering forum. The stored form is `:code:`; the glyph is
// only what the button shows.
const EMOJIS = [
  { code: 'slight_smile', char: '🙂' },
  { code: 'smile', char: '😄' },
  { code: 'wink', char: '😉' },
  { code: 'grin', char: '😁' },
  { code: 'sweat_smile', char: '😅' },
  { code: 'thinking', char: '🤔' },
  { code: 'astonished', char: '😲' },
  { code: 'cry', char: '😢' },
  { code: 'thumbsup', char: '👍' },
  { code: 'thumbsdown', char: '👎' },
  { code: 'clap', char: '👏' },
  { code: 'pray', char: '🙏' },
  { code: 'heart', char: '❤️' },
  { code: 'fire', char: '🔥' },
  { code: '+1', char: '➕' },
  { code: 'warning', char: '⚠️' },
  { code: 'mountain', char: '⛰️' },
  { code: 'snowflake', char: '❄️' },
  { code: 'sunny', char: '☀️' },
  { code: 'cloud_with_rain', char: '🌧️' },
  { code: 'skier', char: '⛷️' },
  { code: 'climbing', char: '🧗' },
  { code: 'tent', char: '⛺' },
  { code: 'camera', char: '📷' },
];

export default {
  name: 'ForumReplyEditor',

  components: { EditorButton },

  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    rows: { type: [Number, String], default: 5 },
  },

  data() {
    return {
      uploading: false,
      emojiOpen: false,
      selection: null,
      emojis: EMOJIS,
    };
  },

  mounted() {
    // Selection mutates the textarea directly and calls back so we can
    // emit the v-model update.
    this.selection = new Selection(this.$refs.textarea, () => {
      this.$emit('input', this.$refs.textarea.value);
    });
  },

  methods: {
    // Put the caret at the end and focus. Callers use this after
    // pre-filling a quote so the user types straight after it, rather
    // than reaching into this component for a ref.
    focusEnd() {
      const ta = this.$refs.textarea;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    },

    // ---- Generic tag helpers, mirroring V1's MarkdownEditor ---------

    // Inline tag that wraps the selection and toggles off when the
    // selection is already surrounded by it.
    applyInlineTag(tag, defaultChunk) {
      const tagLength = tag.length;
      if (this.selection.isSurroundedBy(tag, tag)) {
        const chunk = this.selection.text;
        this.selection.set(this.selection.start - tagLength, this.selection.end + tagLength);
        this.selection.setText(chunk);
      } else {
        const chunk = this.selection.isEmpty ? defaultChunk : this.selection.text;
        this.selection.setText(chunk, tag, tag);
      }
      this.$refs.textarea.focus();
    },

    // Line-prefix tag (lists, quotes) that toggles off when every line
    // in the selection already carries it.
    applyBlockTag(tag, defaultChunk) {
      this.selection.expandToEntireLine();
      if (this.selection.isEmpty) {
        this.selection.setText(defaultChunk);
        this.selection.set(this.selection.start + tag.length);
      } else if (this.selection.linesStartsWith(tag)) {
        this.selection.removeLinePrefix(tag);
        this.selection.set(this.selection.start);
      } else {
        this.selection.addLinePrefix(tag);
        this.selection.set(this.selection.start + tag.length);
      }
      this.$refs.textarea.focus();
    },

    // ---- Toolbar ---------------------------------------------------

    handleBold() {
      this.applyInlineTag('**', this.$gettext('texte en gras'));
    },

    handleItalic() {
      // Discourse renders both `_x_` and `*x*`; underscore matches what
      // its own toolbar inserts.
      this.applyInlineTag('_', this.$gettext('texte en italique'));
    },

    handleCode() {
      this.applyInlineTag('`', this.$gettext('code'));
    },

    handleHeading() {
      this.selection.expandToEntireLine();
      if (this.selection.text.startsWith('#')) {
        this.selection.replace(/^#+ */, '');
      } else {
        const chunk = this.selection.isEmpty ? this.$gettext('titre') : this.selection.text;
        this.selection.setText(chunk, '## ');
      }
      this.$refs.textarea.focus();
    },

    handleQuote() {
      this.applyBlockTag('> ', this.$gettext('> citation'));
    },

    handleListUl() {
      this.applyBlockTag('* ', '* ' + this.$gettext('élément 1') + '\n* ' + this.$gettext('élément 2'));
    },

    handleListOl() {
      this.applyBlockTag('1. ', '1. ' + this.$gettext('élément 1') + '\n2. ' + this.$gettext('élément 2'));
    },

    handleLink() {
      const selected = this.selection.text || this.$gettext('texte du lien');
      const url = window.prompt(this.$gettext('URL du lien :'), 'https://');
      if (!url) return;
      this.selection.setText(`[${selected}](${url})`);
      this.$refs.textarea.focus();
    },

    insertEmoji(code) {
      this.emojiOpen = false;
      this.selection.set(this.selection.start, this.selection.start);
      this.selection.setText(code, ':', ':');
      this.$refs.textarea.focus();
    },

    // ---- Image upload ----------------------------------------------

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
        this.selection.set(this.selection.start, this.selection.start);
        this.selection.setText(`![${filename}](${mdSrc})`, '\n', '\n');
        this.$refs.textarea.focus();
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

  // EditorButton renders a Bulma .button; strip the chrome so the row
  // reads as a toolbar rather than ten separate buttons.
  ::v-deep .button {
    border: none;
    background: transparent;
    height: 34px;
    min-width: 34px;
    padding: 0 0.5rem;

    &:hover {
      background: rgba(0, 0, 0, 0.06);
    }
    &[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.re-upload {
  position: relative;
  cursor: pointer;
  border: none;
  background: transparent;
  height: 34px;
  min-width: 34px;
  padding: 0 0.5rem;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

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

.re-emoji {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.25rem, 1fr));
  gap: 0.15rem;
  padding: 0.4rem;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  max-height: 9rem;
  overflow-y: auto;
}

.re-emoji-item {
  border: none;
  background: transparent;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.3rem 0;
  border-radius: 4px;
  cursor: pointer;

  &:hover,
  &:focus {
    background: rgba(0, 0, 0, 0.07);
    outline: none;
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
  .re-toolbar .button:hover,
  .re-upload:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .re-emoji {
    background: rgba(255, 255, 255, 0.03);
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }
  .re-emoji-item:hover,
  .re-emoji-item:focus {
    background: rgba(255, 255, 255, 0.1);
  }
  .re-textarea {
    color: #e5e5e5;
    &::placeholder {
      color: #6b6b6b;
    }
  }
}
</style>
