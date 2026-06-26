// attachLogFile(filePath) — duplicate process.stdout + process.stderr writes to a log file.
//
// Mirrors BXM/UJM/EM's attach-log-file pattern. Lets devs (and Claude) `tail -f` a log file to
// see every line of output a process produces — child process stdout/stderr, console.log calls,
// the works.
//
// ANSI color codes are stripped from the file output so it's grep-friendly. The console continues
// to receive the original colored output unchanged.
//
// The default export is a process-wide SINGLETON (the common case: a CLI command tees its whole
// run to one file). `attachLogFile.createTee()` returns an INDEPENDENT tee with its own state.
// Tees STACK: a later attach() captures the CURRENT `process.stdout.write` (which may already be
// an outer tee) as its "original", so writes fan out through every layer and detach() restores
// the exact prior writer in LIFO order.
//
// Idempotent: calling attach() twice with the same path on one tee returns the existing handle.

const fs = require('fs');
const path = require('path');

const ANSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(s) {
  return String(s).replace(ANSI_PATTERN, '');
}

function createTee() {
  let activeStream = null;
  let activePath   = null;
  let originalStdoutWrite = null;
  let originalStderrWrite = null;

  function attach(filePath) {
    if (!filePath) return null;
    const abs = path.resolve(filePath);

    if (activeStream && activePath === abs) return activeStream;
    if (activeStream) detach();

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const stream = fs.createWriteStream(abs, { flags: 'w' });

    stream.write(`# bem log — ${new Date().toISOString()} — pid=${process.pid}\n`);

    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    originalStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = function (chunk, ...rest) {
      try { stream.write(stripAnsi(String(chunk))); } catch (e) { /* ignore */ }
      return originalStdoutWrite(chunk, ...rest);
    };
    process.stderr.write = function (chunk, ...rest) {
      try { stream.write(stripAnsi(String(chunk))); } catch (e) { /* ignore */ }
      return originalStderrWrite(chunk, ...rest);
    };

    activeStream = stream;
    activePath   = abs;

    return stream;
  }

  function detach() {
    if (originalStdoutWrite) process.stdout.write = originalStdoutWrite;
    if (originalStderrWrite) process.stderr.write = originalStderrWrite;
    const stream = activeStream;
    activeStream = null;
    activePath   = null;
    originalStdoutWrite = null;
    originalStderrWrite = null;

    return new Promise((resolve) => {
      if (!stream) {
        return resolve();
      }
      stream.end(resolve);
    });
  }

  return { attach, detach };
}

const singleton = createTee();

function attachLogFile(filePath) {
  return singleton.attach(filePath);
}

module.exports = attachLogFile;
module.exports.detach    = singleton.detach;
module.exports.stripAnsi = stripAnsi;
module.exports.createTee = createTee;
