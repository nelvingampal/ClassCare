const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { requestHandler } = require('../server.js');

function request(url, method = 'GET') {
  const result = {};
  requestHandler({ url, method }, {
    writeHead(status, headers) { Object.assign(result, { status, headers }); },
    end(body) { result.body = body?.toString() || ''; }
  });
  return result;
}

test('local server always substitutes synthetic config, including Windows case aliases', () => {
  for (const url of ['/js/config.js', '/js/%63onfig.js', ...(process.platform === 'win32' ? ['/js/CONFIG.js'] : [])]) {
    const response = request(url), context = { window: {} };
    assert.equal(response.status, 200);
    vm.runInNewContext(response.body, context);
    assert.equal(context.window.CLASSCARE_CONFIG.firebase.projectId, 'demo-classcare');
    assert.equal(context.window.CLASSCARE_CONFIG.telegram.botToken, '');
    assert.equal(Object.keys(context.window.CLASSCARE_CONFIG.emailjs).length, 0);
  }
});

test('server denies source/config disclosure and malformed Windows paths without crashing', () => {
  for (const url of ['/server.js', '/package.json', '/firebase.json', '/firestore.indexes.json', '/tests/browser.cjs',
    '/docs/STATUS.md', '/.git/config', '/js/%00config.js', '/js/config.js:stream', '/js/%2e%2e%5cpackage.json']) {
    assert.equal(request(url).status, 403, url);
  }
  assert.equal(request('/%ZZ').status, 400);
  assert.equal(request('/', 'POST').status, 405);
  assert.equal(request('/teacher/missing.html').status, 404);
});

test('public routes and media assets remain available; HEAD has no response body', () => {
  for (const url of ['/', '/teacher/', '/student/', '/admin/', '/teacher/scanner', '/js/ui.js', '/sw.js', '/manifest.json']) {
    const response = request(url);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  }
  assert.equal(request('/teacher/scanner.html', 'HEAD').body, '');
  assert.equal(request('/teacher/models/wasm/vision_wasm_internal.wasm').headers['Content-Type'], 'application/wasm');
});
