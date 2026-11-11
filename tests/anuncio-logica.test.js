// Testes da lógica pura do painel de preços na tela "Novo anúncio".
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const M = require(path.join(__dirname, '..', 'src', 'motor.js'));
const L = require(path.join(__dirname, '..', 'src', 'anuncio-logica.js'));

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-11-11T12:00:00Z');

const alvo = { id: 1, speciesId: 212, nome: 'Furious Scizor', level: 100, nota: 4.61, potencia: 2, shiny: false, aoe: false, zmove: false, mega: false };
const an = (id, nota, preco, moeda = 'orb', extra = {}) => ({ id, preco, moeda, alvo: Object.assign({}, alvo, { id: 1000 + id, nota }, extra) });
const venda = (id, extra) => Object.assign({ id, em: AGORA - DIA, moeda: 'orb', preco: 600, speciesId: 212, nome: 'Furious Scizor', level: 100, nota: 4.6, potencia: 2, shiny: false, aoe: false, zmove: false, mega: false }, extra);

test('moedaPainel: shiny sempre abre em Gemas', () => {
  assert.equal(L.moedaPainel({ shiny: true }, 'gold'), 'orb');
  assert.equal(L.moedaPainel({ shiny: false }, 'gold'), 'gold');
  assert.equal(L.moedaPainel({ shiny: false }, 'orb'), 'orb');
});

test('ordenarAVenda: mais parecidos primeiro, só da moeda pedida', () => {
  const r = L.ordenarAVenda(alvo, [an(1, 4.60, 900), an(2, 3.90, 300), an(3, 4.62, 500), an(4, 4.61, 100, 'gold')], 'orb', AGORA);
  assert.deepEqual(r.map(a => a.id), [3, 1, 2]);
});

test('ordenarAVenda: empate de semelhança, o mais barato primeiro', () => {
  const r = L.ordenarAVenda(alvo, [an(1, 4.61, 700), an(2, 4.61, 600)], 'orb', AGORA);
  assert.deepEqual(r.map(a => a.id), [2, 1]);
});

test('ordenarVendidos: descarta venda velha, shiny diferente, outra moeda e outra espécie', () => {
  const vendas = [
    venda(1, { nota: 4.0 }),
    venda(2, { em: AGORA - 31 * DIA }),
    venda(3, { shiny: true }),
    venda(4, { moeda: 'gold' }),
    venda(5, { speciesId: 999, nome: 'Scyther' }),
    venda(6, { nota: 4.6 }),
  ];
  const r = L.ordenarVendidos(alvo, vendas, 'orb', AGORA);
  assert.deepEqual(r.map(v => v.id), [6, 1]);
});

test('posicaoPainel: à direita da caixa quando cabe', () => {
  const caixa = { left: 700, right: 1220, top: 152, bottom: 736, width: 520, height: 584 };
  const folha = { left: 300, right: 1620, top: 36, bottom: 854, width: 1320, height: 818 };
  assert.deepEqual(L.posicaoPainel(caixa, folha, 290), { modo: 'direita', left: 932, top: 116 });
});

test('posicaoPainel: à esquerda quando não cabe à direita', () => {
  const caixa = { left: 320, right: 840, top: 100, bottom: 684, width: 520, height: 584 };
  const folha = { left: 0, right: 900, top: 0, bottom: 800, width: 900, height: 800 };
  const p = L.posicaoPainel(caixa, folha, 290);
  assert.equal(p.modo, 'esquerda');
  assert.ok(p.left >= 0 && p.left + 290 + 12 <= 320, 'não pode encostar na caixa');
});

test('posicaoPainel: embaixo quando não cabe de nenhum lado, sem cobrir a caixa', () => {
  const caixa = { left: 50, right: 570, top: 100, bottom: 684, width: 520, height: 584 };
  const folha = { left: 0, right: 620, top: 0, bottom: 900, width: 620, height: 900 };
  const p = L.posicaoPainel(caixa, folha, 290);
  assert.equal(p.modo, 'abaixo');
  assert.ok(p.top >= caixa.bottom - folha.top, 'tem de começar abaixo da caixa');
});

