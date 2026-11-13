// Testes das contas de Gemas em dólar e real (src/dinheiro.js).
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const D = require(path.join(__dirname, '..', 'src', 'dinheiro.js'));

test('texto: cotação de compra (vitrine) e de saque (quem vende), em dólar e real', () => {
  assert.equal(D.texto(150, 'compra', 'ambos', { modo: 'usd' }), 'US$ 1,50');
  assert.equal(D.texto(130, 'saque', 'ambos', { modo: 'usd' }), 'US$ 1,17');
  assert.equal(D.texto(130, 'saque', 'ambos', { modo: 'usd-brl', brl: 5.5 }), 'US$ 1,17 · R$ 6,44');
  assert.equal(D.texto(130, 'saque', 'usd', { modo: 'usd-brl', brl: 5.5 }), '1,17');
  assert.equal(D.texto(130, 'saque', 'brl', { modo: 'usd-brl', brl: 5.5 }), '6,44');
  assert.equal(D.texto(130, 'saque', 'brl', { modo: 'usd' }), '', 'sem o real escolhido, a parte em real fica vazia');
  assert.equal(D.texto(300000, 'compra', 'ambos', { modo: 'usd' }), 'US$ 3.000');
});

test('texto: modo "nada", valor vazio ou zero → texto vazio; centavo quebrado → "< 0,01"', () => {
  assert.equal(D.texto(150, 'compra', 'ambos', { modo: 'nada' }), '');
  assert.equal(D.texto(0, 'compra', 'ambos', { modo: 'usd' }), '');
  assert.equal(D.texto(NaN, 'compra', 'ambos', { modo: 'usd' }), '');
  assert.equal(D.texto(1, 'saque', 'usd', { modo: 'usd' }), '< 0,01'); // 1 Gema = US$ 0,009
});

test('texto: sem centavos a partir de US$ 100 (74 mil Gemas = US$ 740 · R$ 4.070)', () => {
  assert.equal(D.texto(74000, 'compra', 'ambos', { modo: 'usd-brl', brl: 5.5 }), 'US$ 740 · R$ 4.070');
  assert.equal(D.texto(9999, 'compra', 'usd', { modo: 'usd' }), '99,99');
});

test('texto: Gemas quebradas (líquido 21,75) contam como o jogo paga, 21', () => {
  assert.equal(D.texto(21.75, 'saque', 'usd', { modo: 'usd' }), '0,19');
});

test('texto: usa a cotação lida no jogo quando houver', () => {
  assert.equal(D.texto(100, 'compra', 'usd', { modo: 'usd', cotacao: { compra: 0.012, saque: 0.009 } }), '1,20');
});

test('lerCotacao e tipoDaTela: as telas de depósito e saque do RMT', () => {
  assert.equal(D.lerCotacao('0.0100 USDT por Gema'), 0.01);
  assert.equal(D.lerCotacao('0,0090 USDT por Gema'), 0.009);
  assert.equal(D.lerCotacao('Você recebe 1000'), null);
  assert.equal(D.lerCotacao('50.0000 USDT por Gema'), null, 'fora do razoável');
  assert.equal(D.tipoDaTela('DEPÓSITO — COMPRAR GEMAS'), 'compra');
  assert.equal(D.tipoDaTela('SAQUE — GEMAS PARA USDT'), 'saque');
  assert.equal(D.tipoDaTela('Mercado da Comunidade'), null);
});
