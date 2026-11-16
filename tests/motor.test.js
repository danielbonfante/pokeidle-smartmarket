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

test('inicial: Qualidade 1,600 (só o inicial tem) → não pode ir ao Mercado, mesmo com Nv e Nota na faixa', () => {
  // o Charizard inicial evoluído: Nv 211, Nota 3,704, P2, IV 162, Qualidade 1,600
  const f = M.faixaMercado({ quality: 1.6, level: 211, nota: 3.704, potencia: 2, ivTotal: 162 });
  assert.equal(f.inicial, true);
  assert.equal(f.pode, false);
  assert.equal(M.ehInicial({ quality: 1.6 }), true);
  // Qualidades vizinhas são de Pokémon comuns (a faixa sorteada pula de 1,6 para 1,7)
  for (const q of [1.596, 1.59, 1.7, 1.741, 1.8, 0]) assert.equal(M.ehInicial({ quality: q }), false, String(q));
  assert.equal(M.faixaMercado({ quality: 1.596, level: 211, nota: 3.704, potencia: 2 }).pode, true);
});

test('empate: muitas vendas parecidas no mesmo preço → concentração alta; só arredondamento → baixa', () => {
  const agora = Date.UTC(2026, 10, 15);
  const H = 3600e3;
  const base = (i, preco) => ({ id: i, em: agora - i * H, moeda: 'gold', preco, speciesId: 212, nome: 'Furious Scizor', level: 100, nota: 3.7, potencia: 2, shiny: false, aoe: false, zmove: false, mega: false });
  const alvo = { speciesId: 212, nome: 'Furious Scizor', level: 100, nota: 3.7, potencia: 2, shiny: false, aoe: false, zmove: false, mega: false };
  // como o Furious Scizor em Coins: a maioria por 50 M cravados
  const cravado = [];
  for (let i = 1; i <= 20; i++) cravado.push(base(i, i % 4 === 0 ? 45e6 : 5e7));
  const r1 = M.precificar(alvo, cravado, { moeda: 'gold', agora });
  const e1 = M.empate(r1);
  assert.equal(e1.lado, 'cima');
  assert.equal(e1.preco, 5e7);
  assert.ok(e1.concentracao > 0.6, 'concentração ' + e1.concentracao);
  // preços espalhados entre 145 e 154 M: arredondados viram "150 M", mas ninguém vendeu por 150 M exatos
  const espalhado = [];
  for (let i = 1; i <= 20; i++) espalhado.push(base(i, 145e6 + (i % 10) * 1e6));
  const r2 = M.precificar(alvo, espalhado, { moeda: 'gold', agora });
  const e2 = M.empate(r2);
  assert.ok(e2, 'os três arredondam para o mesmo número');
  assert.ok(e2.concentracao < 0.25, 'concentração ' + e2.concentracao);
  assert.equal(M.empate({ suficiente: true, venderRapido: 40, precoJusto: 50, esperar: 60 }), null);
  assert.equal(M.empate({ suficiente: false }), null);
});

test('inicial: com a soma de IV conhecida, só 162 conta', () => {
  assert.equal(M.ehInicial({ quality: 1.6, ivTotal: 162 }), true);
  assert.equal(M.ehInicial({ quality: 1.6, ivTotal: 120 }), false);
  assert.equal(M.ehInicial({ quality: 1.6 }), true, 'sem IV (lido da tela incompleta): vale a Qualidade');
});