test('valorUsar: arredonda como a vitrine e respeita o mínimo do jogo', () => {
  assert.equal(L.valorUsar(129400000), 130000000);
  assert.equal(L.valorUsar(640.4), 640);
  assert.equal(L.valorUsar(1), 2);
});

test('motor continua o mesmo: classeDe e liquidoVendedor intactos', () => {
  assert.equal(M.classeDe({ shiny: true, potencia: 5 }), 'S');
  assert.equal(Math.round(M.liquidoVendedor(10000, 'orb')), 9110);
});

test('formatarValor: líquido com uma casa decimal, como o "VOCÊ RECEBE" do jogo', () => {
  assert.equal(M.formatarValor(42500000, 'gold'), '42,5 M');
  assert.equal(M.formatarValor(43000000, 'gold'), '43 M');
  assert.equal(M.formatarValor(1250000000, 'gold'), '1,25 B');
  assert.equal(M.formatarValor(85000, 'gold'), '85 k');
  assert.equal(M.formatarValor(9110, 'orb'), '9.110');
  assert.equal(M.formatarValor(556.8, 'orb'), '556');
});

test('faixaNota: rótulos da Pokepédia; no limite fica na faixa de baixo', () => {
  assert.equal(L.faixaNota(4.61), 'Bom');
  assert.equal(L.faixaNota(3.704), 'Razoável');
  assert.equal(L.faixaNota(4.0), 'Razoável');
  assert.equal(L.faixaNota(0.5), 'Extremamente Fraco');
  assert.equal(L.faixaNota(9.5), 'Divino');
  assert.equal(L.faixaNota(NaN), '');
});

test('posicaoPainel: preferência pela esquerda (ficha do Pokémon)', () => {
  const caixa = { left: 700, right: 1220, top: 152, bottom: 736, width: 520, height: 584 };
  const folha = { left: 300, right: 1620, top: 36, bottom: 854, width: 1320, height: 818 };
  assert.deepEqual(L.posicaoPainel(caixa, folha, 290, 12, 'esquerda'), { modo: 'esquerda', left: 98, top: 116 });
});

test('nivelSelo: Potência usa a mesma escala do jogo (P1 → 1 … P5 → 5)', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(p => L.nivelSelo('potencia', p)), [1, 2, 3, 4, 5]);
  assert.equal(L.nivelSelo('potencia', 0), 1);
});

test('nivelSelo: Qualidade pelas faixas da Pokepédia (Incomum 2, Rara 3, Épica 4, Lendária 5)', () => {
  assert.equal(L.nivelSelo('qualidade', 0.95), 1);
  assert.equal(L.nivelSelo('qualidade', 1.05), 1);
  assert.equal(L.nivelSelo('qualidade', 1.188), 2);
  assert.equal(L.nivelSelo('qualidade', 1.42), 3);
  assert.equal(L.nivelSelo('qualidade', 1.525), 4);
  assert.equal(L.nivelSelo('qualidade', 1.6), 4);
  assert.equal(L.nivelSelo('qualidade', 1.768), 5);
  assert.equal(L.nivelSelo('qualidade', 1.8), 5);
});

test('nivelSelo: IV somado bate com as fichas vistas (109/120/130 verde, 138/147/162 azul)', () => {
  assert.deepEqual([109, 120, 130].map(v => L.nivelSelo('iv', v)), [2, 2, 2]);
  assert.deepEqual([138, 147, 162].map(v => L.nivelSelo('iv', v)), [3, 3, 3]);
  assert.equal(L.nivelSelo('iv', 80), 1);
  assert.equal(L.nivelSelo('iv', 192), 5);
});

test('nivelSelo: valor ausente fica no nível 1 (cinza)', () => {
  assert.equal(L.nivelSelo('qualidade', NaN), 1);
  assert.equal(L.nivelSelo('iv', undefined), 1);
});

test('indiceFaixaNota: índice 0–9 das 10 faixas (mesma regra de faixaNota)', () => {
  assert.equal(L.indiceFaixaNota(4.61), 4);
  assert.equal(L.indiceFaixaNota(3.688), 3);
  assert.equal(L.indiceFaixaNota(4.0), 3);
  assert.equal(L.indiceFaixaNota(NaN), -1);
});
