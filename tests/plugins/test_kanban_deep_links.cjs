// Run with NODE_PATH pointing to isolated react + react-test-renderer installs.
// Executes the shipped IIFE and real React hooks; child visuals are shallow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const {create, act} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const bundle = process.env.KANBAN_BUNDLE || path.resolve(__dirname, '../../plugins/kanban/dashboard/dist/index.js');

async function mount(query, stored = 'remembered', boards = ['default', 'alpha', 'beta']) {
  let Page, renderer;
  const requests = [], listeners = {}, functions = {};
  const location = new URL('https://example.invalid/prefix/plugins/kanban' + query);
  const history = {state: {idx: 4, key: 'router-key', usr: {keep: true}}, calls: []};
  for (const method of ['pushState', 'replaceState']) history[method] = (state, _, url) => {
    history.calls.push(method); history.state = state;
    const next = new URL(url, location); location.href = next.href;
  };
  const SDK = {
    React: {...React, createElement(type, props, ...children) {
      if (typeof type === 'function') { functions[type.name] = type; type = type.name; }
      return React.createElement(type, props, ...children);
    }},
    hooks: React,
    components: Object.fromEntries(['Card', 'CardContent', 'Badge', 'Button', 'Input', 'Label', 'Select', 'SelectOption'].map(x => [x, x])),
    utils: {cn: (...args) => args.filter(Boolean).join(' '), timeAgo: () => ''},
    buildWsUrl: async () => 'wss://example.invalid/events',
    fetchJSON: async url => {
      requests.push(url);
      const u = new URL(url, location);
      if (u.pathname.endsWith('/boards')) return {boards: boards.map(slug => ({slug})), current: 'default'};
      if (u.pathname.endsWith('/config')) return {};
      if (u.pathname.endsWith('/board')) {
        if (!boards.includes(u.searchParams.get('board'))) throw new Error('404 board not found');
        return {columns: [{name: 'ready', tasks: []}], tenants: [], assignees: [], latest_event_id: 0};
      }
      throw new Error('404 exact task not found');
    },
  };
  const window = {location, history, __HERMES_PLUGIN_SDK__: SDK,
    __HERMES_PLUGINS__: {register: (_, component) => { Page = component; }},
    localStorage: {getItem: () => stored, setItem: (_, value) => {stored = value;}, removeItem: () => {stored = null;}},
    addEventListener: (event, fn) => {listeners[event] = fn;},
    removeEventListener: (event, fn) => {if (listeners[event] === fn) delete listeners[event];},
  };
  vm.runInNewContext(fs.readFileSync(bundle, 'utf8'), {window, URL, URLSearchParams, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    WebSocket: class {close() {}}, document: {addEventListener() {}, removeEventListener() {}}});
  await act(async () => {renderer = create(React.createElement(Page));});
  return {renderer, requests, history, location, functions,
    props: name => renderer.root.findByType(name).props,
    change: async fn => {await act(async () => {fn();});},
    pop: async query => {await act(async () => {location.search = query; listeners.popstate();});},
    close: async () => {await act(async () => renderer.unmount());},
  };
}

test('exact URL board overrides storage and opens requested drawer', async () => {
  const m = await mount('?board=alpha&task=t_exact');
  try {
    assert.equal(m.props('BoardSwitcher').board, 'alpha');
    assert.equal(m.props('TaskDrawer').taskId, 't_exact');
    assert.equal(m.props('TaskDrawer').boardSlug, 'alpha');
    assert.ok(m.requests.filter(u => /\/(board|config)\?/.test(u)).every(u => u.includes('board=alpha')));
  } finally {await m.close();}
});

test('open, relation navigation, close, and switch preserve router metadata', async () => {
  const m = await mount('?board=alpha&other=keep#fragment');
  try {
    await m.change(() => m.props('AttentionStrip').onOpen('t_first'));
    assert.equal(m.location.searchParams.get('task'), 't_first');
    assert.equal(m.history.state.idx, 5);
    await m.change(() => m.props('TaskDrawer').onOpenTask('t_related'));
    assert.equal(m.props('TaskDrawer').taskId, 't_related');
    assert.equal(m.history.state.idx, 6);
    await m.change(() => m.props('TaskDrawer').onClose());
    assert.equal(m.location.searchParams.has('task'), false);
    assert.equal(m.history.state.idx, 6);
    await m.change(() => m.props('BoardSwitcher').onSwitch('beta'));
    assert.equal(m.location.searchParams.get('board'), 'beta');
    assert.equal(m.location.pathname, '/prefix/plugins/kanban');
    assert.equal(m.location.hash, '#fragment');
    assert.equal(m.location.searchParams.get('other'), 'keep');
    assert.equal(m.history.state.key, 'router-key');
    assert.deepEqual(m.history.state.usr, {keep: true});
  } finally {await m.close();}
});

test('back/forward route changes switch exact board and drawer', async () => {
  const m = await mount('?board=alpha&task=t_first');
  try {
    await m.pop('?board=beta&task=t_second');
    assert.equal(m.props('TaskDrawer').boardSlug, 'beta');
    assert.equal(m.props('TaskDrawer').taskId, 't_second');
    await m.pop('?board=alpha');
    assert.equal(m.renderer.root.findAllByType('TaskDrawer').length, 0);
  } finally {await m.close();}
});

test('missing explicit board must not fall back to default with same task ID', async () => {
  const m = await mount('?board=missing&task=t_exact');
  try {
    assert.equal(m.requests.some(u => u.includes('board=default')), false);
    assert.equal(m.renderer.root.findAllByType('TaskDrawer').length, 0);
    assert.match(JSON.stringify(m.renderer.toJSON()), /404 board not found/);
  } finally {await m.close();}
});

test('ordinary remembered-board fallback remains available without a link', async () => {
  const m = await mount('', 'missing');
  try {
    assert.equal(m.props('BoardSwitcher').board, 'default');
    assert.equal(m.renderer.root.findAllByType('TaskDrawer').length, 0);
  } finally {await m.close();}
});

test('task-only link on a missing stored board cannot redirect to default', async () => {
  const m = await mount('?task=t_exact', 'missing');
  try {
    assert.equal(m.requests.some(u => u.includes('board=default')), false);
    assert.match(JSON.stringify(m.renderer.toJSON()), /404 board not found/);
  } finally {await m.close();}
});

test('task-only links keep stored board; missing task stays exact and is encoded', async () => {
  const m = await mount('?task=t_exact%2Fchild', 'alpha');
  let drawer;
  try {
    const props = m.props('TaskDrawer');
    assert.equal(props.boardSlug, 'alpha');
    assert.equal(props.taskId, 't_exact/child');
    await act(async () => {drawer = create(React.createElement(m.functions.TaskDrawer, props));});
    assert.ok(m.requests.includes('/api/plugins/kanban/tasks/t_exact%2Fchild?board=alpha'));
    assert.match(JSON.stringify(drawer.toJSON()), /404 exact task not found/);
  } finally {
    if (drawer) await act(async () => drawer.unmount());
    await m.close();
  }
});
