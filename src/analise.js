/*
 * Smart Market — lógica da janela "Precificar" (análise de preço)
 *
 * Pontos das vendas parecidas para a barra, escala da barra, detecção de dois grupos de
 * preço (como no Blastoise: ~20–27 e ~100–120, nada no meio) e a confiança medida de
 * verdade: o motor refeito para as vendas recentes da espécie, cada uma só com as
 * anteriores. Sem DOM: roda no navegador (window.PIAnalise) e no Node (testes).
 */
(function (root) {
  'use strict';

  const M = root.PIMotor || (typeof require === 'function' ? require('./motor.js') : null);
  const DIA = 24 * 60 * 60 * 1000;

  const mesmaEspecie = M.mesmaEspecie;

  /**
   * Vendas parecidas para desenhar na barra: mesma espécie, moeda, status shiny, últimos
   * 30 dias. peso de 0 a 1 (1 = a mais parecida), mais parecidas primeiro.
   */
  function pontosVendas(alvo, vendas, moeda, agora, max) {
    const t = agora || Date.now();
    const desde = t - M.PADRAO.janelaDias * DIA;
    const lista = (vendas || [])
      .filter(v => v && v.moeda === moeda && v.em >= desde && v.em <= t && v.preco > 0 &&
        !!v.shiny === !!alvo.shiny && mesmaEspecie(alvo, v))
      .map(v => ({ v, w: M.pesoVenda(alvo, v, t, M.PADRAO) }))
      .filter(x => x.w > 1e-9)
      .sort((a, b) => b.w - a.w)
      .slice(0, max || 60);
    const wMax = lista.length ? lista[0].w : 1;
    return lista.map(({ v, w }) => ({
      preco: v.preco, peso: w / wMax, em: v.em, level: v.level, nota: v.nota, potencia: v.potencia,
      ivTotal: Number(v.ivTotal) || 0, quality: Number(v.quality) || 0,
      aoe: !!v.aoe, zmove: !!v.zmove, mega: !!v.mega, refino: Number(v.refino) || 0,
    }));
  }

  /** Escala logarítmica da barra: devolve x → posição de 0 a 1 entre o menor e o maior valor. */
  function escalaBarra(valores) {
    const vs = (valores || []).filter(x => x > 0);
    if (!vs.length) return () => 0.5;
    const lo = Math.log(Math.min(...vs));
    const hi = Math.log(Math.max(...vs));
    if (hi - lo < 1e-12) return () => 0.5;
    return x => Math.min(1, Math.max(0, (Math.log(x) - lo) / (hi - lo)));
  }

  /** Mediana ponderada dos preços (pts em ordem de preço). */
  function medianaPonderada(pts) {
    const tot = pts.reduce((s, p) => s + p.peso, 0);
    let acc = 0;
    for (const p of pts) { acc += p.peso; if (acc >= tot / 2) return p.preco; }
    return pts[pts.length - 1].preco;
  }

  function resumoGrupo(pts, total) {
    const peso = pts.reduce((s, p) => s + p.peso, 0);
    const media = f => pts.reduce((s, p) => s + f(p) * p.peso, 0) / peso;
    return {
      n: pts.length,
      preco: medianaPonderada(pts), // "preço do grupo": o meio das vendas dele, as mais parecidas pesando mais
      min: Math.min(...pts.map(p => p.preco)),
      max: Math.max(...pts.map(p => p.preco)),
      fracao: peso / total,
      nivelMedio: media(p => p.level),
      notaMedia: media(p => p.nota),
      pctAoe: media(p => (p.aoe ? 1 : 0)),
      pctZ: media(p => (p.zmove ? 1 : 0)),
      refinoMedio: media(p => p.refino),
    };
  }

  /**
   * Dois grupos de preço: o maior salto entre preços vizinhos, se for de pelo menos
   * razaoMin× (2,5) e cada lado tiver pelo menos fracaoMin (20%) do peso. Senão, null.
   */
  // O maior salto entre preços vizinhos com pelo menos fracaoMin do peso de cada lado (uma venda
  // isolada na ponta não conta). null com menos de 4 vendas ou sem corte possível.
  function acharSalto(pontos, fracaoMin) {
    const pts = (pontos || []).filter(p => p.preco > 0 && p.peso > 0).sort((a, b) => a.preco - b.preco);
    if (pts.length < 4) return null;
    const total = pts.reduce((s, p) => s + p.peso, 0);
    let acum = 0, melhor = null;
    for (let i = 0; i < pts.length - 1; i++) {
      acum += pts[i].peso;
      const razao = pts[i + 1].preco / pts[i].preco;
      const esq = acum / total;
      if (esq >= fracaoMin && 1 - esq >= fracaoMin && (!melhor || razao > melhor.razao)) {
        melhor = { razao, corte: i + 1, de: pts[i].preco, para: pts[i + 1].preco };
      }
    }
    return melhor && { pts, total, melhor };
  }

  /**
   * O maior salto de preço entre as vendas parecidas, pela mesma regra dos grupos: { de, para,
   * razao }. A janela mostra isso quando não há dois grupos ("um grupo só"), para dizer que conferiu.
   */
  function maiorSalto(pontos, opcoes) {
    const o = Object.assign({ fracaoMin: 0.2 }, opcoes);
    const s = acharSalto(pontos, o.fracaoMin);
    return s ? { de: s.melhor.de, para: s.melhor.para, razao: s.melhor.razao } : null;
  }

  function detectarGrupos(pontos, opcoes) {
    const o = Object.assign({ razaoMin: 2.5, fracaoMin: 0.2 }, opcoes);
    const s = acharSalto(pontos, o.fracaoMin);
    if (!s || s.melhor.razao < o.razaoMin) return null;
    const { pts, total, melhor } = s;
    return {
      razao: melhor.razao,
      baixo: resumoGrupo(pts.slice(0, melhor.corte), total),
      alto: resumoGrupo(pts.slice(melhor.corte), total),
    };
  }

  /**
   * O grupo mais parecido com o Pokémon: o de maior peso, porque o peso de cada venda já mede
   * a semelhança (Nota, nível, potência, extras). Com menos de `minimo` (60%) do peso, não aponta
   * nenhum. Medido na planilha de 11/11/2026 (justo no vão): em Coins o grupo mais pesado era o
   * certo em 79% das vezes; em Gemas, só em 59%. Por isso a janela mostra os dois preços e só
   * indica o mais parecido, sem trocar o Preço justo.
   */
  function grupoMaisParecido(grupos, minimo) {
    if (!grupos) return null;
    const m = minimo == null ? 0.6 : minimo;
    const lado = grupos.alto.fracao > grupos.baixo.fracao ? 'alto' : 'baixo';
    const fracao = grupos[lado].fracao;
    return fracao >= m ? { lado, fracao } : null;
  }

  /** O preço cai no vão entre os dois grupos (onde quase ninguém vende)? */
  function noVao(preco, grupos) {
    return !!grupos && preco > grupos.baixo.max && preco < grupos.alto.min;
  }

  /**
   * Confiança medida: para as vendas recentes da espécie (até n, últimos 30 dias), refaz o
   * motor usando só as vendas anteriores a cada uma e conta quantas vezes o Preço justo ficou
   * a até `tolerancia` (25%) do valor pago. null se houver menos de minTotal avaliáveis.
   */
  function confiancaEspecie(vendas, moeda, agora, opcoes) {
    const o = Object.assign({ n: 100, tolerancia: 0.25, minTotal: 10 }, opcoes);
    const t = agora || Date.now();
    const desde = t - M.PADRAO.janelaDias * DIA;
    const daMoeda = (vendas || []).filter(v => v && v.moeda === moeda && v.preco > 0);
    const recentes = daMoeda.filter(v => v.em >= desde && v.em <= t).sort((a, b) => b.em - a.em).slice(0, o.n);
    let total = 0, acertos = 0;
    for (const v of recentes) {
      const anteriores = daMoeda.filter(x => x.em < v.em);
      const alvo = { speciesId: v.speciesId, nome: v.nome, level: v.level, nota: v.nota, potencia: v.potencia,
        shiny: !!v.shiny, aoe: !!v.aoe, zmove: !!v.zmove, mega: !!v.mega, vendaId: v.id };
      const r = M.precificar(alvo, anteriores, { moeda, agora: v.em });
      if (!r.suficiente) continue;
      total++;
      if (Math.abs(r.precoJusto - v.preco) / v.preco <= o.tolerancia) acertos++;
    }
    if (total < o.minTotal) return null;
    return { total, acertos, taxa: acertos / total };
  }

  const api = { pontosVendas, escalaBarra, detectarGrupos, maiorSalto, grupoMaisParecido, noVao, confiancaEspecie };
  root.PIAnalise = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
