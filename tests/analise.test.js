// Testes da lógica da janela "Precificar" (src/analise.js).
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const M = require(path.join(__dirname, '..', 'src', 'motor.js'));
const A = require(path.join(__dirname, '..', 'src', 'analise.js'));

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-11-11T12:00:00Z');
const alvo = { id: 1, speciesId: 9, nome: 'Blastoise', level: 395, nota: 3.598, potencia: 1, shiny: false, aoe: false, zmove: false, mega: false };
let seq = 0;
const venda = extra => Object.assign({ id: ++seq, em: AGORA - DIA, moeda: 'orb', preco: 50, speciesId: 9, nome: 'Blastoise', level: 395, nota: 3.6,
  potencia: 1, shiny: false, aoe: false, zmove: false, mega: false, refino: 0 }, extra);

// Como num Blastoise real (11/11/2026): um grupo barato (~20–27) e um caro (~100–120), nada no meio
function bimodal() {
  const v = [];
  for (let i = 0; i < 10; i++) v.push(venda({ preco: 20 + (i % 8), em: AGORA - (i + 1) * 3600e3, level: 300 + i * 5 }));
  for (let i = 0; i < 10; i++) v.push(venda({ preco: 100 + (i % 3) * 10, em: AGORA - (i + 1) * 3700e3, level: 500 + i * 5, aoe: i < 7, refino: 3 }));
  return v;
}

test('pontosVendas: só a espécie, a moeda, o status shiny e os 30 dias; peso de 0 a 1, o mais parecido = 1', () => {
  const vendas = [venda({ nota: 3.598 }), venda({ nota: 3.9 }), venda({ moeda: 'gold' }), venda({ shiny: true }), venda({ em: AGORA - 31 * DIA }), venda({ speciesId: 8, nome: 'Wartortle' })];
  const p = A.pontosVendas(alvo, vendas, 'orb', AGORA);
  assert.equal(p.length, 2);
  assert.equal(Math.max(...p.map(x => x.peso)), 1);
  assert.ok(p.every(x => x.peso > 0 && x.peso <= 1));
  assert.ok(p[0].peso >= p[1].peso, 'mais parecidos primeiro');
});

test('pontosVendas: traz IV somado e Qualidade para a tabela das vendas que mais pesaram', () => {
  const p = A.pontosVendas(alvo, [venda({ ivTotal: 142, quality: 1.596, potencia: 4 })], 'orb', AGORA);
  assert.equal(p[0].ivTotal, 142);
  assert.equal(p[0].quality, 1.596);
  assert.equal(p[0].potencia, 4);
});

test('posicaoNaBarra: escala log entre o menor e o maior preço, de 0 a 1', () => {
  const esc = A.escalaBarra([10, 1000]);
  assert.equal(esc(10), 0);
  assert.equal(esc(1000), 1);
  assert.ok(Math.abs(esc(100) - 0.5) < 1e-9);
  assert.equal(esc(5), 0, 'abaixo do mínimo fica na ponta');
  assert.equal(A.escalaBarra([50, 50])(50), 0.5, 'um preço só fica no meio');
});

test('detectarGrupos: acha os dois grupos do Blastoise e o que os diferencia', () => {
  const p = A.pontosVendas(alvo, bimodal(), 'orb', AGORA);
  const g = A.detectarGrupos(p);
  assert.ok(g, 'tinha de achar dois grupos');
  assert.ok(g.baixo.max <= 27 && g.baixo.min >= 20);
  assert.ok(g.alto.min >= 100 && g.alto.max <= 120);
  assert.ok(g.alto.pctAoe > g.baixo.pctAoe);
  assert.ok(g.alto.nivelMedio > g.baixo.nivelMedio);
  assert.ok(g.alto.refinoMedio > g.baixo.refinoMedio);
  assert.ok(Math.abs(g.baixo.fracao + g.alto.fracao - 1) < 1e-9);
  assert.equal(A.noVao(80, g), true);
  assert.equal(A.noVao(110, g), false);
});

test('detectarGrupos: preços próximos (um grupo só) não viram dois grupos', () => {
  const v = [];
  for (let i = 0; i < 20; i++) v.push(venda({ preco: 45 + i * 2 }));
  assert.equal(A.detectarGrupos(A.pontosVendas(alvo, v, 'orb', AGORA)), null);
});

test('detectarGrupos: uma venda isolada não forma grupo (cada lado precisa de 20% do peso)', () => {
  const v = [];
  for (let i = 0; i < 19; i++) v.push(venda({ preco: 50 + i }));
  v.push(venda({ preco: 900 }));
  assert.equal(A.detectarGrupos(A.pontosVendas(alvo, v, 'orb', AGORA)), null);
});

test('confiancaEspecie: refaz a conta para cada venda recente usando só as anteriores', () => {
  const v = [];
  for (let i = 0; i < 40; i++) v.push(venda({ preco: 100 + (i % 5), em: AGORA - (40 - i) * 3600e3 }));
  const c = A.confiancaEspecie(v, 'orb', AGORA);
  assert.ok(c.total >= 10);
  assert.equal(c.acertos, c.total, 'preços estáveis: acerta todas');
  assert.equal(c.taxa, 1);
});

test('confiancaEspecie: preços em dois grupos acertam pouco', () => {
  const v = [];
  for (let i = 0; i < 40; i++) v.push(venda({ preco: i % 2 ? 20 : 110, em: AGORA - (40 - i) * 3600e3 }));
  const c = A.confiancaEspecie(v, 'orb', AGORA);
  assert.ok(c.taxa < 0.5, 'taxa foi ' + c.taxa);
});

test('confiancaEspecie: menos de 10 vendas avaliáveis → null', () => {
  const v = [];
  for (let i = 0; i < 6; i++) v.push(venda({ em: AGORA - i * 3600e3 }));
  assert.equal(A.confiancaEspecie(v, 'orb', AGORA), null);
});

test('motor intacto', () => {
  assert.equal(typeof M.precificar, 'function');
});
