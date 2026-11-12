// Testes do sync.js junto com o ws.js (fila e ritmo de verdade), com um WebSocket falso.
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function montar(paginasPorMoeda) {
  const ouvintes = [];
  const enviados = [];
  const receber = j => ouvintes.forEach(fn => fn({ data: JSON.stringify(j) }));
  let id = 1e6;
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 1; }
    addEventListener(t, fn) { if (t === 'message') ouvintes.push(fn); }
    send(d) {
      const j = JSON.parse(d);
      enviados.push(j);
      // o servidor: cada página traz 2 vendas recentes; temMais até a última página da moeda
      setTimeout(() => receber({ t: 'market', aba: 'historicoGlobal', seq: j.seq, pagina: j.pagina,
        temMais: j.pagina < paginasPorMoeda - 1,
        linhas: [0, 1].map(() => ({ id: id--, tipo: 'pokemon', moeda: j.moeda, bruto: 100, em: Date.now(),
          ficha: { id: 1, speciesId: 9, nome: 'Blastoise', level: 100, nota: 3.6, potencia: 1 } })) }), 5);
    }
  }
  const window = { WebSocket: FakeWS };
  const document = { getElementById: () => null, addEventListener() {} };
  const ctx = vm.createContext({ window, document, location: { href: 'https://pokeidle.io/app' }, URL, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }, console: { warn() {}, info() {}, log() {} } });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'ws.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'motor.js'), 'utf8'), ctx);
  const sync = new Map();
  window.PIStore = { lerSync: async c => sync.get(c), gravarSync: async m => { sync.set(m.chave, m); }, salvarVendas: async () => {} };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'sync.js'), 'utf8'), ctx);
  new window.WebSocket('wss://pokeidle.io/');
  return { window, enviados };
}

test('duas moedas ao mesmo tempo: a fila intercala as páginas (Gemas, Coins, Gemas…), uma por vez', async () => {
  const { window, enviados } = montar(3);
  const inicio = Date.now();
  await Promise.all(['orb', 'gold'].map(m => window.PISync.sincronizar('Blastoise', m)));
  const hist = enviados.filter(j => j.t === 'market.historicoGlobal');
  assert.deepEqual(hist.map(j => j.moeda + j.pagina), ['orb0', 'gold0', 'orb1', 'gold1', 'orb2', 'gold2']);
  // o ritmo continua o mesmo: 6 consultas com 1,5 s entre elas
  assert.ok(Date.now() - inicio >= 5 * 1500 - 50, 'levou ' + (Date.now() - inicio) + ' ms');
});
