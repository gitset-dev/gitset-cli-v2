'use strict';

/**
 * Shared terminal color system — same teal accent as the Gitset web app
 * (see gitset-web/DESIGN.md), split into a dark-terminal tone and a
 * light-terminal tone because a bright cyan is unreadable on a white
 * background. Respects NO_COLOR (https://no-color.org) and non-TTY output.
 */
const config = require('../../lib/config');

const tty = () => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

// Same hue family (~178°) as the web's --brand token, at two lightness
// levels per mode so there's still hierarchy (primary vs. quieter accent)
// even in a small terminal palette.
const PALETTE = {
  dark: {
    accent: [108, 224, 219], // #6CE0DB
    accentDim: [79, 173, 168],
  },
  light: {
    accent: [25, 118, 114], // #197672
    accentDim: [15, 83, 80],
  },
};

function detectDefaultMode() {
  // Many terminals set COLORFGBG as "fg;bg" (0-15 ANSI index). A light
  // background index means a light theme; anything else, assume dark —
  // by far the more common terminal default.
  const fgbg = process.env.COLORFGBG;
  if (fgbg) {
    const bg = parseInt(fgbg.split(';').pop(), 10);
    if (!Number.isNaN(bg) && bg >= 7) return 'light';
  }
  return 'dark';
}

function mode() {
  const stored = config.getTheme();
  return stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : detectDefaultMode();
}

function rgb(triplet, s) {
  if (!tty()) return s;
  const [r, g, b] = triplet;
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
}
function code(n, s) {
  return tty() ? `\x1b[${n}m${s}\x1b[0m` : s;
}

const accent = (s) => rgb(PALETTE[mode()].accent, s);
const accentDim = (s) => rgb(PALETTE[mode()].accentDim, s);
const bold = (s) => code('1', s);
const dim = (s) => code('2', s);
const error = (s) => code('31', s);
const warn = (s) => code('33', s);
// No separate "success" hue, mirroring the web decision: the brand accent
// IS the affirmative color everywhere, not a second green.
const success = (s) => accent(s);

// Highlights the bracketed letter of a menu hint in accent+bold and leaves
// the rest of the word plain, e.g. key('a', 'ccept') -> "[a]ccept" with
// only "[a]" colored — makes the actionable keystroke pop at a glance.
function key(letter, rest) {
  return `${accent(bold(`[${letter}]`))}${rest}`;
}

module.exports = { mode, accent, accentDim, bold, dim, error, warn, success, key, tty };
