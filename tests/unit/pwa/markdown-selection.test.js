// The caret helper now backs two editors: V1's wiki MarkdownEditor and
// the forum ReplyEditor. It was extracted out of MarkdownEditor rather
// than reimplemented, so these tests pin the behaviour both depend on.
//
// The toggles are the part worth guarding. A naive editor appends
// markers, so pressing bold twice yields ****text****; these semantics
// remove them instead, which is what the site does.

import { describe, expect, it } from 'vitest';

import Selection from '@/js/markdown-selection';

// Minimal stand-in for a <textarea>: value plus a caret range, which is
// the whole surface Selection touches.
function fakeTextarea(value, start = 0, end = start) {
  return { value, selectionStart: start, selectionEnd: end, focus() {} };
}

function sel(value, start, end) {
  const ta = fakeTextarea(value, start, end);
  return { ta, s: new Selection(ta, () => {}) };
}

describe('reading the selection', () => {
  it('exposes the selected text, its length and emptiness', () => {
    const { s } = sel('bonjour le monde', 8, 10);
    expect(s.text).toBe('le');
    expect(s.length).toBe(2);
    expect(s.isEmpty).toBe(false);
  });

  it('reports an empty selection when the caret is a point', () => {
    const { s } = sel('bonjour', 3, 3);
    expect(s.isEmpty).toBe(true);
    expect(s.text).toBe('');
  });
});

describe('inserting text', () => {
  it('replaces the selection and wraps it with before/after', () => {
    const { ta, s } = sel('bonjour le monde', 8, 10);
    s.setText('le', '**', '**');
    expect(ta.value).toBe('bonjour **le** monde');
  });

  it('leaves the new text selected so a second press can undo it', () => {
    const { ta, s } = sel('bonjour le monde', 8, 10);
    s.setText('le', '**', '**');
    expect(ta.value.slice(s.start, s.end)).toBe('le');
  });
});

describe('toggling an inline tag', () => {
  it('detects that the selection is already wrapped', () => {
    // Caret around "le" inside "**le**".
    const { s } = sel('bonjour **le** monde', 10, 12);
    expect(s.isSurroundedBy('**', '**')).toBe(true);
  });

  it('does not report a wrap that is not there', () => {
    const { s } = sel('bonjour le monde', 8, 10);
    expect(s.isSurroundedBy('**', '**')).toBe(false);
  });
});

describe('line prefixes', () => {
  it('adds a prefix to every selected line', () => {
    const { ta, s } = sel('un\ndeux\ntrois', 0, 13);
    s.addLinePrefix('* ');
    expect(ta.value).toBe('* un\n* deux\n* trois');
  });

  it('recognises when every line already carries the prefix', () => {
    const { s } = sel('* un\n* deux', 0, 11);
    expect(s.linesStartsWith('* ')).toBe(true);
  });

  it('does not recognise a partial prefix run', () => {
    const { s } = sel('* un\ndeux', 0, 9);
    expect(s.linesStartsWith('* ')).toBe(false);
  });

  it('removes the prefix from every selected line', () => {
    const { ta, s } = sel('* un\n* deux', 0, 11);
    s.removeLinePrefix('* ');
    expect(ta.value).toBe('un\ndeux');
  });

  it('round-trips: adding then removing restores the original text', () => {
    const { ta, s } = sel('un\ndeux', 0, 7);
    s.addLinePrefix('> ');
    expect(ta.value).toBe('> un\n> deux');
    s.expandToEntireLine();
    s.removeLinePrefix('> ');
    expect(ta.value).toBe('un\ndeux');
  });
});

describe('expanding to whole lines', () => {
  it('grows a mid-word caret out to the full line', () => {
    const { s } = sel('premiere ligne\nseconde ligne', 3, 5);
    s.expandToEntireLine();
    expect(s.text).toBe('premiere ligne');
  });
});

describe('replace', () => {
  it('rewrites the selection through a pattern', () => {
    const { ta, s } = sel('## un titre', 0, 11);
    s.replace(/^#+ */, '');
    expect(ta.value).toBe('un titre');
  });
});
