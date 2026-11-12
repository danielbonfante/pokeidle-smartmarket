/*
 * Smart Market — sincronização incremental do histórico
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

  // primeira: a resposta da página 0 já pedida na escolha da busca (não pede de novo)
  async function executar(busca, moeda, aoProgresso, filtro, primeira) {
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
      const j = pagina === 0 && primeira ? primeira
        : await window.PIWs.consultarHistorico(Object.assign({ pagina, moeda, busca }, filtro));
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

  // ---------- busca normal ou da família ----------
  // A busca da Tabela acha qualquer nome que contenha o texto: "Scizor" traz o Furious Scizor (uma
  // variante de Outland, muito vendida), que enche as páginas e encurta o período coberto. A busca
  // da família ("+scizor") deixa as variantes de Outland de fora (12/11/2026: 27 de 30 vendas eram
  // Scizor, contra 6 de 30; 25 páginas cobriram os 30 dias). Mas a família de uma forma base traz as
  // evoluções ("+charmander" traria os Charizard). Por isso, na primeira vez, compara a página 0 das
  // duas e fica com a que traz mais vendas da própria espécie; a escolha vale 7 dias.
  const ESCOLHA_VALIDADE_MS = 7 * DIA;
  const escolhendo = new Map();

  const ehNomeSimples = busca => !!busca && !/^[+#]|\+$/.test(busca.trim());
  const daEspecie = (j, nome) => (Array.isArray(j && j.linhas) ? j.linhas : [])
    .filter(l => l && l.ficha && String(l.ficha.nome || '').toLowerCase() === nome).length;

  function escolherBusca(nome, moeda) {
    const n = nome.trim().toLowerCase();
    if (escolhendo.has(n)) return escolhendo.get(n).then(e => ({ busca: e.busca })); // a página 0 é de outra chamada
    const p = (async () => {
      const chave = 'escolha|' + n;
      const salva = await window.PIStore.lerSync(chave);
      if (salva && Date.now() - salva.em < ESCOLHA_VALIDADE_MS) return { busca: salva.busca };
      const familia = '+' + n;
      const jNome = await window.PIWs.consultarHistorico({ pagina: 0, moeda, busca: nome });
      const jFam = await window.PIWs.consultarHistorico({ pagina: 0, moeda, busca: familia });
      const usaFamilia = daEspecie(jFam, n) > daEspecie(jNome, n);
      const busca = usaFamilia ? familia : nome;
      await window.PIStore.gravarSync({ chave, busca, em: Date.now() });
      return { busca, primeira: usaFamilia ? jFam : jNome, moeda };
    })();
    escolhendo.set(n, p);
    p.finally(() => escolhendo.delete(n)).catch(() => {});
    return p;
  }

  async function executarEspecie(nome, moeda, aoProgresso) {
    const e = await escolherBusca(nome, moeda);
    return executar(e.busca, moeda, aoProgresso, {}, e.moeda === moeda ? e.primeira : null);
  }

  /** Sincroniza uma busca; chamadas repetidas enquanto a primeira roda reaproveitam a mesma promessa. */
  function sincronizar(busca, moeda, aoProgresso, filtro) {
    const chave = chaveDe(busca, moeda, filtro);
    if (emAndamento.has(chave)) return emAndamento.get(chave);
    const semFiltro = !filtro || !(filtro.soShiny || filtro.soP5);
    const p = (semFiltro && ehNomeSimples(busca)
      ? executarEspecie(busca, moeda, aoProgresso)
      : executar(busca, moeda, aoProgresso, filtro || {})
    ).finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, p);
    return p;
  }

  window.PISync = { sincronizar };
})();
