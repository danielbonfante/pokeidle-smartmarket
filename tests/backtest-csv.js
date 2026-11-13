// Backtest do motor com a planilha exportada do jogo (Tabela de preços → Exportar planilha).
// Uso: node tests/backtest-csv.js caminho/da/planilha.csv
const fs = require('fs');
const path = require('path');
const M = require(path.join(__dirname, '..', 'src', 'motor.js'));

const arquivo = process.argv[2];
const texto = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
const [cab, ...linhas] = texto.trim().split(/\r?\n/);
const col = cab.split(';');
const idx = n => col.indexOf(n);
const num = s => Number(String(s || '').replace(/\./g, '').replace(',', '.'));

const vendas = [];
linhas.forEach((l, i) => {
  const c = l.split(';');
  if (c[idx('Tipo')] !== 'Pokemon') return;
  const nome = c[idx('Item')].replace(/\s+Nv\s+\d+$/, '');
  vendas.push({
    id: i,
    em: Date.parse(c[idx('Data')].replace(' ', 'T') + ':00-03:00'),
    moeda: c[idx('Moeda')] === 'Gemas' ? 'orb' : 'gold',
    preco: num(c[idx('Valor total')]),
    speciesId: null,
    nome,
    level: num(c[idx('Nível')]) || 1,
    nota: num(c[idx('Nota')]),
    ivTotal: num(c[idx('IV total')]),
    quality: num(c[idx('Qualidade')]),
    potencia: num(c[idx('Potência')]) || 0,
    shiny: c[idx('Shiny')] === 'sim',
    aoe: false, zmove: false,
    mega: /^mega\s/i.test(nome),
  });
});

function avaliar(nome, fn) {
  const porMoeda = {};
  for (const v of vendas) {
    const r = fn(v);
    if (r == null) continue;
    const m = (porMoeda[v.moeda] ||= { n: 0, dentro25: 0, erros: [], naFaixa: 0 });
    m.n++;
    const erro = Math.abs(r.justo - v.preco) / v.preco;
    m.erros.push(Math.abs(Math.log(r.justo / v.preco)));
    if (erro <= 0.25) m.dentro25++;
    if (r.q1 != null && v.preco >= r.q1 * 0.999 && v.preco <= r.q3 * 1.001) m.naFaixa++;
  }
  console.log(`\n== ${nome}`);
  for (const [moeda, m] of Object.entries(porMoeda)) {
    m.erros.sort((a, b) => a - b);
    const med = Math.exp(m.erros[Math.floor(m.erros.length / 2)]) - 1;
    console.log(`${moeda === 'orb' ? 'Gemas' : 'Coins'}: ${m.n} precificadas | até 25% do pago: ${(100 * m.dentro25 / m.n).toFixed(0)}% | erro mediano: ${(100 * med).toFixed(0)}% | pago dentro da faixa rápido–esperar: ${(100 * m.naFaixa / m.n).toFixed(0)}%`);
  }
}

const agora = Math.max(...vendas.map(v => v.em)) + 60000;
console.log(`Vendas de Pokémon na planilha: ${vendas.length} (Gemas ${vendas.filter(v => v.moeda === 'orb').length}, Coins ${vendas.filter(v => v.moeda === 'gold').length})`);

// Linha de base: mediana simples das outras vendas da espécie
avaliar('Base: mediana simples da espécie', v => {
  const outras = vendas.filter(o => o !== v && o.nome === v.nome && o.moeda === v.moeda && o.shiny === v.shiny).map(o => o.preco).sort((a, b) => a - b);
  if (outras.length < 3) return null;
  return { justo: outras[Math.floor(outras.length / 2)] };
});

// Motor
avaliar('Motor (vendas parecidas ponderadas)', v => {
  const r = M.precificar(Object.assign({}, v, { vendaId: v.id }), vendas, { moeda: v.moeda, agora });
  if (!r.suficiente) return null;
  return { justo: r.precoJusto, q1: r.venderRapido, q3: r.esperar };
});

