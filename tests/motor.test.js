// Testes do motor de preço (src/motor.js).
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const M = require(path.join(__dirname, '..', 'src', 'motor.js'));

test('normalizarVenda: guarda o número do Pokémon vendido (para achar revendas) e nenhum nick', () => {
  const linha = { id: 9, tipo: 'pokemon', moeda: 'orb', bruto: 45000, em: 1, pokemonId: 71329900, vendedor: 'NAO', comprador: 'NAO',
    ficha: { id: 71329900, speciesId: 3149, nome: 'Mega Dragonite', level: 2282, nota: 7.349, caughtBy: 'NAO', apelido: 'NAO', shiny: true, tmAoe: true, tmElemental: 'FLYING' } };
  const v = M.normalizarVenda(linha);
  assert.equal(v.pokemonId, 71329900);
  assert.equal(v.id, 9);
  assert.ok(!JSON.stringify(v).includes('NAO'), 'nada de nick');
  // sem pokemonId na linha, usa o id da ficha
  assert.equal(M.normalizarVenda(Object.assign({}, linha, { pokemonId: undefined })).pokemonId, 71329900);
});

test('mesmoPokemon: só pelo número do Pokémon; vendas antigas sem o número não contam', () => {
  const alvo = { id: 71329900, speciesId: 3149 };
  assert.equal(M.mesmoPokemon(alvo, { pokemonId: 71329900 }), true);
  assert.equal(M.mesmoPokemon(alvo, { pokemonId: 1 }), false);
  assert.equal(M.mesmoPokemon(alvo, {}), false, 'venda guardada antes de 13/11/2026');
  assert.equal(M.mesmoPokemon({ speciesId: 3149 }, { pokemonId: 71329900 }), false, 'alvo sem número');
});

test('pontosVendas marca a venda deste mesmo Pokémon (para a tabela da Precificar)', () => {
  const A = require(path.join(__dirname, '..', 'src', 'analise.js'));
  const agora = Date.now();
  const venda = (id, pokemonId) => ({ id, pokemonId, em: agora - 3600e3, moeda: 'orb', preco: 45000, speciesId: 3149, nome: 'Mega Dragonite', level: 2282, nota: 7.35, potencia: 1, shiny: true, aoe: true, zmove: true, mega: true });
  const alvo = { id: 71329900, speciesId: 3149, nome: 'Mega Dragonite', level: 3022, nota: 7.385, potencia: 1, shiny: true, aoe: true, zmove: true, mega: true };
  const pontos = A.pontosVendas(alvo, [venda(1, 71329900), venda(2, 555)], 'orb', agora);
  assert.deepEqual(pontos.map(p => p.mesmo).sort(), [false, true]);
});

test('faixa: com uma venda dominando (revenda do mesmo Pokémon), a faixa não fecha em volta dela; o justo não muda', () => {
  const agora = Date.now(), H = 3600e3;
  const base = { moeda: 'orb', speciesId: 3149, nome: 'Mega Dragonite', potencia: 1, shiny: true, aoe: true, zmove: true, mega: true };
  const alvo = Object.assign({ id: 71329900, level: 3022, nota: 7.385 }, base);
  const vendas = [
    Object.assign({ id: 1, em: agora - 4 * 24 * H, preco: 45000, level: 2282, nota: 7.349 }, base),   // quase igual: domina
    Object.assign({ id: 2, em: agora - 4 * 24 * H, preco: 55000, level: 1838, nota: 7.39 }, base),
    Object.assign({ id: 3, em: agora - 22 * 24 * H, preco: 60000, level: 1697, nota: 7.2 }, base),
    Object.assign({ id: 4, em: agora - 11 * 24 * H, preco: 80000, level: 3668, nota: 7.568, aoe: false }, base),
    Object.assign({ id: 5, em: agora - 7 * H, preco: 110000, level: 4396, nota: 7.568, aoe: false }, base),
  ];
  const r = M.precificar(alvo, vendas, { moeda: 'orb', agora });
  assert.ok(r.suficiente);
  assert.ok(r.nEfetivo < 3, 'nEfetivo ' + r.nEfetivo);
  assert.equal(r.faixaAlargada, true);
  assert.ok(r.esperar / r.venderRapido > 1.3, 'faixa ' + Math.round(r.venderRapido) + '–' + Math.round(r.esperar));
  assert.ok(r.venderRapido < r.precoJusto && r.precoJusto < r.esperar);
});
