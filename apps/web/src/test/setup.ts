// Node 25+ ships an experimental Web Storage global that is `undefined` unless Node is started
// with `--localstorage-file`. Vitest doesn't overwrite globals that already exist, so under jsdom
// `localStorage` would stay undefined. Point the storage globals at jsdom's implementation.
const jsdom = (globalThis as { jsdom?: { window: Window } }).jsdom

if (jsdom) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value: jsdom.window[name] })
  }
}
