// Testes do ws.js com um WebSocket falso: ritmo, freio, vitrine de uma espécie e restauração.
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/** Carrega ws.js (e vitrine.js, se pedido) num contexto novo, com um socket falso já aberto. */
function montar({ comVitrine = false, relogio = null } = {}) {
  const ouvintes = [];
  const enviados = [];
  let responder = null; // (msg, receber) => void, para simular o servidor
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 1; }
    addEventListener(t, fn) { if (t === 'message') ouvintes.push(fn); }
    send(d) { const j = JSON.parse(d); enviados.push({ j, em: Date.now() }); if (responder) setTimeout(() => responder(j, receber), 10); }
  }
  const window = { WebSocket: FakeWS };
  const document = { getElementById: () => ({ getClientRects: () => [1] }), addEventListener() {} };
  const logs = { warn: [], info: [] };
  const ctx = vm.createContext({ window, document, location: { href: 'https://pokeidle.io/app' }, URL, setTimeout, clearTimeout, ...(relogio ? { Date: relogio } : {}), console: { warn: (...a) => logs.warn.push(a.join(' ')), info: (...a) => logs.info.push(a.join(' ')), log() {} } });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'ws.js'), 'utf8'), ctx);
  if (comVitrine) {
    vm.runInContext(fs.readFileSync(path.join(SRC, 'motor.js'), 'utf8'), ctx);
    window.PIStore = { vendasPorEspecie: async () => [], vendasPorClasse: async () => [] };
    window.PISync = { sincronizar: async () => ({ pulou: true }) };
    window.PIUi = { fmtPreco: x => String(x) };
    vm.runInContext(fs.readFileSync(path.join(SRC, 'vitrine.js'), 'utf8'), ctx);
  }
  const ws = new window.WebSocket('wss://pokeidle.io/');
  const receber = j => ouvintes.forEach(fn => fn({ data: typeof j === 'string' ? j : JSON.stringify(j) }));
  return { window, ws, enviados, receber, logs, responderCom: fn => { responder = fn; } };
}

const vitrine = (speciesId, n = 2, moeda = 'orb') => ({
  t: 'market', aba: 'vitrine', total: n, pagina: 0, porPagina: 24,
  linhas: Array.from({ length: n }, (_, i) => ({ id: speciesId * 100 + i, tipo: 'pokemon', preco: 500 + i, moeda, pokemonId: 9000 + i, vendedor: 'NAO_GUARDAR',
    ficha: { id: 9000 + i, speciesId, nome: 'Esp' + speciesId, level: 100, nota: 4.5, potencia: 2, shiny: false, tmAoe: false, tmElemental: null, caughtBy: 'NAO_GUARDAR' } })),
});

test('ritmo: 1,5 s entre consultas do histórico', async () => {
  const { window, enviados, responderCom } = montar();
  responderCom((j, receber) => receber({ t: 'market', aba: 'historicoGlobal', seq: j.seq, linhas: [], temMais: false }));
  await window.PIWs.consultarHistorico({ pagina: 0 });
  await window.PIWs.consultarHistorico({ pagina: 1 });
  const gap = enviados[1].em - enviados[0].em;
  assert.ok(gap >= 1490, 'intervalo foi ' + gap + ' ms');
});

test('freio: chat com "devagar" não pausa; erro do servidor com "Devagar" pausa e recusa consultas', async () => {
  const { window, receber } = montar();
  receber('{ "t" : "chat.msg", "msg": "vai mais devagar ai" }');
  assert.equal(window.PIWs.pausado(), false);
  receber({ t: 'erro', msg: 'Devagar! Muitas mensagens.' });
  assert.equal(window.PIWs.pausado(), true);
  await assert.rejects(window.PIWs.consultarHistorico({ pagina: 0 }), /mais devagar/);
});

test('ultimoListarDoJogo: guarda o market.listar do jogo, não o da extensão', async () => {
  const { window, ws, responderCom } = montar();
  ws.send(JSON.stringify({ t: 'market.listar', tipo: 'pokemon', moeda: 'orb', tiposUnidos: true, soShiny: true, pagina: 2 }));
  assert.equal(window.PIWs.ultimoListarDoJogo().pagina, 2);
  responderCom((j, receber) => { if (j.t === 'market.listar') receber(vitrine(212)); });
  await window.PIWs.consultarVitrine({ especieId: 212, moeda: 'orb' });
  const u = window.PIWs.ultimoListarDoJogo();
  assert.equal(u.pagina, 2);
  assert.equal(u.soShiny, true);
});

test('ultimoListarDoJogo: ignora o market.listar de outras extensões', () => {
  const { window, ws } = montar();
  // a interface do jogo manda o filtro completo (tiposUnidos, semOutland, faixas…)
  ws.send(JSON.stringify({ t: 'market.listar', tipo: 'pokemon', moeda: 'orb', busca: '', ordem: 'baratos', criterios: [], elementos: [], tiposUnidos: true, soShiny: true, semOutland: true, pagina: 0, especieId: 0 }));
  // outra extensão que acompanha o Mercado manda uma versão curta, a cada poucos segundos
  ws.send(JSON.stringify({ t: 'market.listar', tipo: 'pokemon', ordem: 'recentes', moeda: '', busca: '', criterios: [], elemento: '' }));
  const u = window.PIWs.ultimoListarDoJogo();
  assert.equal(u.ordem, 'baratos');
  assert.equal(u.soShiny, true);
});

