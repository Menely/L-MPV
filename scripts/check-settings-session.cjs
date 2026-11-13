const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(file, requireModule) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: requireModule, console, setTimeout, clearTimeout };
  vm.runInNewContext(code, context, { filename: file });
  return context.exports;
}

const session = loadModule('src/components/settings/lib/settingsViewSession.ts');
const modalSource = fs.readFileSync('src/components/modals/SettingsModal.tsx', 'utf8');
const tabs = Array.from(modalSource.match(/const SETTINGS_TABS = \[([\s\S]*?)\]/)[1].matchAll(/"([^"]+)"/g), match => match[1]);
for (const section of ['section-system', 'section-integration']) {
  const tab = session.modalTabForSection(section);
  assert(tabs.includes(tab), `${section} must restore an actual modal tab, got ${tab}`);
  assert.equal(session.sectionIdForModalTab(tab), 'section-system');
}
assert.equal(session.sectionIdForModalTab('system'), 'section-system', 'Keep the session alias readable');

let registered = false;
let finishInitialDiagnostics;
let deferNextStatus = false;
let finishOldStatus;
const calls = [];
const invoke = async (command) => {
  calls.push(command);
  if (command === 'get_system_diagnostics') {
    const snapshot = { context_menu_registered: registered };
    if (!finishInitialDiagnostics) return new Promise(resolve => {
      finishInitialDiagnostics = () => resolve(snapshot);
    });
    return snapshot;
  }
  if (command === 'is_explorer_context_menu_registered') {
    if (deferNextStatus) {
      deferNextStatus = false;
      const snapshot = registered;
      return new Promise(resolve => { finishOldStatus = () => resolve(snapshot); });
    }
    return registered;
  }
  if (command === 'register_explorer_context_menu') { registered = true; return ['OK']; }
  if (command === 'unregister_explorer_context_menu') { registered = false; return ['OK']; }
  throw Error('Unexpected command: ' + command);
};
const diagnostics = loadModule('src/components/settings/lib/systemDiagnostics.ts', () => ({ invoke }));

let states, cursor, effects;
const React = {
  useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  },
  useRef: initial => ({ current: initial }),
  useCallback: callback => callback,
  useEffect: effect => effects.push(effect),
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
};
React.default = React;
const dict = { settings: { integrationFields: {}, systemFields: { diagError: String } } };
const component = loadModule('src/components/settings/tabs/SystemSettingsTab.tsx', name => {
  if (name === 'react') return React;
  if (name === '@tauri-apps/api/core') return { invoke };
  if (name.endsWith('/systemDiagnostics')) return diagnostics;
  if (name.endsWith('/LanguageContext')) return { useTranslation: () => ({ dict }) };
  return new Proxy({}, { get: (_, key) => key });
});
const flush = () => new Promise(resolve => setImmediate(resolve));
function mount() {
  states = []; cursor = 0; effects = [];
  const tree = component.SystemSettingsTab();
  const cleanups = effects.map(effect => effect());
  return { tree, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}
function buttons(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(buttons);
  return [...(tree.type === 'button' ? [tree] : []), ...buttons(tree.props?.children)];
}
function findRefresh(tree) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map(findRefresh).find(Boolean);
  return typeof tree.props?.onRefresh === 'function' ? tree.props.onRefresh : findRefresh(tree.props?.children);
}
(async () => {
  const first = mount(); await flush();
  assert.equal(states[6], false);
  // The fourth action button registers the Explorer context menu.
  await buttons(first.tree)[3].props.onClick(); await flush();
  assert.equal(states[6], true);
  finishInitialDiagnostics(); await flush();
  assert.equal(states[0].context_menu_registered, true, 'Late expensive diagnostics must keep newer shell status in report state');
  assert.equal(diagnostics.getCachedSystemDiagnostics().context_menu_registered, true);
  first.unmount();
  const reopened = mount(); await flush();
  assert.equal(states[6], true, 'Registration must survive reopening settings');
  assert.equal(calls.filter(command => command === 'get_system_diagnostics').length, 1, 'Reuse expensive diagnostics');
  await buttons(reopened.tree)[4].props.onClick(); await flush();
  assert.equal(states[6], false);
  assert.equal(diagnostics.getCachedSystemDiagnostics().context_menu_registered, false);
  assert.equal(states[0].context_menu_registered, false, 'Unregister updates current diagnostics state too');
  registered = true;
  const refresh = findRefresh(reopened.tree);
  assert.equal(typeof refresh, 'function', 'Find diagnostics refresh through layout wrappers');
  refresh(); await flush();
  assert.equal(states[6], true, 'Manual refresh checks external shell changes');
  assert.equal(states[0].context_menu_registered, true);
  assert.equal(diagnostics.getCachedSystemDiagnostics().context_menu_registered, true);
  reopened.unmount();
  registered = false; // Shell status can also change outside this window.
  mount(); await flush();
  assert.equal(states[6], false, 'Reopening must refresh cheap shell status');
  assert.equal(diagnostics.getCachedSystemDiagnostics().context_menu_registered, false);
  deferNextStatus = true;
  const oldStatus = diagnostics.loadContextMenuStatus();
  registered = true;
  assert.equal(await diagnostics.loadContextMenuStatus(), true);
  finishOldStatus();
  assert.equal(await oldStatus, true, 'A late shell query must return the newer known status');
  assert.equal(diagnostics.getCachedSystemDiagnostics().context_menu_registered, true);
  console.log('PASS settings mapping, registration cache/state, delayed diagnostics, manual refresh, reopen and external shell changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
