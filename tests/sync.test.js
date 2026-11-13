// Testes do sync.js junto com o ws.js (fila e ritmo de verdade), com um WebSocket falso.
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/**
 * paginasPorMoeda: páginas que o servidor tem para cada busca.
 * nomesDaBusca(busca): as 2 vendas de cada página, pelo nome ou por { nome, em } (padrão: 2 Blastoise, agora).
 * sync: registros já gravados no store de sync (ex.: a escolha da busca).
 */
function montar(paginasPorMoeda, { nomesDaBusca = () => ['Blastoise', 'Blastoise'], sync: inicial = [] } = {}) {
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
      setTimeout(() => receber({ t: 'market', aba: 'historicoGlobal', seq: j.seq, pagina: j.pagina,
        temMais: j.pagina < paginasPorMoeda - 1,
        linhas: nomesDaBusca(j.busca || '').map(x => typeof x === 'string' ? { nome: x, em: Date.now() } : x).map(({ nome, em }) => ({ id: id--, tipo: 'pokemon', moeda: j.moeda, bruto: 100, em,
          ficha: { id: 1, speciesId: 9, nome, level: 100, nota: 3.6, potencia: 1 } })) }), 5);
    }
  }
  const window = { WebSocket: FakeWS };
  const document = { getElementById: () => null, addEventListener() {} };
  const ctx = vm.createContext({ window, document, location: { href: 'https://pokeidle.io/app' }, URL, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }, console: { warn() {}, info() {}, log() {} } });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'ws.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'motor.js'), 'utf8'), ctx);
  const sync = new Map(inicial.map(r => [r.chave, r]));
  const salvas = [];
  window.PIStore = { lerSync: async c => sync.get(c), gravarSync: async m => { sync.set(m.chave, m); }, salvarVendas: async v => { salvas.push(...v); } };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'sync.js'), 'utf8'), ctx);
  new window.WebSocket('wss://pokeidle.io/');
  const historico = () => enviados.filter(j => j.t === 'market.historicoGlobal').map(j => j.moeda + ':' + (j.busca || '') + ':' + j.pagina);
  return { window, enviados, historico, sync, salvas };
}

const DIA = 24 * 3600e3;
const escolhaSalva = (nome, busca, extra) => Object.assign({ chave: 'escolha|' + nome.toLowerCase(), busca, em: Date.now() }, extra);

test('duas moedas ao mesmo tempo: a fila intercala as páginas (Gemas, Coins, Gemas…), uma por vez', async () => {
  const { window, historico } = montar(3, { sync: [escolhaSalva('Blastoise', 'Blastoise')] });
  const inicio = Date.now();
  await Promise.all(['orb', 'gold'].map(m => window.PISync.sincronizar('Blastoise', m)));
  assert.deepEqual(historico(), ['orb:Blastoise:0', 'gold:Blastoise:0', 'orb:Blastoise:1', 'gold:Blastoise:1', 'orb:Blastoise:2', 'gold:Blastoise:2']);
  // o ritmo continua o mesmo: 6 consultas com 1,5 s entre elas
  assert.ok(Date.now() - inicio >= 5 * 1500 - 50, 'levou ' + (Date.now() - inicio) + ' ms');
});

test('escolha da busca: "Scizor" traz o Furious Scizor, "+scizor" não → usa a família e não repete a página 0', async () => {
  const { window, historico, sync, salvas } = montar(2, { nomesDaBusca: b => (b === '+scizor' ? ['Scizor', 'Scyther'] : ['Furious Scizor', 'Furious Scizor']) });
  await window.PISync.sincronizar('Scizor', 'orb');
  assert.deepEqual(historico(), ['orb:Scizor:0', 'orb:+scizor:0', 'orb:+scizor:1']);
  assert.equal(sync.get('escolha|scizor').busca, '+scizor');
  assert.ok(sync.get('orb|+scizor').maxId > 0, 'o controle de sync fica na busca escolhida');
  assert.ok(salvas.some(v => v.nome === 'Scizor'), 'as vendas da página 0 escolhida foram guardadas');
  assert.ok(salvas.some(v => v.nome === 'Furious Scizor'), 'as da página perdedora também (já vieram)');
  assert.equal(sync.get('escolha|scizor').validade, 7 * DIA);
});

test('escolha da busca: forma base ("+charmander" traria os Charizard) → fica com a busca normal', async () => {
  const { window, historico, sync } = montar(2, { nomesDaBusca: b => (b === '+charmander' ? ['Charizard', 'Charmander'] : ['Charmander', 'Charmander']) });
  await window.PISync.sincronizar('Charmander', 'gold');
  assert.deepEqual(historico(), ['gold:Charmander:0', 'gold:+charmander:0', 'gold:Charmander:1']);
  assert.equal(sync.get('escolha|charmander').busca, 'Charmander');
});

test('escolha da busca: escolha guardada não é refeita; vencida (7 dias) é refeita', async () => {
  const { window, historico } = montar(1, { sync: [escolhaSalva('Scizor', '+scizor')] });
  await window.PISync.sincronizar('Scizor', 'orb');
  assert.deepEqual(historico(), ['orb:+scizor:0']);
  const b = montar(1, { sync: [escolhaSalva('Scizor', '+scizor', { em: Date.now() - 8 * DIA })] });
  await b.window.PISync.sincronizar('Scizor', 'orb');
  assert.deepEqual(b.historico(), ['orb:Scizor:0', 'orb:+scizor:0']);
});

