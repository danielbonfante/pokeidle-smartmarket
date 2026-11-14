/*
 * Smart Market — "Como ler": o que quer dizer cada termo que a extensão mostra
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Um texto só, usado em dois lugares: na janela Precificar (botão "? Como ler") e no popup do
 * ícone. Roda no jogo (MAIN world) e no popup. Os textos são fixos, escritos aqui (nada vem do jogo).
 */
(function (root) {
  'use strict';
  if (root.PIGlossario) return;

  const TERMOS = [
    { id: 'mercado', termo: 'Preço de mercado',
      texto: 'O meio das <b>vendas parecidas</b> dos últimos 30 dias: metade saiu por menos, metade por mais. Não é o único preço certo de pagar ou de pedir; é por quanto Pokémon parecidos costumam sair.' },
    { id: 'rapido', termo: 'Vender rápido',
      texto: '1 em cada 4 vendas parecidas saiu por menos que isso. Anunciar perto dele tende a vender logo.' },
    { id: 'esperar', termo: 'Esperar',
      texto: 'Só 1 em cada 4 vendas parecidas saiu por mais que isso. Dá para pedir esse valor se você puder esperar um comprador.' },
    { id: 'faixa', termo: 'Faixa',
      texto: 'De Vender rápido a Esperar: onde saiu a metade do meio das vendas parecidas. Com poucas vendas parecidas, a faixa fica mais larga de propósito, para mostrar a incerteza.' },
    { id: 'parecidas', termo: 'Vendas parecidas',
      texto: 'Vendas da mesma espécie, na mesma moeda e com o mesmo status shiny, nos últimos 30 dias. Pesam mais as de <b>Nota</b> e <b>nível</b> mais perto do Pokémon, com os mesmos extras (TM AoE, Z-Move, Mega) e as mais recentes. A extensão não usa vendas de outras espécies: cada espécie tem a sua procura.' },
    { id: 'liq', termo: 'líq',
      texto: 'Quanto quem vende recebe depois da comissão do Mercado (Coins: 15%; Gemas: 13%, 10% ou 7,5%, conforme o valor).' },
    { id: 'confianca', termo: 'Confiança',
      // os limites são os do motor.js (nEfetivo e largura da faixa) e os da Precificar (70% / 50%)
      texto: 'O quanto dá para confiar no preço, pelo número de vendas parecidas e pela largura da faixa (de Vender rápido a Esperar) comparada ao preço de mercado:' +
        '<ul class="pp-gl-lista">' +
        '<li><b class="pp-gl-verde">Alta</b>: pelo menos 8 vendas parecidas contam de verdade, e a faixa tem até 60% do preço de mercado (ex.: mercado 100, faixa de 80 a 140). Os preços parecidos combinam entre si.</li>' +
        '<li><b class="pp-gl-amarelo">Média</b>: pelo menos 3 vendas parecidas, e a faixa tem até 120% do preço de mercado (ex.: mercado 100, faixa de 60 a 180). Bom ponto de partida, mas olhe as vendas.</li>' +
        '<li><b class="pp-gl-vermelho">Baixa</b>: menos de 3 vendas parecidas, ou a faixa passa disso (preços muito espalhados). Use só como referência.</li>' +
        '</ul>' +
        'Na janela Precificar, a <b>porcentagem</b> é outra medida, feita de verdade: refazendo a conta para as últimas vendas da espécie, cada uma só com as vendas de antes dela, quantas vezes o preço de mercado ficou a até 25% do que foi pago. Verde a partir de 70%, amarelo a partir de 50%.' },
    { id: 'selos', termo: 'Selos da vitrine',
      texto: '<b class="pp-gl-verde">desconto</b>: o anúncio está no Vender rápido ou abaixo. <b>no preço</b>: dentro da faixa. <b class="pp-gl-vermelho">acima do mercado</b>: passou do Esperar. A porcentagem compara o anúncio com o preço de mercado. <span class="pp-gl-tracejado">Borda tracejada</span>: confiança baixa — use só como referência.' },
    { id: 'grupos', termo: 'Grupos de preço',
      texto: 'Às vezes as vendas parecidas se dividem em duas faixas de preço bem diferentes, quase sem nada no meio (por exemplo, umas com TM AoE ou com nível bem maior). Aí o preço de mercado, que é o meio, pode cair no vão entre as duas e não representar nenhuma: a janela Precificar mostra cada grupo e o preço dele. <b>Um grupo só</b> quer dizer que os preços vão subindo aos poucos, sem um salto grande no meio — o preço de mercado representa bem essas vendas.' },
    { id: 'revenda', termo: 'Este mesmo Pokémon',
      texto: 'Uma venda deste mesmo Pokémon (pelo número dele), que já foi vendido antes e voltou ao Mercado.' },
    { id: 'dinheiro', termo: 'US$ e R$',
      texto: 'As Gemas em dinheiro, pela cotação do próprio jogo (telas Depósito e Saque): na vitrine, quanto custa comprar; na ficha e no anúncio, quanto você recebe sacando. O real usa a cotação que você digita no popup.' },
  ];

  /** Lista em HTML (dl). ids: só esses termos, na ordem dada; sem ids, todos. */
  function html(ids) {
    const lista = ids ? ids.map(id => TERMOS.find(t => t.id === id)).filter(Boolean) : TERMOS;
    return '<dl class="pp-glossario">' + lista.map(t => `<div class="pp-gl-item"><dt data-termo="${t.id}">${t.termo}</dt><dd data-termo="${t.id}">${t.texto}</dd></div>`).join('') + '</dl>';
  }

  const api = { TERMOS, html };
  root.PIGlossario = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
