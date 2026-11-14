// Testes da src/ponte.js (mundo ISOLATED) no plano B do popup: o pedido chega pelo chrome.storage e a
// resposta volta pelo chrome.storage. Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'ponte.js'), 'utf8');

/** Carrega a ponte com um chrome.* falso; o "MAIN world" responde a todo pedido com {ok: pedido}. */
function montar({ visivel = true } = {}) {
  const ouvintesStorage = [];
  const ouvintesJanela = [];
  const gravado = {};
  const chrome = {
    storage: {
      local: {
        get: (k, cb) => cb({}),
        set: o => Object.assign(gravado, o),
        remove: () => {},
      },
      onChanged: { addListener: fn => ouvintesStorage.push(fn) },
    },
    runtime: { onMessage: { addListener() {} } },
  };
  const window = {
    addEventListener: (t, fn) => { if (t === 'message') ouvintesJanela.push(fn); },
    // o MAIN world (config.js) responde ao pedido que a ponte manda por postMessage
    postMessage: msg => {
      if (msg.tipo !== 'pedido') return;
      setTimeout(() => ouvintesJanela.forEach(fn => fn({ source: window, data: { fonte: 'pism-main', tipo: 'resposta', id: msg.id, dados: { ok: msg.pedido } } })), 5);
    },
  };
  const document = { visibilityState: visivel ? 'visible' : 'hidden' };
  vm.runInContext(SRC, vm.createContext({ chrome, window, document, location: { origin: 'https://pokeidle.io' }, setTimeout, Date }));
  const pedir = (pedido, em = Date.now()) => ouvintesStorage.forEach(fn => fn({ 'pism-pedido': { newValue: { id: 'p1', pedido, em } } }, 'local'));
  return { gravado, pedir };
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

test('ponte: a aba visível responde ao pedido do popup pelo storage', async () => {
  const { gravado, pedir } = montar();
  pedir('estado');
  await esperar(30);
  assert.deepEqual(gravado['pism-resposta'] && gravado['pism-resposta'].dados, { ok: 'estado' });
  assert.equal(gravado['pism-resposta'].id, 'p1');
});

test('ponte: aba em segundo plano não responde (no Chrome, o popup aberto noutra aba diz "abra a aba do jogo")', async () => {
  const { gravado, pedir } = montar({ visivel: false });
  pedir('estado');
  await esperar(30);
  assert.equal(gravado['pism-resposta'], undefined);
});

test('ponte: pedido com mais de 5 s é ignorado', async () => {
  const { gravado, pedir } = montar();
  pedir('estado', Date.now() - 6000);
  await esperar(30);
  assert.equal(gravado['pism-resposta'], undefined);
});
