/*
 * Pokeidle Smart Market — sincronização incremental do histórico
 *
 * Para uma espécie e uma moeda, pede as páginas do histórico do RMT da mais
 * recente para a mais antiga e para assim que encontra uma venda que já está
 * no cache (ou o jogo avisa que não há mais páginas, ou passa de 30 dias).
 * Na primeira vez uma espécie popular pode levar umas dezenas de páginas;
 * depois, normalmente 1 ou 2.
 */
(function () {
  'use strict';
  if (window.PISync) return;

  const MAX_PAGINAS = 25;        // primeira busca de uma espécie: até 750 vendas
  const MAX_PAGINAS_CLASSE = 15; // shiny/P5 de todas as espécies: só para a estimativa pela Nota
  const REFRESCO_MS = 10 * 60 * 1000; // não sincroniza a mesma busca mais de uma vez a cada 10 min
  const DIA = 24 * 60 * 60 * 1000;
  const emAndamento = new Map();

  // filtro: { soShiny, soP5 } — as vendas de uma classe inteira, para a estimativa pela Nota
  function chaveDe(busca, moeda, filtro) {
    const f = (filtro && filtro.soShiny ? '|shiny' : '') + (filtro && filtro.soP5 ? '|p5' : '');
    return moeda + '|' + String(busca || '').toLowerCase() + f;
  }

  async function executar(busca, moeda, aoProgresso, filtro) {
    const chave = chaveDe(busca, moeda, filtro);
    const meta = (await window.PIStore.lerSync(chave)) || { chave, maxId: 0, em: 0 };
    if (Date.now() - meta.em < REFRESCO_MS) return { pulou: true, paginas: 0 };

    const limiteAntigo = Date.now() - 30 * DIA;
    let maxVisto = meta.maxId;
    let pagina = 0;
    let lidas = 0;
    let novas = 0;

    const maxPaginas = filtro && (filtro.soShiny || filtro.soP5) ? MAX_PAGINAS_CLASSE : MAX_PAGINAS;
    while (pagina < maxPaginas) {
      lidas++;
      const j = await window.PIWs.consultarHistorico(Object.assign({ pagina, moeda, busca }, filtro));
      const linhas = Array.isArray(j.linhas) ? j.linhas : [];
      const vendas = linhas.map(window.PIMotor.normalizarVenda).filter(Boolean);
      await window.PIStore.salvarVendas(vendas);
      for (const l of linhas) if (l.id > maxVisto) maxVisto = l.id;
      novas += vendas.filter(v => v.id > meta.maxId).length;
      if (aoProgresso) aoProgresso({ pagina: pagina + 1, novas });

      if (!j.temMais || !linhas.length) break;
      if (meta.maxId && linhas.some(l => l.id <= meta.maxId)) break;
      if (linhas[linhas.length - 1].em < limiteAntigo) break;
      pagina++;
    }

    await window.PIStore.gravarSync({ chave, maxId: maxVisto, em: Date.now() });
    return { pulou: false, paginas: lidas, novas };
  }

  /** Sincroniza uma busca; chamadas repetidas enquanto a primeira roda reaproveitam a mesma promessa. */
  function sincronizar(busca, moeda, aoProgresso, filtro) {
    const chave = chaveDe(busca, moeda, filtro);
    if (emAndamento.has(chave)) return emAndamento.get(chave);
    const p = executar(busca, moeda, aoProgresso, filtro || {}).finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, p);
    return p;
  }

  window.PISync = { sincronizar };
})();
