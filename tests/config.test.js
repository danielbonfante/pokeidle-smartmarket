// Testes da configuração do popup (src/config.js, no MAIN world) e da ponte com o popup.
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const C = require(path.join(SRC, 'config.js'));

/** Carrega config.js num contexto com um window falso que entrega postMessage para os ouvintes. */
function montar(extra) {
  const ouvintes = [];
  const enviados = []; // o que o MAIN mandou para a ponte
  const window = {
    addEventListener: (t, fn) => { if (t === 'message') ouvintes.push(fn); },
    postMessage: (data) => { enviados.push(data); },
    location: { origin: 'https://pokeidle.io' },
  };
  Object.assign(window, extra || {});
  const ctx = vm.createContext({ window, setTimeout, clearTimeout, console });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'config.js'), 'utf8'), ctx);
  // mensagem vinda da ponte (mundo ISOLATED): mesmo window como origem
  const daPonte = data => ouvintes.forEach(fn => fn({ source: window, data }));
  return { window, enviados, daPonte };
}

test('mesclar: tudo ligado por padrão; só aceita as chaves conhecidas e valores válidos', () => {
  const padrao = { quadro: true, selos: true, painel: true, dinheiro: 'usd', cotacaoBrl: 5.5 };
  assert.deepEqual(C.mesclar(undefined), padrao);
  assert.deepEqual(C.mesclar({ selos: false, painel: 'nao', outra: false }), Object.assign({}, padrao, { selos: false }));
  // dinheiro: só os três modos; cotação do real entre R$ 1 e R$ 20, com 2 casas
  assert.equal(C.mesclar({ dinheiro: 'usd-brl' }).dinheiro, 'usd-brl');
  assert.equal(C.mesclar({ dinheiro: 'euro' }).dinheiro, 'usd');
  assert.equal(C.mesclar({ cotacaoBrl: '5.437' }).cotacaoBrl, 5.44);
  assert.equal(C.mesclar({ cotacaoBrl: 0.5 }).cotacaoBrl, 5.5);
  assert.equal(C.mesclar({ cotacaoBrl: '' }).cotacaoBrl, 5.5);
  assert.equal(C.mesclar({ cotacaoBrl: true }).cotacaoBrl, 5.5);
});

test('MAIN pede a configuração ao carregar e aplica a que a ponte manda', () => {
  const { window, enviados, daPonte } = montar();
  assert.ok(enviados.some(d => d.fonte === 'pism-main' && d.tipo === 'pedir-config'));
  assert.equal(window.PIConfig.ligado('selos'), true);
  const mudancas = [];
  window.PIConfig.aoMudar(c => mudancas.push(c));
  daPonte({ fonte: 'pism-ponte', tipo: 'config', config: { selos: false } });
  assert.equal(window.PIConfig.ligado('selos'), false);
  assert.equal(window.PIConfig.ligado('quadro'), true);
  assert.equal(mudancas.length, 1);
  daPonte({ fonte: 'pism-ponte', tipo: 'config', config: { selos: false } });
  assert.equal(mudancas.length, 1, 'mesma configuração não avisa de novo');
});

test('ignora mensagens que não vêm da ponte', () => {
  const { window, daPonte } = montar();
  daPonte({ fonte: 'outra-coisa', tipo: 'config', config: { quadro: false } });
  daPonte({ tipo: 'config', config: { quadro: false } });
  assert.equal(window.PIConfig.ligado('quadro'), true);
});

test('pedido "estado": devolve cache, freio e conexão sem nicks', async () => {
  const { enviados, daPonte } = montar({
    PIStore: { resumo: async () => ({ vendas: 12, especies: 3, maisAntiga: 1, maisNova: 2 }) },
    PIWs: { conectado: () => true, ritmo: () => ({ intervalo: 3000, intervaloNormal: 1500, pausadoAte: 0, freioAte: 99, tetoPorMinuto: 12, orcamentoConexao: 45, enviosConexaoUltimoMinuto: 20 }) },
  });
  daPonte({ fonte: 'pism-ponte', tipo: 'pedido', id: 7, pedido: 'estado' });
  await new Promise(r => setTimeout(r, 10));
  const resp = enviados.find(d => d.tipo === 'resposta' && d.id === 7);
  assert.ok(resp, 'tinha de responder');
  assert.equal(resp.dados.cache.vendas, 12);
  assert.equal(resp.dados.conectado, true);
  assert.equal(resp.dados.ritmo.intervalo, 3000);
});

test('pedido "limpar-cache": limpa e devolve o estado novo; pedido desconhecido devolve erro', async () => {
  let limpou = false;
  const { enviados, daPonte } = montar({
    PIStore: { limpar: async () => { limpou = true; }, resumo: async () => ({ vendas: limpou ? 0 : 5, especies: 0 }) },
    PIWs: { conectado: () => false, ritmo: () => ({}) },
  });
  daPonte({ fonte: 'pism-ponte', tipo: 'pedido', id: 1, pedido: 'limpar-cache' });
  daPonte({ fonte: 'pism-ponte', tipo: 'pedido', id: 2, pedido: 'apagar-tudo' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(limpou, true);
  assert.equal(enviados.find(d => d.id === 1).dados.cache.vendas, 0);
  assert.match(enviados.find(d => d.id === 2).dados.erro, /desconhecido/);
});
