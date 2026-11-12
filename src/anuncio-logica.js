/*
 * Smart Market — lógica pura do painel de preços na tela "Novo anúncio"
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Ordem das listas (mais parecidos primeiro), posição do painel ao lado da caixa do
 * jogo, moeda inicial e valor dos botões "usar". Sem DOM: roda no navegador
 * (window.PIAnuncioLogica) e no Node (module.exports), para testes.
 */
(function (root) {
  'use strict';

  const M = root.PIMotor || (typeof require === 'function' ? require('./motor.js') : null);
  const DIA = 24 * 60 * 60 * 1000;
  const JANELA_DIAS = 30;
  const MARGEM = 12;

  /** Shiny só vende em Gemas: o painel abre em Gemas mesmo que o jogo marque Coins. */
  function moedaPainel(alvo, moedaJogo) {
    if (alvo && alvo.shiny) return 'orb';
    return moedaJogo === 'orb' ? 'orb' : 'gold';
  }

  /** Semelhança com o alvo (a mesma régua do motor), sem o peso pela idade. */
  function semelhanca(alvo, item, agora) {
    const t = agora || Date.now();
    return M.pesoVenda(alvo, Object.assign({}, item, { em: t }), t, M.PADRAO);
  }

  const mesmaEspecie = M.mesmaEspecie;

  /** Anúncios abertos ({id, preco, moeda, alvo}) da moeda pedida, mais parecidos primeiro. */
  function ordenarAVenda(alvo, anuncios, moeda, agora) {
    return (anuncios || [])
      .filter(a => a && a.moeda === moeda && a.alvo)
      .map(a => ({ a, w: semelhanca(alvo, a.alvo, agora) }))
      .sort((x, y) => (y.w - x.w) || (x.a.preco - y.a.preco))
      .map(x => x.a);
  }

  /** Vendas da espécie (últimos 30 dias, mesma moeda e status shiny), mais parecidas primeiro. */
  function ordenarVendidos(alvo, vendas, moeda, agora) {
    const t = agora || Date.now();
    const desde = t - JANELA_DIAS * DIA;
    return (vendas || [])
      .filter(v => v && v.moeda === moeda && v.em >= desde && v.em <= t &&
        !!v.shiny === !!alvo.shiny && v.preco > 0 && mesmaEspecie(alvo, v))
      .map(v => ({ v, w: M.pesoVenda(alvo, v, t, M.PADRAO) }))
      .sort((x, y) => (y.w - x.w) || (y.v.em - x.v.em))
      .map(x => x.v);
  }

  /**
   * Onde pôr o painel dentro da folha do jogo, sem cobrir a caixa.
   * Retângulos em coordenadas da página; a saída é relativa à folha.
   */
  function posicaoPainel(caixa, folha, largura, margem, preferencia) {
    const m = margem == null ? MARGEM : margem;
    const top = caixa.top - folha.top;
    const direita = () => caixa.right + m + largura <= folha.right
      ? { modo: 'direita', left: caixa.right + m - folha.left, top } : null;
    const esquerda = () => caixa.left - m - largura >= folha.left
      ? { modo: 'esquerda', left: caixa.left - m - largura - folha.left, top } : null;
    const lados = preferencia === 'esquerda' ? [esquerda, direita] : [direita, esquerda];
    for (const lado of lados) { const p = lado(); if (p) return p; }
    return { modo: 'abaixo', left: caixa.left - folha.left, top: caixa.bottom + m - folha.top };
  }

  // Faixas da Nota (Pokepédia → Nota, Poder e Calculadora). Nota bem no limite fica na faixa de baixo.
  const FAIXAS_NOTA = ['Extremamente Fraco', 'Fraco', 'Mediano', 'Razoável', 'Bom', 'Forte', 'Poderoso', 'Mítico', 'Lendário', 'Divino'];

  function indiceFaixaNota(n) {
    if (!isFinite(n)) return -1;
    return Math.min(9, Math.max(0, Math.ceil(n) - 1));
  }

  function faixaNota(n) {
    const i = indiceFaixaNota(n);
    return i < 0 ? '' : FAIXAS_NOTA[i];
  }

  /**
   * Nível de cor (1 a 5) dos cartões, na escala de raridade do jogo (classes .t1–.t5 de
   * estilo.css: comum, incomum, rara, mítica, lendária).
   * - potência: P1 → 1 … P5 → 5 (como .cm-pot.p1–p5 no jogo);
   * - qualidade: faixas da Pokepédia (Comum 1, Incomum 2, Rara 3, Épica 4, Lendária 5);
   * - iv: ESTIMATIVA a partir de fichas vistas (109/120/130 verdes, 138/147/162 azuis);
   *   os limites exatos estão no código do jogo, que não foi lido.
   */
  function nivelSelo(tipo, v) {
    const x = Number(v);
    if (!isFinite(x)) return 1;
    if (tipo === 'potencia') return Math.min(5, Math.max(1, Math.round(x)));
    if (tipo === 'qualidade') return x >= 1.7 ? 5 : x >= 1.5 ? 4 : x >= 1.3 ? 3 : x >= 1.1 ? 2 : 1;
    if (tipo === 'iv') return x >= 185 ? 5 : x >= 166 ? 4 : x >= 136 ? 3 : x >= 96 ? 2 : 1;
    return 1;
  }

  /** Valor que o botão "usar" escreve no campo: arredondado como a vitrine, mínimo 2. */
  function valorUsar(x) {
    return Math.max(2, M.arredondarPreco(x));
  }

  /**
   * O Pokémon de um card de "Meus anúncios" no índice do WebSocket. O card não traz o id,
   * então compara nome, nível e Nota (3 casas), e a potência quando o card mostra. Sem Nota
   * não arrisca: devolve null e o painel usa só o que a tela mostra.
   */
  function acharNoIndice(pokemons, dados) {
    if (!dados || !isFinite(dados.nota) || !isFinite(dados.level)) return null;
    const nome = String(dados.nome || '').trim().toLowerCase();
    for (const p of pokemons || []) {
      if (String(p.nome || '').toLowerCase() !== nome || Number(p.level) !== dados.level) continue;
      if (Math.abs(Number(p.nota) - dados.nota) > 0.0006) continue;
      if (isFinite(dados.potencia) && Number(p.potencia) !== dados.potencia) continue;
      return p;
    }
    return null;
  }

  const api = { moedaPainel, semelhanca, ordenarAVenda, ordenarVendidos, posicaoPainel, valorUsar, faixaNota, indiceFaixaNota, nivelSelo, acharNoIndice };
  root.PIAnuncioLogica = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
