/*
 * Smart Market — caçador de pechinchas na vitrine do RMT
 *
 * Quando o jogo recebe uma página de anúncios de Pokémon ({t:'market', aba:'vitrine'}),
 * guarda em memória só o preço, a moeda e os dados do Pokémon de cada anúncio (nada de
 * nick). Em cada card da vitrine põe um selo com o preço justo estimado e quanto o
 * anúncio está abaixo ou acima dele.
 *
 * O cálculo usa o cache de vendas. Só busca vendas novas no jogo quando a vitrine
 * mostra uma espécie só, ou só shiny / só P5, ou quando o usuário clica em "buscar" num
 * selo — pela fila do ws.js, no mesmo ritmo do resto da extensão (1,5 s entre páginas,
 * no máximo 12 por minuto, a mesma busca no máximo a cada 10 min). Nunca varre o mercado.
 */
(function () {
  'use strict';
  if (window.PIVitrine) return;

  const MAX_ANUNCIOS = 2000;
  const anuncios = new Map(); // id do anúncio -> { id, preco, moeda, alvo }
  let versao = 0;             // sobe a cada sync, para os selos recalcularem
  let agendado = null;
  let observador = null;
  let listaObservada = null;
  let sincronizando = false;
  // os selos podem ser desligados no popup
  const ligado = () => !window.PIConfig || window.PIConfig.ligado('selos');

  // ---------- anúncios ----------
  function guardar(j) {
    const linhas = Array.isArray(j.linhas) ? j.linhas : [];
    const desta = [];
    for (const l of linhas) {
      if (!l || l.tipo !== 'pokemon' || !l.ficha || !(Number(l.preco) > 0)) continue;
      const an = { id: l.id, preco: Number(l.preco), moeda: l.moeda, alvo: window.PIMotor.normalizarAlvo(l.ficha), vistoEm: Date.now() };
      anuncios.delete(l.id);
      anuncios.set(l.id, an);
      if (anuncios.size > MAX_ANUNCIOS) anuncios.delete(anuncios.keys().next().value);
      desta.push(an);
    }
    return desta;
  }

  // ---------- preço ----------
  async function avaliar(an, memoEsp, memoClasse) {
    const a = an.alvo;
    const chaveEsp = a.speciesId != null ? 'id:' + a.speciesId : 'nome:' + a.nome;
    if (!memoEsp.has(chaveEsp)) memoEsp.set(chaveEsp, window.PIStore.vendasPorEspecie(a.speciesId, a.nome));
    const res = window.PIMotor.precificar(a, await memoEsp.get(chaveEsp), { moeda: an.moeda });
    const classe = window.PIMotor.classeDe(a);
    if (res.suficiente || !classe) return res;
    if (!memoClasse.has(classe)) memoClasse.set(classe, window.PIStore.vendasPorClasse(classe));
    const est = window.PIMotor.precificarPorNota(a, await memoClasse.get(classe), { moeda: an.moeda });
    return est.suficiente ? est : res;
  }

  const pct = x => window.PIUi.fmtDif(x);

  // ---------- "buscar": vendas de uma espécie sob demanda (clique no selo) ----------
  // A vitrine só busca sozinha quando a página é de uma espécie só; numa busca como "scizor"
  // vêm várias espécies e as que não estão no cache ficavam "sem preço justo" para sempre.
  const buscas = new Map(); // "speciesId|moeda" -> { estado: 'buscando' | 'feita' | 'erro', msg }

  function chaveEspecie(an) {
    return (an.alvo.speciesId != null ? an.alvo.speciesId : an.alvo.nome) + '|' + an.moeda;
  }

  /**
   * Selo sem preço. O texto depende de quantas vendas da espécie (nesta moeda, 30 dias) já estão
   * guardadas — an.vendasEspecie, do último cálculo:
   *  - nenhuma: "sem preço justo · buscar" (antes da busca) / "nenhuma venda desta espécie" (depois);
   *  - 1 ou 2: "poucas vendas desta espécie";
   *  - 3 ou mais: "poucas vendas com Nv e Nota parecidos" — a espécie vende, mas nenhuma venda tem nível, Nota ou
   *    potência perto deste (ex.: Furious Scizor Nv 1.166, ou um P5 de Nota 4,995).
   * Enquanto a busca desta sessão não foi feita, "buscar" continua oferecido: vendas novas no
   * histórico podem trazer uma parecida.
   */
  function conteudoSemPreco(an) {
    const b = buscas.get(chaveEspecie(an));
    const botao = rotulo => `<b class="pp-vit-buscar" role="button" tabindex="0">${rotulo}</b>`;
    if (b && b.estado === 'buscando') {
      return { cls: 'pp-vit-sem pp-vit-buscando', html: 'buscando vendas…', titulo: 'Smart Market: buscando as vendas desta espécie no histórico do RMT.' };
    }
    if (b && b.estado === 'erro') {
      return { cls: 'pp-vit-sem', html: `não deu para buscar · ${botao('tentar de novo')}`, titulo: 'Smart Market: ' + b.msg };
    }
    const feita = !!(b && b.estado === 'feita');
    const n = an.vendasEspecie || 0;
    const onde = `${an.alvo.nome} em ${(window.PIUi.MOEDA[an.moeda] || { nome: an.moeda }).nome} nos últimos 30 dias`;
    const maisBusca = feita ? '' : ' Clique em "buscar" para conferir no histórico do RMT se há vendas novas (uma busca, no ritmo de sempre).';
    const comBotao = texto => feita ? texto : `${texto} · ${botao('buscar')}`;
    if (n >= 3) {
      return {
        cls: 'pp-vit-sem',
        html: comBotao('poucas vendas com Nv e Nota parecidos'),
        titulo: `Smart Market: há ${n} vendas de ${onde}, mas nenhuma com nível, Nota e potência parecidos com este — um preço justo aqui seria chute.` + maisBusca,
      };
    }
    if (n > 0) {
      return {
        cls: 'pp-vit-sem',
        html: comBotao('poucas vendas desta espécie'),
        titulo: `Smart Market: só ${n === 1 ? '1 venda' : n + ' vendas'} de ${onde}; são precisas pelo menos 3 para um preço justo.` + maisBusca,
      };
    }
    if (feita) {
      return { cls: 'pp-vit-sem', html: 'nenhuma venda desta espécie', titulo: `Smart Market: mesmo depois de buscar, nenhuma venda de ${onde}.` };
    }
    return {
      cls: 'pp-vit-sem',
      html: `sem preço justo · ${botao('buscar')}`,
      titulo: 'Smart Market: ainda não há vendas desta espécie guardadas. Clique em "buscar" para trazer as vendas dela do histórico do RMT (uma busca, no ritmo de sempre).',
    };
  }

  /** "115–140" ou "120–150 M": a unidade (k, M, B) aparece uma vez só quando as duas pontas têm a mesma. */
  function faixaTexto(res, moeda) {
    const a = window.PIUi.fmtPreco(res.venderRapido, moeda), b = window.PIUi.fmtPreco(res.esperar, moeda);
    const ua = (a.match(/ [kMB]$/) || [''])[0], ub = (b.match(/ [kMB]$/) || [''])[0];
    return (ua && ua === ub ? a.slice(0, -ua.length) : a) + '–' + b;
  }

  function conteudoSelo(an, res) {
    const fmt = (x, m) => window.PIUi.fmtPreco(x, m);
    an.vendasEspecie = res ? res.vendasEspecie || 0 : 0; // guardado para o selo sem preço (também durante a busca)
    if (!res || !res.suficiente) return conteudoSemPreco(an);
    const dif = an.preco / res.precoJusto - 1;
    const est = res.estimativa ? '≈ ' : '';
    let cls, rotulo;
    if (an.preco <= res.venderRapido) { cls = 'pp-vit-pechincha'; rotulo = 'pechincha'; }
    else if (an.preco > res.esperar) { cls = 'pp-vit-caro'; rotulo = 'acima do justo'; }
    else { cls = 'pp-vit-justo'; rotulo = 'no preço'; }
    if (res.confianca === 'baixa' || res.estimativa) cls += ' pp-vit-incerto';
    const base = res.estimativa
      ? `estimativa pela Nota com ${res.vendasClasse} vendas de outras espécies (erra bastante)`
      : `${res.vendasEspecie} vendas da espécie, confiança ${res.confianca}`;
    return {
      cls,
      // a faixa explica o rótulo: pechincha = até o Vender rápido; acima = passou do Esperar
      html: `<b>${est}${rotulo} ${pct(dif)}</b><span>justo ${est}${fmt(res.precoJusto, an.moeda)} · faixa ${faixaTexto(res, an.moeda)}</span>`,
      titulo: `Smart Market — preço justo estimado: ${fmt(res.precoJusto, an.moeda)} ` +
        `(Vender rápido ${fmt(res.venderRapido, an.moeda)} · Esperar ${fmt(res.esperar, an.moeda)}). ` +
        `Este anúncio está ${pct(dif)} em relação ao justo. Base: ${base}.`,
    };
  }

  // ---------- selos nos cards ----------
  async function aplicar() {
    const lista = document.getElementById('cm-lista');
    if (!lista) return;
    if (!ligado()) { lista.querySelectorAll('.pp-vit').forEach(s => s.remove()); return; }
    observar(lista);
    const memoEsp = new Map();
    const memoClasse = new Map();
    for (const card of lista.querySelectorAll('.cm-card')) {
      const alvo = alvoDoCard(card);
      if (!alvo) continue;
      const { an, rod, base } = alvo;
      const pronto = selosProntos.get(base);
      if (pronto && pronto.versao === versao) { porSelo(rod, base, pronto); continue; }
      const res = await avaliar(an, memoEsp, memoClasse);
      const novo = { versao, c: conteudoSelo(an, res) };
      selosProntos.delete(base);
      selosProntos.set(base, novo);
      if (selosProntos.size > MAX_ANUNCIOS) selosProntos.delete(selosProntos.keys().next().value);
      if (rod.isConnected) porSelo(rod, base, novo);
    }
  }

  // ---------- selos prontos: recolocados na hora quando o jogo redesenha ----------
  // O jogo redesenha a vitrine inteira a cada ~3 s (diagnóstico de 11/11/2026: 144 cards
  // trocados em 20 s, sem vitrine nova chegando). Recalcular a cada redesenho fazia o selo
  // sumir e voltar (pisca-pisca). Agora o selo calculado fica guardado e volta no mesmo
  // aviso do MutationObserver, antes de a tela ser pintada.
  const selosProntos = new Map(); // "id|preço|moeda" -> { versao, c: { cls, html, titulo } }

  function alvoDoCard(card) {
    const fav = card.querySelector('[data-fav]');
    const rod = card.querySelector('.cm-rodape');
    const an = fav && anuncios.get(Number(fav.getAttribute('data-fav')));
    if (!an || !rod) return null;
    return { an, rod, base: an.id + '|' + an.preco + '|' + an.moeda };
  }

  function porSelo(rod, base, pronto) {
    const chave = base + '|' + pronto.versao;
    let selo = rod.querySelector('.pp-vit');
    // compara o conteúdo pronto, não só a chave: o estado da busca muda sem mudar a versão
    if (selo && selo.__pronto === pronto) return;
    if (!selo) {
      selo = document.createElement('div');
      const preco = rod.querySelector('.cm-preco');
      if (preco) preco.insertAdjacentElement('afterend', selo); else rod.prepend(selo);
    }
    selo.className = 'pp-vit ' + pronto.c.cls;
    selo.innerHTML = pronto.c.html;
    selo.title = pronto.c.titulo;
    selo.dataset.chave = chave;
    selo.__pronto = pronto;
  }

  /** Recoloca, sem esperar nada, os selos já calculados. Diz se falta calcular algum. */
  function recolocar(lista) {
    let falta = false;
    for (const card of lista.querySelectorAll('.cm-card')) {
      const alvo = alvoDoCard(card);
      if (!alvo) continue;
      const pronto = selosProntos.get(alvo.base);
      if (pronto) porSelo(alvo.rod, alvo.base, pronto); // mesmo de uma versão anterior: melhor que sumir
      if (!pronto || pronto.versao !== versao) falta = true;
    }
    return falta;
  }

  /** Troca na hora o selo dos anúncios da espécie que estão sem preço pelo estado da busca
   *  (os que já têm preço continuam com ele até o recálculo). */
  function marcarEspecie(chave) {
    for (const an of anuncios.values()) {
      if (chaveEspecie(an) !== chave) continue;
      const base = an.id + '|' + an.preco + '|' + an.moeda;
      const atual = selosProntos.get(base);
      if (atual && !/(^| )pp-vit-sem( |$)/.test(atual.c.cls)) continue;
      selosProntos.set(base, { versao, c: conteudoSemPreco(an) });
    }
    const lista = document.getElementById('cm-lista');
    if (lista) recolocar(lista);
  }

  async function buscarEspecie(an) {
    const chave = chaveEspecie(an);
    const atual = buscas.get(chave);
    if (atual && atual.estado === 'buscando') return;
    buscas.set(chave, { estado: 'buscando' });
    marcarEspecie(chave);
    try {
      await window.PISync.sincronizar(an.alvo.nome, an.moeda);
      buscas.set(chave, { estado: 'feita' });
      // recalcula com as vendas novas; os selos atuais ("buscando vendas…") ficam na tela até o
      // cálculo terminar, sem passar por um texto calculado com a contagem antiga
      versao++;
      agendar();
    } catch (e) {
      buscas.set(chave, { estado: 'erro', msg: e.message });
      marcarEspecie(chave);
    }
  }

  // Clique (ou Enter/Espaço) em "buscar": captura no documento para o clique não chegar ao card do jogo
  function aoClicarBuscar(ev) {
    if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
    const botao = ev.target && ev.target.closest && ev.target.closest('.pp-vit-buscar');
    if (!botao) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    const card = botao.closest('.cm-card');
    const alvo = card && alvoDoCard(card);
    if (alvo) buscarEspecie(alvo.an);
  }
  document.addEventListener('click', aoClicarBuscar, true);
  document.addEventListener('keydown', aoClicarBuscar, true);

  function agendar() {
    clearTimeout(agendado);
    agendado = setTimeout(() => { aplicar().catch(e => console.warn('[Smart Market]', e)); }, 150);
  }

  function ehNossa(no) {
    return no.nodeType === 1 && (no.classList.contains('pp-vit') || !!no.closest('.pp-vit'));
  }

  // O jogo redesenha os cards (troca de página, favoritar…): reaplica os selos
  function observar(lista) {
    if (listaObservada === lista) return;
    if (observador) observador.disconnect();
    listaObservada = lista;
    observador = new MutationObserver(muts => {
      const soNossas = muts.every(m => ehNossa(m.target) ||
        ([...m.addedNodes, ...m.removedNodes].length > 0 && [...m.addedNodes, ...m.removedNodes].every(ehNossa)));
      if (soNossas || !ligado()) return;
      if (recolocar(lista)) agendar(); // na hora o que já está pronto; o resto, calculado depois
    });
    observador.observe(lista, { childList: true, subtree: true });
  }

  // ---------- busca de vendas (só vitrine focada) ----------
  async function sincronizarVitrine(desta) {
    if (sincronizando || !desta.length || !ligado() || !window.PIWs.conectado()) return;
    // Só quando o Mercado está aberto na tela: outras extensões também
    // pedem vitrines em segundo plano, e essas não devem disparar busca nenhuma
    const lista = document.getElementById('cm-lista');
    if (!lista || !lista.getClientRects().length) return;
    const moedas = [...new Set(desta.map(a => a.moeda))];
    const especies = new Set(desta.map(a => a.alvo.speciesId));
    const nome = especies.size === 1 ? desta[0].alvo.nome : '';
    const classes = new Set(desta.map(a => window.PIMotor.classeDe(a.alvo)));
    const classe = classes.size === 1 ? [...classes][0] : '';
    const filtro = classe === 'S' ? { soShiny: true } : classe ? { soP5: true } : null;
    if (!nome && !filtro) return;
    // As moedas ao mesmo tempo: a fila do ws.js manda uma consulta por vez, na ordem de chegada,
    // então as páginas saem intercaladas (Gemas, Coins…) e os selos das duas moedas chegam logo,
    // em vez de uma esperar a outra terminar. Mesmo ritmo e mesmo número de consultas.
    const porMoeda = async m => {
      const buscas = [];
      if (nome) buscas.push(() => window.PISync.sincronizar(nome, m));
      if (filtro) buscas.push(() => window.PISync.sincronizar('', m, null, filtro));
      for (const b of buscas) {
        const r = await b();
        if (r && !r.pulou) { versao++; agendar(); }
      }
    };
    sincronizando = true;
    try {
      const fim = await Promise.allSettled(moedas.map(porMoeda));
      const falha = fim.find(f => f.status === 'rejected');
      // console.info: um aviso esperado (freio, conexão ocupada) não deve aparecer como erro da extensão
      if (falha) console.info('[Smart Market] vitrine:', falha.reason && falha.reason.message);
    } finally {
      sincronizando = false;
    }
  }

  window.PIWs.aoReceberVitrine(j => {
    const desta = guardar(j);
    agendar();
    // espera o jogo desenhar a lista antes de decidir se o Mercado está aberto
    setTimeout(() => sincronizarVitrine(desta), 400);
  });

  /** Anúncios já vistos de uma espécie numa moeda (plano B do painel do anúncio). */
  function anunciosDaEspecie(speciesId, moeda) {
    return [...anuncios.values()].filter(a => a.alvo && a.alvo.speciesId === speciesId && a.moeda === moeda);
  }

  if (window.PIConfig) window.PIConfig.aoMudar(agendar);

  window.PIVitrine = { anunciosDaEspecie };
})();