test('consultarVitrine: envia o filtro da espécie e ignora vitrines de outras espécies', async () => {
  const { window, enviados, responderCom } = montar();
  responderCom((j, receber) => { if (j.t === 'market.listar') { receber(vitrine(55)); setTimeout(() => receber(vitrine(212, 3)), 30); } });
  const r = await window.PIWs.consultarVitrine({ especieId: 212, moeda: 'orb' });
  const env = enviados.find(e => e.j.t === 'market.listar').j;
  assert.equal(env.especieId, 212);
  assert.equal(env.moeda, 'orb');
  assert.equal(r.linhas.length, 3);
  assert.ok(r.linhas.every(l => l.ficha.speciesId === 212));
});

test('consultarVitrine: recusa durante a pausa do freio', async () => {
  const { window } = montar();
  window.PIWs._frear('teste');
  await assert.rejects(window.PIWs.consultarVitrine({ especieId: 212, moeda: 'orb' }), /mais devagar/);
});

test('restaurarVitrine: reenvia a mensagem igual, respeitando o intervalo', async () => {
  const { window, enviados, responderCom } = montar();
  responderCom((j, receber) => { if (j.t === 'market.listar' && j.especieId) receber(vitrine(212)); });
  await window.PIWs.consultarVitrine({ especieId: 212, moeda: 'orb' });
  const msg = { t: 'market.listar', tipo: 'pokemon', moeda: 'gold', ordem: 'recentes', pagina: 0 };
  await window.PIWs.restaurarVitrine(msg);
  const ult = enviados[enviados.length - 1];
  assert.deepEqual(ult.j, msg);
  assert.ok(ult.em - enviados[enviados.length - 2].em >= 1490);
});

test('vitrine.js: anunciosDaEspecie devolve os anúncios vistos, com vistoEm e sem nicks', () => {
  const { window, receber } = montar({ comVitrine: true });
  receber(vitrine(212, 2));
  receber(vitrine(55, 1, 'gold'));
  const a = window.PIVitrine.anunciosDaEspecie(212, 'orb');
  assert.equal(a.length, 2);
  assert.ok(a.every(x => typeof x.vistoEm === 'number'));
  assert.ok(!JSON.stringify(a).includes('NAO_GUARDAR'));
  assert.equal(window.PIVitrine.anunciosDaEspecie(212, 'gold').length, 0);
});

test('índice: guarda tipos e poder para a ficha resumida, sem nick', () => {
  const { window, receber } = montar();
  receber({ t: 'estado', estado: { pkMud: [{ id: 42, speciesId: 212, nome: 'Furious Scizor', level: 100, nota: 3.56, quality: 1.768, potencia: 3, shiny: false,
    tmAoe: false, tmElemental: null, ivs: { hp: 20, atk: 20, def: 20, spatk: 15, spdef: 17, spd: 17 }, tipos: ['bug', 'steel'], poder: 131, caughtBy: 'NAO_GUARDAR', apelido: 'X' }] } });
  const p = window.PIWs.pokemon(42);
  assert.deepEqual([...p.tipos], ['bug', 'steel']);
  assert.equal(p.poder, 131);
  assert.equal(p.ivTotal, 109);
  assert.ok(!('caughtBy' in p) && !('apelido' in p));
});

test('freio: a mensagem real do servidor pausa, e o registro é info (não aparece como erro)', () => {
  const { window, receber, logs } = montar();
  receber({ t: 'erro', msg: 'Devagar aí — muitas mensagens.' });
  assert.equal(window.PIWs.pausado(), true);
  assert.equal(logs.warn.length, 0, 'console.warn aparece como erro em chrome://extensions');
  assert.ok(logs.info.some(l => /mais devagar/.test(l)));
});

test('freio: um erro qualquer do servidor (sem "Devagar") não pausa', () => {
  const { window, receber } = montar();
  receber({ t: 'erro', msg: 'Saldo insuficiente.' });
  assert.equal(window.PIWs.pausado(), false);
});

test('ritmo: orçamento menor — com 45 mensagens da conexão no último minuto, a consulta espera', async () => {
  const { window, ws, enviados } = montar();
  for (let i = 0; i < 45; i++) ws.send(JSON.stringify({ t: 'market.itens' }));
  const antes = enviados.length;
  window.PIWs.consultarHistorico({ pagina: 0 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
  assert.equal(enviados.length, antes, 'não podia ter enviado');
  assert.equal(window.PIWs.ritmo().tetoPorMinuto, 12);
});

test('ritmo: mostra o intervalo normal e até quando vale o freio (para o popup)', () => {
  const { window, receber } = montar();
  const antes = window.PIWs.ritmo();
  assert.equal(antes.intervaloNormal, 1500);
  assert.equal(antes.freioAte, 0, 'sem freio');
  receber({ t: 'erro', msg: 'Devagar aí — muitas mensagens.' });
  const depois = window.PIWs.ritmo();
  assert.equal(depois.intervalo, 3000);
  assert.ok(depois.freioAte > Date.now() + 59 * 60000, 'o freio vale por 1 h');
  assert.ok(depois.pausadoAte > Date.now());
});

test('ritmo: quando uma consulta desiste pela conexão ocupada, as que já estavam na fila desistem junto', async () => {
  // relógio 20× mais rápido: os 30 s de espera pela conexão passam em ~1,5 s
  const inicio = Date.now();
  class Rapido extends Date { static now() { return inicio + (Date.now() - inicio) * 20; } }
  const { window, ws } = montar({ relogio: Rapido });
  for (let i = 0; i < 45; i++) ws.send(JSON.stringify({ t: 'market.itens' }));
  const quando = [];
  const pedir = p => window.PIWs.consultarHistorico({ pagina: p }).then(() => 'ok', e => (quando.push(Date.now()), e.message));
  const res = await Promise.all([pedir(0), pedir(1)]);
  assert.ok(res.every(m => /ocupada/.test(m)), JSON.stringify(res));
  assert.ok(quando[1] - quando[0] < 300, 'a segunda esperou mais ' + (quando[1] - quando[0]) + ' ms');
});
