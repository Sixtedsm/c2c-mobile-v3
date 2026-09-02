// Caret/selection helper for a markdown <textarea>.
//
// Extracted verbatim from V1's MarkdownEditor.vue so the forum reply
// editor can share it instead of growing a second, subtly different
// implementation. Nothing here is c2c- or Discourse-specific: it only
// manipulates the text and the caret, which is exactly why it is worth
// having in one place.
//
// The semantics matter more than they look. isSurroundedBy +
// removeLinePrefix are what make the toolbar buttons *toggle* — pressing
// bold twice unbolds, pressing list twice unlists — rather than piling
// markers up. Any reimplementation would lose that.
//
// `onInput` is called after every mutation so the host component can
// emit its v-model update.

function Selection(textarea, onInput) {
  this.textarea = textarea;
  this.onInput = onInput;
}

Object.defineProperty(Selection.prototype, 'start', {
  get() {
    return this.textarea.selectionStart;
  },
  set(value) {
    this.textarea.selectionStart = value;
  },
});

Object.defineProperty(Selection.prototype, 'end', {
  get() {
    return this.textarea.selectionEnd;
  },
  set(value) {
    this.textarea.selectionEnd = value;
  },
});

Object.defineProperty(Selection.prototype, 'length', {
  get() {
    return this.end - this.start;
  },
});

Object.defineProperty(Selection.prototype, 'text', {
  get() {
    return this.textarea.value.substr(this.start, this.length);
  },
});

Object.defineProperty(Selection.prototype, 'isEmpty', {
  get() {
    return this.start === this.end;
  },
});

Selection.prototype.set = function (start, end) {
  this.start = start;
  this.end = end ?? start;
};

// TODO : remove before and after, and rewite calls with f-strings
Selection.prototype.setText = function (text, before = '', after = '') {
  const chunk = before + text + after;

  const start = this.start;
  this.textarea.value =
    this.textarea.value.substr(0, this.start) +
    chunk +
    this.textarea.value.substr(this.end, this.textarea.value.length);
  this.set(start + before.length, start + before.length + text.length);

  this.onInput(this.textarea.value);
};

Selection.prototype.replace = function (pattern, replacement) {
  this.setText(this.text.replace(pattern, replacement));
};

Selection.prototype.isSurroundedBy = function (before, after) {
  const beforeLength = before.length;
  const afterLength = after.length;
  const content = this.textarea.value;

  return (
    content.substr(this.start - beforeLength, beforeLength) === before &&
    content.substr(this.end, afterLength) === after
  );
};

Selection.prototype.expandToEntireLine = function () {
  const start = this.textarea.value.lastIndexOf('\n', this.start);
  this.start = start + 1;
  const end = this.textarea.value.indexOf('\n', this.end);
  this.end = end === -1 ? this.textarea.value.length : end;
};

Selection.prototype.linesStartsWith = function (tag) {
  for (const line of this.text.split('\n')) {
    if (!line.startsWith(tag)) {
      return false;
    }
  }

  return true;
};

Selection.prototype.removeLinePrefix = function (tag) {
  this.setText(
    this.text
      .split('\n')
      .map((line) => line.substr(tag.length))
      .join('\n')
  );
};

Selection.prototype.addLinePrefix = function (tag) {
  this.setText(
    this.text
      .split('\n')
      .map((line) => tag + line)
      .join('\n')
  );
};

export default Selection;
