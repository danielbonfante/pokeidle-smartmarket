// Testes do store.js (cache em IndexedDB) com um IndexedDB falso, só com o que o store usa.
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DIA = 24 * 3600e3;
const depois = fn => setImmediate(fn); // setTimeout(0) no Windows leva ~15 ms por volta

/** IndexedDB falso: open, lojas com keyPath e índices, get/getAll/put/count/clear e cursor com delete. */
function indexedDBFalso() {
  const bancos = new Map();
  function criarBanco() {
    const lojas = new Map();
    return {
      lojas,
      createObjectStore(nome, { keyPath }) {
        const loja = { keyPath, dados: new Map(), indices: new Map() };
        lojas.set(nome, loja);
        return { createIndex: (n, campo) => loja.indices.set(n, campo) };
      },
      transaction(nomes) {
        const t = {};
        let pendentes = 0, fechou = false;
        const conferir = () => depois(() => { if (!pendentes && !fechou) { fechou = true; if (t.oncomplete) t.oncomplete(); } });
        const pedido = fn => {
          const r = {};
          pendentes++;
          depois(() => { r.result = fn(r); pendentes--; if (r.onsuccess) r.onsuccess(); conferir(); });
          return r;
        };
        const copia = v => (v === undefined ? v : structuredClone(v));
        t.objectStore = nome => {
          const l = lojas.get(nome);
          if (![].concat(nomes).includes(nome)) throw new Error('loja fora da transação: ' + nome);
          return {
            put: v => pedido(() => { l.dados.set(v[l.keyPath], copia(v)); }),
            get: k => pedido(() => copia(l.dados.get(k))),
            getAll: () => pedido(() => [...l.dados.values()].map(copia)),
            count: () => pedido(() => l.dados.size),
            clear: () => pedido(() => { l.dados.clear(); }),
            index: n => ({ getAll: k => pedido(() => [...l.dados.values()].filter(v => v[l.indices.get(n)] === k).map(copia)) }),
            openCursor: () => {
              const chaves = [...l.dados.keys()];
              let i = 0;
              const req = {};
              const passo = () => pedido(() => {
                const k = chaves[i];
                const cursor = i < chaves.length ? {
                  value: copia(l.dados.get(k)),
                  delete: () => { l.dados.delete(k); },
                  continue: () => { i++; passo(); },
                } : null;
                req.result = cursor;
                if (req.onsuccess) depois(() => req.onsuccess());
                return cursor;
              });
              passo();
              return req;
            },
          };
        };
        conferir();
        return t;
      },
    };
  }
  return {
    bancos,
    open(nome) {
      const req = {};
      depois(() => {
        let db = bancos.get(nome);
        const novo = !db;
        if (novo) { db = criarBanco(); bancos.set(nome, db); }
        req.result = db;
        if (novo && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
}

/** Carrega o store.js com o IndexedDB falso; os timers do store ficam guardados para o teste disparar. */
function montar() {
  const timers = [];
  const window = { PIMotor: { classeDe: () => '' } };
  const ctx = vm.createContext({ window, indexedDB: indexedDBFalso(), Date, structuredClone, console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'store.js'), 'utf8'), ctx);
  return { S: window.PIStore, timers, window };
}

const venda = (id, idadeDias, agora) => ({ id, em: agora - idadeDias * DIA, speciesId: 9, nome: 'Blastoise', moeda: 'orb', preco: 50 });

test('podar apaga só as vendas com mais de 30 dias e guarda quando podou', async () => {
  const { S } = montar();
  const agora = Date.now();
  await S.salvarVendas([venda(1, 1, agora), venda(2, 29.9, agora), venda(3, 30.1, agora), venda(4, 45, agora), { id: 5, speciesId: 9, nome: 'Blastoise' }]);
  await S.gravarSync({ chave: 'orb|blastoise', maxId: 4, em: agora });
  const apagadas = await S.podar(agora);
  assert.equal(apagadas, 3, 'mais de 30 dias e sem data');
  const restam = (await S.vendasPorEspecie(9)).map(v => v.id).sort();
  assert.deepEqual(restam, [1, 2]);
  assert.equal((await S.lerSync('orb|blastoise')).maxId, 4, 'o controle de sync continua: as antigas não são baixadas de novo');
  assert.equal((await S.lerSync('poda')).em, agora);
});

test('podarSeVencido: no máximo uma vez por dia', async () => {
  const { S } = montar();
  const agora = Date.now();
  await S.salvarVendas([venda(1, 40, agora)]);
  assert.equal(await S.podarSeVencido(agora), 1);
  await S.salvarVendas([venda(2, 40, agora)]);
  assert.equal(await S.podarSeVencido(agora + 23 * 3600e3), null, 'menos de 1 dia: não poda');
  assert.equal(await S.contar(), 1);
  assert.equal(await S.podarSeVencido(agora + DIA + 1), 1);
  assert.equal(await S.contar(), 0);
});

test('podarSeVencido: com a Tabela de preços fora do ar, não poda (as vendas guardadas são tudo o que sobra)', async () => {
  const { S, window } = montar();
  const agora = Date.now();
  await S.salvarVendas([venda(1, 40, agora)]);
  window.PIWs = { tabela: () => ({ fora: true }) };
  assert.equal(await S.podarSeVencido(agora), null);
  assert.equal(await S.contar(), 1);
  window.PIWs = { tabela: () => ({ fora: false }) };
  assert.equal(await S.podarSeVencido(agora), 1, 'a Tabela voltou: poda de novo');
});

test('a poda roda sozinha um pouco depois de abrir o jogo e volta a conferir a cada hora', async () => {
  const { S, timers } = montar();
  await S.salvarVendas([venda(1, 40, Date.now()), venda(2, 2, Date.now())]);
  assert.equal(timers.length, 1);
  assert.ok(timers[0].ms >= 10e3, 'espera a primeira ficha: ' + timers[0].ms + ' ms');
  timers[0].fn();
  for (let i = 0; i < 200 && timers.length < 2; i++) await new Promise(r => setImmediate(r));
  assert.equal(await S.contar(), 1);
  assert.equal(timers.length, 2, "agendou a próxima conferência: " + JSON.stringify(timers.map(x => x.ms)));
  assert.equal(timers[1].ms, 3600e3);
});