test('escolha da busca: empate com as mesmas datas fica com a busca normal', async () => {
  const { window, sync } = montar(1);
  await window.PISync.sincronizar('Blastoise', 'orb');
  assert.equal(sync.get('escolha|blastoise').busca, 'Blastoise');
});

test('escolha da busca: nenhuma das duas traz a espécie → a que cobre mais tempo, valendo só 1 dia', async () => {
  const agora = Date.now();
  const { window, sync } = montar(1, { nomesDaBusca: b => (b === '+scizor'
    ? [{ nome: 'Scyther', em: agora }, { nome: 'Scyther', em: agora - 5 * DIA }]
    : [{ nome: 'Furious Scizor', em: agora }, { nome: 'Furious Scizor', em: agora - 3600e3 }]) });
  await window.PISync.sincronizar('Scizor', 'orb');
  const e = sync.get('escolha|scizor');
  assert.equal(e.busca, '+scizor');
  assert.equal(e.validade, DIA);
  // depois de 1 dia, compara de novo
  const b = montar(1, { sync: [escolhaSalva('Scizor', '+scizor', { em: agora - 25 * 3600e3, validade: DIA })] });
  await b.window.PISync.sincronizar('Scizor', 'orb');
  assert.deepEqual(b.historico(), ['orb:Scizor:0', 'orb:+scizor:0']);
});

test('escolha da busca: se a comparação falha, as duas moedas falham e a próxima chamada compara de novo', async () => {
  const { window, historico, sync } = montar(1);
  const original = window.PIWs.consultarHistorico;
  window.PIWs.consultarHistorico = async () => { throw new Error('sem conexão com o jogo'); };
  const fim = await Promise.allSettled(['orb', 'gold'].map(m => window.PISync.sincronizar('Blastoise', m)));
  assert.deepEqual(fim.map(f => f.status), ['rejected', 'rejected']);
  assert.equal(sync.get('escolha|blastoise'), undefined);
  window.PIWs.consultarHistorico = original;
  await window.PISync.sincronizar('Blastoise', 'orb');
  assert.deepEqual(historico(), ['orb:Blastoise:0', 'orb:+blastoise:0']);
});

test('escolha da busca: as duas moedas juntas fazem uma comparação só', async () => {
  const { window, historico } = montar(1, { nomesDaBusca: b => (b === '+scizor' ? ['Scizor', 'Scizor'] : ['Furious Scizor', 'Scizor']) });
  await Promise.all(['orb', 'gold'].map(m => window.PISync.sincronizar('Scizor', m)));
  assert.deepEqual(historico(), ['orb:Scizor:0', 'orb:+scizor:0', 'gold:+scizor:0']);
});

test('vaiBuscar: diz se a busca vai consultar o jogo (para a tela mostrar "carregando" só nesse caso)', async () => {
  // sem escolha guardada: vai comparar as duas buscas → consulta
  const a = montar(1);
  assert.equal(await a.window.PISync.vaiBuscar('Scizor', 'orb'), true);
  // escolha guardada e a busca escolhida feita há 2 min → pula (10 min de intervalo)
  const b = montar(1, { sync: [escolhaSalva('Scizor', '+scizor'), { chave: 'orb|+scizor', maxId: 5, em: Date.now() - 2 * 60e3 }] });
  assert.equal(await b.window.PISync.vaiBuscar('Scizor', 'orb'), false);
  assert.equal(await b.window.PISync.vaiBuscar('Scizor', 'gold'), true, 'a outra moeda ainda não foi buscada');
  // a busca da classe usa a própria chave
  const c = montar(1, { sync: [{ chave: 'orb||shiny', maxId: 5, em: Date.now() - 11 * 60e3 }] });
  assert.equal(await c.window.PISync.vaiBuscar('', 'orb', { soShiny: true }), true, 'passou dos 10 min');
  // não consulta nada no jogo para responder
  assert.deepEqual([...a.historico(), ...b.historico(), ...c.historico()], []);
});

test('vaiBuscar: com a Tabela de preços fora do ar, não vai buscar (a tela mostra o cache, sem "carregando")', async () => {
  const { window } = montar(1);
  for (let i = 0; i < 3; i++) window.PIWs._falhaTabela('teste');
  assert.equal(window.PIWs.tabela().fora, true);
  assert.equal(await window.PISync.vaiBuscar('Scizor', 'orb'), false);
  await assert.rejects(window.PISync.sincronizar('Blastoise', 'orb'), /Tabela de preços/);
});

test('busca da classe (só shiny) e busca já com + não passam pela escolha', async () => {
  const { window, historico } = montar(1);
  await window.PISync.sincronizar('', 'orb', null, { soShiny: true });
  await window.PISync.sincronizar('+scizor', 'orb');
  assert.deepEqual(historico(), ['orb::0', 'orb:+scizor:0']);
});
