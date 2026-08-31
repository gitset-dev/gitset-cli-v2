'use strict';

const theme = require('./theme');

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Animates `label` while `promise` is pending, so a slow-but-working AI call
 * (a free-tier model under load can legitimately take tens of seconds) never
 * looks identical to a genuine hang on a terminal with zero other feedback.
 * Falls back to a single static line — no cursor control, no redrawing —
 * when stdout isn't a real TTY (CI logs, piped output), where animating
 * would just spam garbage.
 *
 * @param {string} label
 * @param {Promise<T>} promise  already in flight; this only controls display
 * @returns {Promise<T>}
 * @template T
 */
async function withSpinner(label, promise) {
  if (!theme.tty()) {
    process.stderr.write(`${theme.dim(`… ${label}`)}\n`);
    return promise;
  }
  let i = 0;
  process.stderr.write('\x1b[?25l'); // hide cursor
  const timer = setInterval(() => {
    process.stderr.write(`\r${theme.accent(FRAMES[i % FRAMES.length])} ${theme.dim(label)}`);
    i += 1;
  }, 80);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
    process.stderr.write('\r\x1b[K\x1b[?25h'); // clear the line, show cursor again
  }
}

module.exports = { withSpinner };
