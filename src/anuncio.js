/*
 * Smart Market — painel de preços nas telas "Novo anúncio" e "Editar anúncio" do RMT
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Quando a folha de anúncio do jogo mostra a tela de preço (#cm-preco dentro de
 * .cm-folha), põe ao lado da caixa um painel de tenda com o preço estimado na moeda
 * escolhida (com o líq e botões "usar") e as abas "À venda" / "Vendidos".
 * O "usar" só preenche o campo de preço: publicar ou salvar é sempre com o usuário.
 */
(function () {
  'use strict';
  if (window.PIPainelAnuncio) return;

  const L = window.PIAnuncioLogica;
  const M = window.PIMotor;
  const LARGURA = 360; // os dois painéis (ficha à esquerda, preços à direita) têm a mesma largura
  const MAX_LINHAS = 8;
  const MOEDA = window.PIUi.MOEDA;

  let escolha = null; // { id, dados } do Pokémon escolhido no passo "Qual pokemon?"
  let edicao = null;  // { id, dados } do card de "Meus anúncios" cujo Editar foi clicado (ou { item: true })
  let painel = null;  // estado do painel aberto
  let agendado = null;

  // ---------- qual Pokémon está sendo anunciado ----------
  function lerCard(card) {
    const id = Number(String(card.getAttribute('data-chave') || '').replace('cm-sel', ''));
    const txt = card.innerText || card.textContent || '';
    const num = re => { const m = txt.match(re); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : NaN; };
    const nome = (card.querySelector('.mk-nome') || {}).textContent;
    return { id, dados: { nome: nome ? nome.trim() : '', level: num(/Nv\s*([\d.]+)/), potencia: num(/\bP(\d)\b/), nota: num(/\bN\s*([\d.,]+)/) } };
  }

  /** Card de "Meus anúncios": não traz o id; o Pokémon vem do índice pelo nome, nível, Nota e potência. */
  function lerCardMeus(card) {
    if (!card.classList.contains('poke')) return { item: true };
    const txt = s => ((card.querySelector(s) || {}).textContent || '').trim();
    const num = (s, re) => { const m = txt(s).match(re); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : NaN; };
    const dados = { nome: txt('.cm-nome-txt'), level: num('.cm-sub', /Nv\s*([\d.]+)/), potencia: num('.cm-pot', /P(\d)/), nota: num('.pk-selo-n', /([\d.,]+)/) };
    const lista = window.PIWs.pokemonsIndexados ? window.PIWs.pokemonsIndexados() : [];
    const achado = L.acharNoIndice(lista, dados);
    return { id: achado ? achado.id : null, dados };
  }

  function aoEscolher(ev) {
    if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
    const alvo = ev.target && ev.target.closest ? ev.target : null;
    if (!alvo) return;
    const card = alvo.closest('[data-chave^="cm-sel"]');
    if (card) { escolha = lerCard(card); return; }
    const botao = alvo.closest('.cm-card .cm-btn');
    if (botao && !botao.classList.contains('perigo') && botao.textContent.trim() === 'Editar') edicao = lerCardMeus(botao.closest('.cm-card'));
  }
  document.addEventListener('click', aoEscolher, true);
  document.addEventListener('keydown', aoEscolher, true);

  /** Editar anúncio: a folha tem o botão Salvar (#cm-salvar) em vez de Publicar. */
  const ehEdicao = folha => !!folha.querySelector('#cm-salvar');
  const fonte = folha => (ehEdicao(folha) ? edicao : escolha);

  function brutoDoAnuncio(folha) {
    const f = fonte(folha);
    return (f && f.id != null && window.PIWs.pokemon(f.id)) || null;
  }

  function alvoDoAnuncio(folha) {
    const escolha = fonte(folha);
    const bruto = brutoDoAnuncio(folha);
    if (bruto) return M.normalizarAlvo(bruto);
    // Sem o índice do WebSocket: usa o que o card e a vitrine da folha mostram
    const palco = folha.querySelector('.dlg-palco');
    const linhas = palco ? palco.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [];
    const d = (escolha && escolha.dados) || {};
    const nivel = d.level || Number((linhas.find(l => /^Nv\s*\d/.test(l)) || '').replace(/\D/g, ''));
    const nome = d.nome || linhas.find(l => !/^Nv\s*\d/.test(l)) || '';
    if (!nome) return null;
    return {
      id: escolha && escolha.id != null ? escolha.id : null, speciesId: null, nome, level: nivel || 1,
      nota: isFinite(d.nota) ? d.nota : NaN, potencia: isFinite(d.potencia) ? d.potencia : 0,
      shiny: false, aoe: false, zmove: false, mega: /^mega\s/i.test(nome), parcial: true,
    };
  }

  // ---------- formatação ----------
  const fmt = (x, m) => window.PIUi.fmtPreco(x, m);
  const esc = s => window.PIUi.esc(s);
  const D = () => window.PIUi.DICA;
  const pct = x => window.PIUi.fmtDif(x);

  function resumoPokemon(p) {
    const extras = [p.shiny ? '✨' : '', p.aoe ? 'AoE' : '', p.zmove ? 'Z' : '', p.mega ? 'M' : ''].filter(Boolean).join(' ');
    return `Nv ${p.level} · N ${window.PIUi.fmtNumero(p.nota, 2)} · P${p.potencia}${extras ? ' · ' + extras : ''}`;
  }

  // ---------- montar / desmontar ----------
  function criarElemento() {
    const el = document.createElement('div');
    el.className = 'pp-anuncio';
    el.innerHTML = `
      <div class="pp-toldo"></div>
      <div class="pp-an-topo"><b>Tabela de preços</b> <span class="pp-an-sub"></span></div>
      <div class="pp-an-base"></div>
      <div class="pp-an-preco"></div>
      <div class="pp-an-abas">
        <button type="button" data-aba="avenda" title="${esc(D().avenda)}">À venda</button>
        <button type="button" data-aba="vendidos" title="${esc(D().vendidos)}">Vendidos</button>
      </div>
      <div class="pp-an-lista"></div>
      <div class="pp-an-avisos"></div>`;
    el.addEventListener('click', ev => {
      const aba = ev.target.closest('[data-aba]');
      if (aba) { ev.stopPropagation(); painel.aba = aba.getAttribute('data-aba'); desenharLista(); return; }
      const usar = ev.target.closest('.pp-usar');
      if (usar && !usar.disabled) { ev.stopPropagation(); usarValor(Number(usar.getAttribute('data-valor'))); }
    });
    return el;
  }

  function montar(folha, input) {
    const alvo = alvoDoAnuncio(folha);
    if (!alvo) return;
    const on = folha.querySelector('.cm-moeda.on');
    const moedaJogo = on ? on.getAttribute('data-moeda') : 'gold';
    painel = {
      folha, input, alvo, el: criarElemento(), editando: ehEdicao(folha),
      moeda: L.moedaPainel(alvo, moedaJogo), aba: 'avenda', geracao: 0,
      resultado: null, vendidos: [], avenda: null, avendaErro: null,
      avendaPorMoeda: {},   // moeda -> { itens, erro, visto } (uma consulta por moeda)
      listarDoJogo: window.PIWs.ultimoListarDoJogo ? window.PIWs.ultimoListarDoJogo() : null,
      consultas: [],        // promessas das consultas de vitrine feitas por este painel
    };
    folha.appendChild(painel.el);
    painel.ficha = criarFicha(alvo, brutoDoAnuncio(folha));
    folha.appendChild(painel.ficha);
    posicionar();
    painel.obsMoeda = new MutationObserver(() => {
      const on = folha.querySelector('.cm-moeda.on');
      const m = L.moedaPainel(alvo, on ? on.getAttribute('data-moeda') : painel.moeda);
      if (m !== painel.moeda) { painel.moeda = m; atualizar(); }
    });
    painel.obsMoeda.observe(folha, { attributes: true, subtree: true, attributeFilter: ['class'] });
    window.addEventListener('resize', posicionar);
    atualizar();
  }

  function desmontar() {
    if (!painel) return;
    const p = painel;
    // A consulta de vitrine troca a vitrine do jogo atrás da folha: devolve a do usuário
    if (p.consultas.length && p.listarDoJogo && window.PIWs.restaurarVitrine) {
      Promise.allSettled(p.consultas).then(() => window.PIWs.restaurarVitrine(p.listarDoJogo)).catch(() => {});
    }
    painel.geracao++;
    if (painel.obsMoeda) painel.obsMoeda.disconnect();
    window.removeEventListener('resize', posicionar);
    painel.el.remove();
    if (painel.ficha) painel.ficha.remove();
    painel = null;
  }

  function posicionar() {
    if (!painel) return;
    const caixa = painel.folha.querySelector('.cm-folha-caixa');
    if (!caixa) return;
    const rc = caixa.getBoundingClientRect();
    const rf = painel.folha.getBoundingClientRect();
    const p = L.posicaoPainel(rc, rf, LARGURA);
    // mesma altura da caixa do jogo quando fica ao lado; embaixo, só limita a altura
    const altura = p.modo === 'abaixo' ? { height: '', maxHeight: rc.height + 'px' } : { height: rc.height + 'px', maxHeight: '' };
    Object.assign(painel.el.style, { left: p.left + 'px', top: p.top + 'px', width: LARGURA + 'px' }, altura);
    painel.el.dataset.modo = p.modo;
    if (painel.ficha) {
      const pf = L.posicaoPainel(rc, rf, LARGURA, undefined, 'esquerda');
      const cabe = p.modo === 'direita' && pf.modo === 'esquerda';
      painel.ficha.hidden = !cabe;
      if (cabe) Object.assign(painel.ficha.style, { left: pf.left + 'px', top: pf.top + 'px', width: LARGURA + 'px', height: rc.height + 'px' });
    }
  }

  // ---------- ficha resumida do Pokémon (à esquerda) ----------
  const COR_TIPO = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
  };

  function criarFicha(alvo, bruto) {
    const el = document.createElement('div');
    el.className = 'pp-anuncio pp-an-ficha';
    // como na ficha do jogo: sempre 3 casas (1,200 / 4,610)
    const n = (x, c) => (isFinite(x) ? Number(x).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) : '—');
    const tipos = ((bruto && bruto.tipos) || []).map(t => {
      const k = String(t).toLowerCase();
      return `<span class="pp-fi-tipo" style="background:${COR_TIPO[k] || '#777'}">${esc(k.toUpperCase())}</span>`;
    }).join('');
    const selos = [alvo.shiny ? '✨ SHINY' : '', alvo.aoe ? 'TM AoE' : '', alvo.zmove ? 'Z-MOVE' : ''].filter(Boolean)
      .map(s => `<span class="pp-fi-selo">${s}</span>`).join('');
    const faixa = L.faixaNota(alvo.nota);
    // cls: cor do cartão — pp-fi-t1…t5 (escala de raridade do jogo) ou pp-fn0…9 (faixa da Nota)
    const cartao = (rot, valor, extra, dica, cls) =>
      `<div class="pp-fi-cartao ${cls || ''}" title="${esc(dica)}"><span>${rot}</span><b>${valor}</b>${extra ? '<i>' + extra + '</i>' : ''}</div>`;
    const tem = x => isFinite(x) && x > 0;
    const t = (tipo, v) => (tem(v) ? 'pp-fi-t' + L.nivelSelo(tipo, v) : '');
    const iNota = L.indiceFaixaNota(alvo.nota);
    el.innerHTML = `
      <div class="pp-toldo"></div>
      <div class="pp-fi-cab">
        <div class="pp-fi-nome">${alvo.shiny ? '✨ ' : ''}${esc(alvo.nome)}</div>
        <div class="pp-fi-linha"><span class="pp-fi-nv">Nv ${alvo.level}</span>${tipos}</div>
        ${selos ? '<div class="pp-fi-linha">' + selos + '</div>' : ''}
      </div>
      <div class="pp-fi-cartoes">
        ${cartao('Potência', tem(alvo.potencia) ? 'P' + alvo.potencia : '—', '', D().pot, t('potencia', alvo.potencia))}
        ${cartao('Qualidade', n(alvo.quality, 3), '', 'Qualidade (0,8 a 1,8): sorteada na captura, multiplica todos os stats.', t('qualidade', alvo.quality))}
        ${cartao('IV somado', tem(alvo.ivTotal) ? alvo.ivTotal + '<small>/192</small>' : '—', '', 'Soma dos seis IVs (1 a 32 cada). Nunca muda.', t('iv', alvo.ivTotal))}
        ${cartao('Nota', n(alvo.nota, 3), faixa, D().nota, iNota >= 0 ? 'pp-fn' + iNota : '')}
        ${cartao('Poder (ranking)', bruto && isFinite(bruto.poder) ? '⚔ ' + bruto.poder : '—', '', 'Poder (⚔) do ranking "Pokemon forte": sobe com nível, refino e evolução. Não é o "Poder no PvE" da ficha oficial.')}
      </div>
      ${alvo.parcial ? '<div class="pp-an-avisos"><div class="pp-aviso">Dados lidos da tela: AoE, Z-Move e shiny não foram detectados.</div></div>' : ''}
      <div class="pp-fi-rodape">ficha resumida · Smart Market</div>`;
    return el;
  }

  // ---------- dados ----------
  async function atualizar() {
    const p = painel;
    const g = ++p.geracao;
    const moeda = p.moeda;
    desenharTopo();
    p.resultado = null; p.vendidos = []; p.avenda = null; p.avendaErro = null;
    desenharPreco(); desenharLista();
    const faixa = M.faixaMercado(p.alvo);
    if (faixa.faltaNota) { desenharForaDaFaixa(); return; }

    const carregar = async () => {
      const res = await window.PIUi.calcular(p.alvo, moeda);
      const vendas = await window.PIStore.vendasPorEspecie(p.alvo.speciesId, p.alvo.nome);
      if (painel !== p || p.geracao !== g) return false;
      p.resultado = res;
      p.vendidos = L.ordenarVendidos(p.alvo, vendas, moeda);
      desenharPreco(); desenharLista();
      return true;
    };
    if (!(await carregar())) return;
    carregarAVenda(p, moeda);
    // Vendas novas da espécie (mesma busca do quadro da ficha; respeita os 10 min e o ritmo)
    if (window.PIWs.conectado()) {
      try {
        const r = await window.PISync.sincronizar(p.alvo.nome, moeda);
        if (r && !r.pulou) await carregar();
      } catch (e) {
        if (painel === p && p.geracao === g) avisar('não deu para atualizar as vendas agora (' + e.message + ') — usando o cache');
      }
    }
  }

  /** Anúncios abertos da espécie nesta moeda: uma consulta por moeda; recusada → os já vistos. */
  async function carregarAVenda(p, moeda) {
    const ja = p.avendaPorMoeda[moeda];
    if (ja) { aplicarAVenda(p, moeda); return; }
    const sid = p.alvo.speciesId;
    // No Editar, atrás da folha está a lista de "Meus anúncios": uma consulta de vitrine a trocaria.
    // Mostra só os anúncios desta espécie que a vitrine (vitrine.js) já viu.
    if (p.editando && sid != null) {
      const vistos = window.PIVitrine && window.PIVitrine.anunciosDaEspecie ? window.PIVitrine.anunciosDaEspecie(sid, moeda) : [];
      p.avendaPorMoeda[moeda] = { itens: vistos, erro: 'no Editar a lista não é atualizada', visto: true };
      aplicarAVenda(p, moeda);
      return;
    }
    if (sid == null) {
      p.avendaPorMoeda[moeda] = { itens: [], erro: 'não deu para identificar a espécie deste anúncio' };
      aplicarAVenda(p, moeda);
      return;
    }
    p.avendaPorMoeda[moeda] = { carregando: true };
    const consulta = window.PIWs.consultarVitrine({ especieId: sid, moeda });
    p.consultas.push(consulta);
    try {
      const j = await consulta;
      const itens = (j.linhas || [])
        .filter(l => l && l.tipo === 'pokemon' && l.ficha && Number(l.preco) > 0)
        .map(l => ({ id: l.id, preco: Number(l.preco), moeda: l.moeda, alvo: M.normalizarAlvo(l.ficha) }));
      p.avendaPorMoeda[moeda] = { itens };
    } catch (e) {
      const vistos = window.PIVitrine && window.PIVitrine.anunciosDaEspecie ? window.PIVitrine.anunciosDaEspecie(sid, moeda) : [];
      p.avendaPorMoeda[moeda] = { itens: vistos, erro: e.message, visto: true };
    }
    aplicarAVenda(p, moeda);
  }

  function aplicarAVenda(p, moeda) {
    if (painel !== p || p.moeda !== moeda) return; // o usuário já fechou ou trocou de moeda
    const d = p.avendaPorMoeda[moeda];
    if (!d || d.carregando) return;
    p.avenda = L.ordenarAVenda(p.alvo, d.itens, moeda);
    p.avendaErro = d.erro ? d.erro + (d.visto ? (d.itens.length ? ' — mostrando anúncios já vistos' : ' — nenhum anúncio desta espécie visto ainda') : '') : null;
    desenharLista();
  }

  // ---------- desenho ----------
  function desenharTopo() {
    const m = MOEDA[painel.moeda];
    painel.el.querySelector('.pp-an-sub').innerHTML = `· ${esc(painel.alvo.nome)} em ${m.icone} ${m.nome}`;
    const av = painel.el.querySelector('.pp-an-avisos');
    av.innerHTML = painel.alvo.parcial
      ? '<div class="pp-aviso">AoE, Z-Move e shiny não foram detectados neste anúncio.</div>' : '';
  }

  function avisar(texto) {
    const av = painel.el.querySelector('.pp-an-avisos');
    const d = document.createElement('div');
    d.className = 'pp-aviso';
    d.textContent = texto;
    av.appendChild(d);
  }

  function desenharForaDaFaixa() {
    const n = isFinite(painel.alvo.nota) ? window.PIUi.fmtNumero(painel.alvo.nota, 3) : '?';
    painel.el.querySelector('.pp-an-preco').innerHTML =
      `<div class="pp-fora-msg" title="${esc(D().faixa)}"><b>Não pode ser anunciado no Mercado.</b>O RMT só aceita Pokémon com Nota 3,5+ e Nv 50+, e este tem Nota ${n}.</div>`;
    painel.el.querySelector('.pp-an-base').textContent = '';
    painel.el.querySelector('.pp-an-lista').innerHTML = '';
  }

  function desenharPreco() {
    const box = painel.el.querySelector('.pp-an-preco');
    const base = painel.el.querySelector('.pp-an-base');
    const res = painel.resultado;
    const moeda = painel.moeda;
    if (!res) { box.innerHTML = '<div class="pp-an-vazio">consultando vendas…</div>'; base.textContent = ''; return; }
    if (!res.suficiente) {
      box.innerHTML = `<div class="pp-an-vazio">${res.vendasEspecie ? res.vendasEspecie + ' venda(s) desta espécie em ' + MOEDA[moeda].nome + ' — poucas para estimar' : 'sem vendas desta espécie em ' + MOEDA[moeda].nome}</div>`;
      base.textContent = '';
      return;
    }
    const est = res.estimativa ? '≈ ' : '';
    base.textContent = res.estimativa
      ? `≈ Estimativa pela Nota com ${res.vendasClasse} vendas de outras espécies — erra bastante`
      : `Baseado em ${res.vendasEspecie} vendas desta espécie nos últimos 30 dias (~${window.PIUi.fmtNumero(res.nEfetivo, 1)} parecidas)`;
    base.title = res.estimativa ? D().estimativa : '';
    const col = (rot, dica, x, cls) => {
      const v = L.valorUsar(x);
      const travado = painel.input.disabled || painel.input.readOnly;
      return `<div class="pp-an-col">
        <span class="pp-an-rot" title="${esc(dica)}">${rot}</span>
        <b class="${cls}">${cls === 'pp-q2' ? est : ''}${fmt(x, moeda)}</b>
        <span class="pp-an-liq" title="${esc(moeda === 'orb' ? D().liquidoGemas : D().liquidoCoins)}">líq ${M.formatarValor(M.liquidoVendedor(v, moeda), moeda)}</span>
        <button type="button" class="pp-usar" data-valor="${v}" title="${esc(travado ? D().travado : D().usar)}"${travado ? ' disabled' : ''}>usar ${fmt(v, moeda)}</button>
      </div>`;
    };
    box.innerHTML = col('Vender rápido', D().venderRapido, res.venderRapido, 'pp-q1') +
      col('Preço justo', D().precoJusto, res.precoJusto, 'pp-q2') +
      col('Esperar', D().esperar, res.esperar, 'pp-q3');
    box.classList.toggle('pp-estimativa', !!res.estimativa);
  }

  function desenharLista() {
    if (!painel) return;
    painel.el.querySelectorAll('[data-aba]').forEach(b => b.classList.toggle('on', b.getAttribute('data-aba') === painel.aba));
    const lista = painel.el.querySelector('.pp-an-lista');
    const moeda = painel.moeda;
    if (painel.aba === 'vendidos') {
      const vs = painel.vendidos.slice(0, MAX_LINHAS);
      lista.innerHTML = vs.length
        ? '<table>' + vs.map(v => `<tr><td title="${esc(D().nota)}">${esc(resumoPokemon(v))}</td><td title="${esc(D().preco)}">${MOEDA[moeda].icone} ${fmt(v.preco, moeda)}</td><td title="${esc(D().ha)}">${window.PIUi.fmtIdade(v.em)}</td></tr>`).join('') + '</table>'
        : `<div class="pp-an-vazio">Nenhuma venda desta espécie em ${MOEDA[moeda].nome} nos últimos 30 dias.</div>`;
      return;
    }
    if (!painel.avenda) { lista.innerHTML = '<div class="pp-an-vazio">carregando…</div>'; return; }
    const motivo = painel.avendaErro ? `<div class="pp-an-motivo">${esc(painel.avendaErro)}</div>` : '';
    const res = painel.resultado;
    const as = painel.avenda.slice(0, MAX_LINHAS);
    lista.innerHTML = as.length
      ? '<table>' + as.map(a => {
          let cls = '', dif = '';
          if (res && res.suficiente) {
            const d = a.preco / res.precoJusto - 1;
            dif = pct(d);
            cls = a.preco <= res.venderRapido ? 'pp-vit-pechincha' : a.preco > res.esperar ? 'pp-vit-caro' : 'pp-vit-justo';
          }
          const visto = a.vistoEm ? ` title="visto há ${esc(window.PIUi.fmtIdade(a.vistoEm))}"` : '';
          return `<tr${visto}><td>${esc(resumoPokemon(a.alvo))}</td><td>${MOEDA[moeda].icone} ${fmt(a.preco, moeda)}</td><td class="${cls}">${dif}</td></tr>`;
        }).join('') + '</table>'
      : (painel.avendaErro ? '' : `<div class="pp-an-vazio">Nenhum anúncio desta espécie em ${MOEDA[moeda].nome} agora.</div>`);
    lista.innerHTML = motivo + lista.innerHTML;
  }

  // ---------- "usar" ----------
  function usarValor(v) {
    if (!painel || !(v >= 2)) return;
    const inp = painel.input;
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- observar a folha ----------
  /**
   * A tela de preço de ITEM (pedras, tokens…) usa o mesmo #cm-preco. Ela tem "Quantos anunciar",
   * e o palco não mostra nível. O controle deslizante não serve para distinguir: o Editar de
   * Pokémon também tem um (a estadia na feira). O id do card escolhido também não serve (pode
   * ser numérico nos dois casos).
   */
  function telaDeItem(folha) {
    const form = folha.querySelector('.cm-form') || folha;
    if (/quantos anunciar/i.test(form.textContent || '')) return true;
    const palco = folha.querySelector('.dlg-palco');
    // textContent junta "Scizor" e "Nv 100" sem espaço: sem \b antes do Nv
    return !!palco && !/Nv\s*\d/.test(palco.textContent || '');
  }

  function verificar() {
    const input = document.querySelector('.cm-folha #cm-preco');
    const folha = input && input.closest('.cm-folha');
    const visivel = folha && folha.getClientRects().length > 0;
    // no Editar, só com o card de Pokémon clicado em "Meus anúncios" (o de item não abre painel)
    const ehPokemon = folha && !telaDeItem(folha) && !(ehEdicao(folha) && (!edicao || edicao.item));
    const ligado = !window.PIConfig || window.PIConfig.ligado('painel'); // pode ser desligado no popup
    if (painel && (!ligado || !painel.input.isConnected || painel.input !== input || !visivel || !ehPokemon)) desmontar();
    if (ligado && !painel && input && visivel && ehPokemon) montar(folha, input);
  }

  new MutationObserver(muts => {
    if (painel && muts.every(m => painel.el.contains(m.target))) return;
    // No máximo uma checagem a cada 120 ms, mas sempre acontece: o jogo muda a tela o tempo
    // todo (XP, chat), e uma espera "até parar de mudar" nunca terminaria
    if (agendado) return;
    agendado = setTimeout(() => { agendado = null; verificar(); }, 120);
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (window.PIConfig) window.PIConfig.aoMudar(verificar);

  window.PIPainelAnuncio = {}; // só marca que o painel já foi carregado
})();
