/*
 * Smart Market — janela "Precificar" (análise de preço do Pokémon)
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Aberta pelo botão "Precificar" do quadro de preço da ficha. Mostra o Preço de mercado em
 * destaque com uma barra onde aparecem as vendas parecidas, frases em português claro,
 * a confiança medida de verdade (o motor refeito para as vendas recentes da espécie) e
 * um aviso quando as vendas se dividem em dois grupos de preço. Usa só o cache: nenhuma
 * consulta nova ao jogo, a não ser o botão "Buscar as vendas deste Pokémon" (uma consulta pelo
 * "#id", só com o clique). Também simula outro nível, AoE e Z-Move (14/11/2026).
 */
(function () {
  'use strict';
  if (window.PIPrecificar) return;

  const A = window.PIAnalise;
  const M = window.PIMotor;
  const MOEDA = window.PIUi.MOEDA;

  let janela = null; // { el, alvo, moeda, geracao, res, vendas, sim, hist }
  // histórico pelo "#id" já buscado nesta sessão (id -> { vendas, temMais }): a mesma busca não se repete
  const historicos = new Map();

  const fmt = (x, m) => window.PIUi.fmtPreco(x, m);
  const num = (x, c) => window.PIUi.fmtNumero(x, c);
  const esc = s => window.PIUi.esc(s);
  const pct = x => Math.round(x * 100) + '%';

  // ---------- abrir / fechar ----------
  /** esperar: a busca de vendas do quadro da ficha, se ainda está rodando; a análise espera ela. */
  function abrir(alvo, esperar) {
    fechar();
    const el = document.createElement('div');
    el.className = 'pp-prec-fundo';
    el.innerHTML = `
      <div class="pp-prec" role="dialog" aria-label="Precificar ${esc(alvo.nome)}">
        <div class="pp-toldo"></div>
        <div class="pp-prec-topo">
          <div><b>Precificar</b> <span class="pp-prec-sub">· ${esc(alvo.nome)} · Nv ${alvo.level}${alvo.shiny ? ' · ✨ shiny' : ''}</span></div>
          <button type="button" class="pp-prec-ajuda-bt" aria-expanded="false" title="O que quer dizer cada termo da janela">? Como ler</button>
          <div class="pp-prec-moedas">
            <button type="button" data-moeda="orb">${MOEDA.orb.icone} Gemas</button>
            <button type="button" data-moeda="gold"${alvo.shiny ? ' disabled title="Shiny só vende em Gemas"' : ''}>${MOEDA.gold.icone} Coins</button>
          </div>
          <button type="button" class="pp-prec-fechar" title="Fechar">✕</button>
        </div>
        <div class="pp-prec-ajuda" hidden>
          <div class="pp-prec-titulo">Como ler esta janela</div>
          ${window.PIGlossario ? window.PIGlossario.html() : ''}
        </div>
        <div class="pp-prec-corpo"><div class="pp-an-vazio">calculando…</div></div>
        <div class="pp-prec-rodape">análise com as vendas já guardadas · Smart Market</div>
      </div>`;
    el.addEventListener('click', ev => {
      if (ev.target === el || ev.target.closest('.pp-prec-fechar')) { fechar(); return; }
      const ver = ev.target.closest('.pp-prec-vermais');
      if (ver) {
        const bloco = ver.closest('.pp-prec-vendas');
        const aberto = bloco.classList.toggle('pp-prec-todas');
        ver.textContent = aberto ? 'mostrar menos' : `ver as ${bloco.querySelectorAll('tbody tr').length - 1} vendas`;
        return;
      }
      // "? Como ler" abre/fecha o glossário; "o que é isso?" abre já no termo daquele bloco
      if (ev.target.closest('.pp-prec-ajuda-bt')) { mostrarAjuda(el, null, el.querySelector('.pp-prec-ajuda').hidden); return; }
      const oque = ev.target.closest('.pp-prec-oque');
      if (oque) { mostrarAjuda(el, oque.getAttribute('data-termo'), true); return; }
      if (ev.target.closest('.pp-prec-hist-buscar')) { buscarHistorico(janela); return; }
      if (ev.target.closest('.pp-prec-sim-volta')) { voltarSim(janela); return; }
      const extra = ev.target.closest('.pp-prec-sim-extra');
      if (extra) { const on = extra.getAttribute('aria-pressed') !== 'true'; extra.setAttribute('aria-pressed', String(on)); aoMudarSim(janela); return; }
      const b = ev.target.closest('[data-moeda]');
      if (b && !b.disabled) { janela.moeda = b.getAttribute('data-moeda'); desenhar(); }
    });
    // simulação: recalcula enquanto digita (com uma pausa curta) e ao marcar os extras
    const aoMudar = ev => { if (ev.target.closest('.pp-prec-sim')) aoMudarSim(janela); };
    el.addEventListener('input', aoMudar);
    el.addEventListener('change', aoMudar);
    // as teclas digitadas nos campos da janela não vão para o jogo (atalhos)
    el.addEventListener('keydown', ev => { if (ev.key !== 'Escape' && ev.target.matches('input')) ev.stopPropagation(); });
    document.body.appendChild(el);
    const caixa = el.querySelector('.pp-prec');
    window.PIUi.arrastavel(caixa, [caixa.querySelector('.pp-toldo'), caixa.querySelector('.pp-prec-topo')]);
    janela = { el, alvo, moeda: 'orb', geracao: 0, esperar: esperar || null, // abre em Gemas (shiny só vende em Gemas)
      sim: simInicial(alvo), hist: historicos.get(String(alvo.id)) || null };
    document.addEventListener('keydown', aoTeclar, true);
    desenhar();
  }

  /** Abre (ou fecha) o "Como ler"; com termo, rola até ele e o destaca por um instante. */
  function mostrarAjuda(el, termo, abrir) {
    const ajuda = el.querySelector('.pp-prec-ajuda');
    ajuda.hidden = !abrir;
    el.querySelector('.pp-prec-ajuda-bt').setAttribute('aria-expanded', String(abrir));
    ajuda.querySelectorAll('.pp-gl-destaque').forEach(x => x.classList.remove('pp-gl-destaque'));
    if (!abrir) return;
    const alvos = termo ? ajuda.querySelectorAll(`[data-termo="${termo}"]`) : [];
    ajuda.scrollTop = 0;
    if (alvos.length) {
      alvos.forEach(x => x.classList.add('pp-gl-destaque'));
      ajuda.scrollTop = alvos[0].offsetTop - ajuda.offsetTop - 8;
    }
  }
  const oQue = termo => ` <button type="button" class="pp-prec-oque" data-termo="${termo}">o que é isso?</button>`;

  function fechar() {
    if (!janela) return;
    janela.geracao++;
    janela.el.remove();
    janela = null;
    document.removeEventListener('keydown', aoTeclar, true);
  }

  function aoTeclar(ev) {
    if (ev.key === 'Escape' && janela) { ev.stopPropagation(); fechar(); }
  }

  // ---------- conteúdo ----------
  async function desenhar() {
    const j = janela;
    const g = ++j.geracao;
    const { alvo, moeda } = j;
    j.el.querySelectorAll('[data-moeda]').forEach(b => b.classList.toggle('on', b.getAttribute('data-moeda') === moeda));
    const corpo = j.el.querySelector('.pp-prec-corpo');
    // Como no quadro: nada de análise com metade das vendas enquanto a busca roda
    if (j.esperar) {
      corpo.innerHTML = `<div class="pp-an-vazio" title="${esc(window.PIUi.DICA.carregando)}"><span class="pp-girando" aria-hidden="true"></span> carregando vendas… a análise aparece quando a busca terminar.</div>`;
      await j.esperar;
      if (janela !== j || j.geracao !== g) return;
      j.esperar = null;
    }
    corpo.innerHTML = '<div class="pp-an-vazio">calculando…</div>';

    const [res, vendas] = await Promise.all([
      window.PIUi.calcular(alvo, moeda),
      window.PIStore.vendasPorEspecie(alvo.speciesId, alvo.nome),
    ]);
    if (janela !== j || j.geracao !== g) return;
    const agora = Date.now();
    const pontos = A.pontosVendas(alvo, vendas, moeda, agora);
    const grupos = A.detectarGrupos(pontos);
    const conf = A.confiancaEspecie(vendas.filter(v => !!v.shiny === !!alvo.shiny), moeda, agora);
    j.res = res; j.vendas = vendas;
    corpo.innerHTML = htmlPreco(alvo, moeda, res, pontos) + htmlVendas(alvo, res, pontos, moeda) +
      htmlConfianca(conf, res) +
      // grupos e "grupo só" falam do preço de mercado: sem preço, não aparecem (os pontos da barra usam um
      // corte de peso menor que o do motor, e podiam sobrar 2 vendas longe para "formar um grupo só")
      (!res || !res.suficiente ? '' : grupos ? htmlGrupos(alvo, res, grupos, moeda) : htmlUmGrupo(A.maiorSalto(pontos), moeda)) +
      htmlSimular(j) + htmlHistorico(j);
    if (window.PIDinheiro) window.PIDinheiro.pintar(corpo);
  }

  // ---------- vendas que mais pesaram ----------
  const VISIVEIS = 10;
  const extras = x => [x.aoe ? 'AoE' : '', x.zmove ? 'Z' : '', x.mega ? 'Mega' : ''].filter(Boolean).join(' · ') || '—';
  const comparar = (v, seu, folga) => !isFinite(seu) || !isFinite(v) ? '' : v > seu + folga ? ' class="pp-prec-acima"' : v < seu - folga ? ' class="pp-prec-abaixo"' : '';

  const DICA_MESMO = 'Esta venda é deste mesmo Pokémon: ele já foi vendido antes e agora está de novo à venda (revenda). Pelo número do Pokémon, não pela semelhança.';

  function htmlVendas(alvo, res, pontos, moeda) {
    if (!res || !res.suficiente || !pontos.length) return '';
    const linhas = pontos.map((p, i) => `
      <tr class="${i >= VISIVEIS ? 'pp-prec-extra' : ''}${p.mesmo ? ' pp-mesmo' : ''}"${p.mesmo ? ` title="${esc(DICA_MESMO)}"` : ''}>
        <td><span class="pp-prec-peso" title="parecida ${pct(p.peso)} com esta ficha"><i style="width:${pct(p.peso)}"></i></span></td>
        <td class="pp-prec-valor">${fmt(p.preco, moeda)}</td>
        <td${comparar(p.level, alvo.level, alvo.level * 0.1)}>${p.level}</td>
        <td>P${p.potencia}</td>
        <td>${p.ivTotal || '—'}</td>
        <td>${p.quality ? num(p.quality, 3) : '—'}</td>
        <td${comparar(p.nota, alvo.nota, 0.02)}><b>${num(p.nota, 3)}</b></td>
        <td>${p.mesmo ? '<span class="pp-mesmo-tag">este mesmo Pokémon</span> ' : ''}${extras(p)}</td>
        <td>${window.PIUi.fmtIdade(p.em)}</td>
      </tr>`).join('');
    const seu = `
      <tr class="pp-prec-seu">
        <td>esta ficha</td>
        <td class="pp-prec-valor" title="o Preço de mercado calculado para esta ficha"><small>mercado</small> ${fmt(res.precoJusto, moeda)}</td>
        <td>${alvo.level}</td>
        <td>${isFinite(alvo.potencia) && alvo.potencia ? 'P' + alvo.potencia : '—'}</td>
        <td>${alvo.ivTotal || '—'}</td>
        <td>${alvo.quality ? num(alvo.quality, 3) : '—'}</td>
        <td><b>${isFinite(alvo.nota) ? num(alvo.nota, 3) : '—'}</b></td>
        <td>${alvo.parcial ? '?' : extras(alvo)}</td>
        <td></td>
      </tr>`;
    const mais = pontos.length > VISIVEIS
      ? `<button type="button" class="pp-prec-vermais">ver as ${pontos.length} vendas</button>` : '';
    return `
      <div class="pp-prec-bloco pp-prec-vendas">
        <div class="pp-prec-titulo">Vendas que mais pesaram no preço${oQue('parecidas')}</div>
        <p><b>O que conta:</b> pesa mais a <b>Nota</b> — ela já resume IV, Qualidade e Potência, por isso esses três não contam sozinhos. Depois vem o <b>nível</b>. Uma venda com AoE, Z-Move ou Mega diferente desta ficha conta só 30%, e uma venda de 5 dias atrás conta metade de uma de hoje.</p>
        <table>
          <thead><tr><th>Parecida</th><th>Preço</th><th>Nv</th><th>Pot.</th><th>IV</th><th>Qual.</th><th>Nota</th><th>Extras</th><th>Há</th></tr></thead>
          <tbody>${seu}${linhas}</tbody>
        </table>
        <div class="pp-prec-legenda"><span class="pp-prec-acima">acima desta ficha</span> · <span class="pp-prec-abaixo">abaixo desta ficha</span> (Nota e nível)${mais ? ' · ' + mais : ''}</div>
      </div>`;
  }

  function htmlPreco(alvo, moeda, res, pontos) {
    if (!res || !res.suficiente) {
      return `<div class="pp-prec-bloco"><div class="pp-an-vazio">${res && res.soGemas ? 'Shiny só vende em Gemas.'
        : `Sem vendas${alvo.shiny ? ' shiny' : ''} desta espécie parecidas o bastante em ${MOEDA[moeda].nome} nos últimos 30 dias para um preço. A extensão não estima pelo preço de outras espécies: a espécie pesa muito no preço.`}</div></div>`;
    }
    const liquidoJusto = M.liquidoVendedor(window.PIAnuncioLogica ? window.PIAnuncioLogica.valorUsar(res.precoJusto) : res.precoJusto, moeda);
    const valores = pontos.map(p => p.preco).concat([res.venderRapido, res.precoJusto, res.esperar]);
    const pos = A.escalaBarra(valores);
    const pontosHtml = pontos.slice().reverse().map(p => {
      const tam = 5 + Math.round(p.peso * 7);
      return `<i class="pp-prec-ponto" style="left:${(pos(p.preco) * 100).toFixed(2)}%;width:${tam}px;height:${tam}px;opacity:${(0.35 + 0.65 * p.peso).toFixed(2)}" title="${esc(`${fmt(p.preco, moeda)} · Nv ${p.level} · Nota ${num(p.nota, 3)}${p.aoe ? ' · AoE' : ''}${p.zmove ? ' · Z-Move' : ''}`)}"></i>`;
    }).join('');
    // nas pontas da barra o rótulo vai para o lado de dentro, para não ser cortado
    const marca = (x, cls, rot) => {
      const p = pos(x);
      const borda = (cls === 'pp-prec-q1' && p < 0.15) ? ' pp-prec-dentro-esq' : (cls === 'pp-prec-q3' && p > 0.85) ? ' pp-prec-dentro-dir' : '';
      return `<b class="pp-prec-marca ${cls}${borda}" style="left:${(p * 100).toFixed(2)}%"><span>${rot}<br>${fmt(x, moeda)}</span></b>`;
    };
    const faixa = `left:${(pos(res.venderRapido) * 100).toFixed(2)}%;width:${((pos(res.esperar) - pos(res.venderRapido)) * 100).toFixed(2)}%`;
    const base = `Baseado em ${res.vendasEspecie} vendas desta espécie em ${MOEDA[moeda].nome} nos últimos 30 dias; as mais parecidas com este Pokémon (Nota, nível, potência, extras) pesam mais — cerca de ${num(res.nEfetivo, 0)} contam de verdade.`;
    return `
      <div class="pp-prec-bloco">
        <div class="pp-prec-justo">
          <span>Preço de mercado</span>
          <b>${fmt(res.precoJusto, moeda)} <small>${MOEDA[moeda].icone}</small></b>
          <em>você recebe ${M.formatarValor(liquidoJusto, moeda)} depois da comissão${moeda === 'orb' ? ` <span class="pp-dinheiro" data-tipo="saque" data-parte="ambos" data-gemas="${liquidoJusto}" title="${esc(window.PIUi.DICA.dinheiroSaque)}"></span>` : ''}</em>
        </div>
        <div class="pp-prec-barra" title="Cada ponto é uma venda parecida; quanto maior e mais forte, mais parecida com este Pokémon.">
          <div class="pp-prec-trilho"></div>
          <div class="pp-prec-faixa" style="${faixa}"></div>
          ${pontosHtml}
          ${marca(res.venderRapido, 'pp-prec-q1', 'Vender rápido')}
          ${marca(res.precoJusto, 'pp-prec-q2', 'Mercado')}
          ${marca(res.esperar, 'pp-prec-q3', 'Esperar')}
        </div>
        <ul class="pp-prec-frases">
          <li>${res.faixaAlargada
            ? `Há poucas vendas parecidas (cerca de ${num(res.nEfetivo, 1)}), então a faixa foi alargada para mostrar a incerteza: entre <b>${fmt(res.venderRapido, moeda)}</b> e <b>${fmt(res.esperar, moeda)}</b>.`
            : `Metade das vendas parecidas saiu entre <b>${fmt(res.venderRapido, moeda)}</b> e <b>${fmt(res.esperar, moeda)}</b>.`}${oQue('faixa')}</li>
          <li><b>Vender rápido:</b> 1 em cada 4 vendas parecidas saiu por menos que isso — anunciar aqui tende a vender logo.</li>
          <li><b>Esperar:</b> só 1 em cada 4 saiu por mais — dá para pedir se você puder esperar um comprador.</li>
          ${window.PIUi.textoEmpate(res, moeda) ? `<li>${esc(window.PIUi.textoEmpate(res, moeda))}</li>` : ''}
          <li class="pp-prec-base">${esc(base)}</li>
        </ul>
      </div>`;
  }

  function htmlConfianca(conf, res) {
    // Sem preço para este Pokémon, a confiança da espécie não tem o que medir aqui: um "72%" ao lado de
    // "sem vendas parecidas" parecia que a conta tinha dado certo (Brave Mantine P5, 14/11/2026)
    if (!res || !res.suficiente) return '';
    if (!conf) {
      return `<div class="pp-prec-bloco"><div class="pp-prec-titulo">Confiança</div><div class="pp-an-vazio">Ainda não há vendas suficientes desta espécie nesta moeda para medir a confiança.</div></div>`;
    }
    const nivel = conf.taxa >= 0.7 ? 'alta' : conf.taxa >= 0.5 ? 'media' : 'baixa';
    return `
      <div class="pp-prec-bloco">
        <div class="pp-prec-titulo">Confiança <b class="pp-prec-conf pp-conf-${nivel}">${pct(conf.taxa)}</b>${oQue('confianca')}</div>
        <div class="pp-prec-confbarra"><i class="pp-conf-${nivel}" style="width:${pct(conf.taxa)}"></i></div>
        <p>Quanto o preço de mercado acerta nesta espécie. Refazendo a conta para as últimas <b>${conf.total}</b> vendas desta espécie — cada uma só com as vendas anteriores a ela —, o Preço de mercado ficou a até 25% do valor pago em <b>${conf.acertos}</b> (${Math.round(conf.taxa * 10)} em cada 10).</p>
      </div>`;
  }

  function htmlGrupos(alvo, res, grupos, moeda) {
    if (!grupos) return '';
    const { baixo, alto } = grupos;
    const vao = res && res.suficiente && A.noVao(res.precoJusto, grupos);
    const linha = (rot, fb, fa, seu, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${rot}</td><td>${fb}</td><td>${fa}</td><td>${seu}</td></tr>`;
    const p = x => pct(x);
    const mp = A.grupoMaisParecido(grupos);
    const nomeGrupo = lado => (lado === 'alto' ? 'caro' : 'barato');
    const cab = lado => `Grupo ${nomeGrupo(lado)}${mp && mp.lado === lado ? ' <span class="pp-prec-parecido" title="o grupo com mais peso: as vendas dele se parecem mais com este Pokémon (Nota, nível, potência, extras)">★ mais parecido</span>' : ''}`;
    const seuPreco = res && res.suficiente ? `<small>mercado</small> ${fmt(res.precoJusto, moeda)}` : '—';
    const parecido = mp
      ? `Pelas vendas, este Pokémon se parece mais com o <b>grupo ${nomeGrupo(mp.lado)}</b> (${p(mp.fracao)} do peso).`
      : 'Este Pokémon fica no meio dos dois: nenhum grupo se parece claramente mais com ele.';
    // Medido na planilha de 11/11/2026: com o preço de mercado no vão, ele ficou a até 25% do pago em ~1 de cada 6 vendas
    const avisoVao = vao ? ' <b>O Preço de mercado cai no vão entre eles</b>, e nesse caso ele erra mais: nos testes, acertou só cerca de 1 em cada 6 vendas.' : '';
    return `
      <div class="pp-prec-bloco pp-prec-grupos">
        <div class="pp-prec-titulo">⚠ As vendas parecidas se dividem em dois grupos${oQue('grupos')}</div>
        <p>Os preços das vendas parecidas formam duas faixas bem diferentes, quase sem nada no meio: um grupo saiu por <b>${fmt(baixo.min, moeda)}–${fmt(baixo.max, moeda)}</b> (${p(baixo.fracao)} do peso) e outro por <b>${fmt(alto.min, moeda)}–${fmt(alto.max, moeda)}</b> (${p(alto.fracao)}), com pouca coisa no meio.${avisoVao}</p>
        <p class="pp-prec-acao">Para <b>vender logo</b>, anuncie perto do preço do grupo barato (<b>${fmt(baixo.preco, moeda)}</b>); se puder <b>esperar</b> um comprador, perto do grupo caro (<b>${fmt(alto.preco, moeda)}</b>). ${parecido} Compare este Pokémon com cada grupo:</p>
        <table>
          <thead><tr><th></th><th>${cab('baixo')}</th><th>${cab('alto')}</th><th>Esta ficha</th></tr></thead>
          <tbody>
            ${linha('Preço do grupo', fmt(baixo.preco, moeda), fmt(alto.preco, moeda), seuPreco, 'pp-prec-preco-grupo')}
            ${linha('Nível médio', num(baixo.nivelMedio, 0), num(alto.nivelMedio, 0), alvo.level)}
            ${linha('Nota média', num(baixo.notaMedia, 3), num(alto.notaMedia, 3), isFinite(alvo.nota) ? num(alvo.nota, 3) : '—')}
            ${linha('Com TM AoE', p(baixo.pctAoe), p(alto.pctAoe), alvo.parcial ? '?' : (alvo.aoe ? 'sim' : 'não'))}
            ${linha('Com Z-Move', p(baixo.pctZ), p(alto.pctZ), alvo.parcial ? '?' : (alvo.zmove ? 'sim' : 'não'))}
            ${linha('Refino médio', num(baixo.refinoMedio, 1), num(alto.refinoMedio, 1), '—')}
          </tbody>
        </table>
      </div>`;
  }

  // Sem dois grupos: uma linha discreta dizendo que a janela conferiu, com o maior vão entre as vendas
  function htmlUmGrupo(salto, moeda) {
    if (!salto) return '';
    const razao = num(salto.razao, 1).replace(/,0$/, '');
    return `
      <div class="pp-prec-bloco pp-prec-umgrupo">
        <p><b>As vendas parecidas formam um grupo só:</b> os preços vão subindo aos poucos, sem um salto grande no meio, então o preço de mercado representa bem essas vendas.${oQue('grupos')}</p>
        <p class="pp-prec-fraco">O maior salto entre duas vendas vizinhas (em preço) foi de <b>${fmt(salto.de, moeda)}</b> para <b>${fmt(salto.para, moeda)}</b> (${razao}×). A janela só avisa de dois grupos quando um salto passa de 2,5× e há bastante venda dos dois lados.</p>
      </div>`;
  }

  // ---------- simular nível, AoE, Z-Move e shiny (14/11/2026) ----------
  const simInicial = alvo => ({ level: Number(alvo.level) || 1, aoe: !!alvo.aoe, zmove: !!alvo.zmove, shiny: !!alvo.shiny });
  let esperaSim = 0;
  const ligado = (caixa, sel) => caixa.querySelector(sel).getAttribute('aria-pressed') === 'true';

  function aoMudarSim(j) {
    if (!j || janela !== j) return;
    const caixa = j.el.querySelector('.pp-prec-sim');
    const nv = Math.round(Number(caixa.querySelector('.pp-prec-sim-nv').value));
    if (nv >= 1) j.sim.level = nv; // campo vazio ou zero no meio da digitação: fica o último nível válido
    caixa.querySelector('.pp-prec-sim-nv').classList.toggle('pp-invalido', !(nv >= 1)); // e o campo avisa
    j.sim.aoe = ligado(caixa, '.pp-prec-sim-aoe');
    j.sim.zmove = ligado(caixa, '.pp-prec-sim-z');
    j.sim.shiny = ligado(caixa, '.pp-prec-sim-shiny');
    clearTimeout(esperaSim);
    esperaSim = setTimeout(() => desenharSim(j), 200);
  }

  function voltarSim(j) {
    j.sim = simInicial(j.alvo);
    const caixa = j.el.querySelector('.pp-prec-sim');
    caixa.querySelector('.pp-prec-sim-nv').value = j.sim.level;
    caixa.querySelector('.pp-prec-sim-nv').classList.remove('pp-invalido');
    caixa.querySelector('.pp-prec-sim-aoe').setAttribute('aria-pressed', String(j.sim.aoe));
    caixa.querySelector('.pp-prec-sim-z').setAttribute('aria-pressed', String(j.sim.zmove));
    caixa.querySelector('.pp-prec-sim-shiny').setAttribute('aria-pressed', String(j.sim.shiny));
    desenharSim(j);
  }

  function desenharSim(j) {
    if (janela !== j) return;
    const r = j.el.querySelector('.pp-prec-sim-res');
    if (r) r.innerHTML = htmlSimResultado(j);
  }

  function htmlSimular(j) {
    if (!j.vendas) return '';
    const { sim } = j;
    return `
      <div class="pp-prec-bloco pp-prec-sim">
        <div class="pp-prec-titulo">Simular</div>
        <p>Quanto o preço muda se este Pokémon tivesse outro nível, outros extras ou fosse shiny. É a mesma conta do Preço de mercado, com as vendas guardadas desta espécie.</p>
        <div class="pp-prec-sim-campos">
          <label>Nv <input type="number" class="pp-prec-sim-nv" min="1" step="1" inputmode="numeric" value="${sim.level}"></label>
          <!-- botões de ligar, não caixas de marcar: o CSS do jogo desenha as caixas do jeito dele (14/11/2026) -->
          <button type="button" class="pp-prec-sim-extra pp-prec-sim-aoe" aria-pressed="${sim.aoe}">TM AoE</button>
          <button type="button" class="pp-prec-sim-extra pp-prec-sim-z" aria-pressed="${sim.zmove}">Z-Move</button>
          <button type="button" class="pp-prec-sim-extra pp-prec-sim-shiny" aria-pressed="${sim.shiny}">✨ Shiny</button>
          <button type="button" class="pp-prec-sim-volta" title="Volta ao nível, aos extras e ao shiny desta ficha">desta ficha</button>
        </div>
        <div class="pp-prec-sim-res">${htmlSimResultado(j)}</div>
      </div>`;
  }

  // +6% / −30%; a partir de 3× vira "112× o desta ficha" (um +10757% não se lê)
  const variacao = razao => razao >= 3 ? `${num(razao, razao < 10 ? 1 : 0)}×` : `${window.PIUi.fmtDif(razao - 1)} sobre`;

  /** As vendas que mais pesaram no número simulado: de onde ele vem. */
  function htmlSimVendas(r, moeda, semNota) {
    const lista = (r.comparaveis || []).slice(0, 5);
    if (!lista.length) return '';
    const linhas = lista.map(v => `
      <tr>
        <td><span class="pp-prec-peso" title="parecida ${pct(v.peso)} com a mais parecida"><i style="width:${pct(v.peso)}"></i></span></td>
        <td class="pp-prec-valor">${fmt(v.preco, moeda)}</td>
        <td>${num(v.level, 0)}</td>
        <td>P${v.potencia}</td>
        <td><b>${num(v.nota, 3)}</b></td>
        <td>${[v.shiny ? '✨' : '', extras(v) === '—' ? '' : extras(v)].filter(Boolean).join(' ') || '—'}</td>
        <td>${window.PIUi.fmtIdade(v.em)}</td>
      </tr>`).join('');
    return `
      <div class="pp-prec-vendas pp-prec-sim-vendas">
        <p class="pp-prec-fraco"><b>De onde vem o número:</b> as vendas que mais pesaram nesta simulação (mais parecidas ${semNota ? 'em nível, potência e extras' : 'em Nota, nível e extras'} e mais recentes pesam mais).</p>
        <table>
          <thead><tr><th>Parecida</th><th>Preço</th><th>Nv</th><th>Pot.</th><th>Nota</th><th>Extras</th><th>Há</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  }

  function htmlSimResultado(j) {
    const { alvo, moeda, sim, res: base } = j;
    if (sim.shiny && moeda === 'gold') return '<p>Shiny só vende em Gemas: troque para <b>Gemas</b> no topo da janela para simular.</p>';
    if (base && base.soGemas) return '<p>Shiny só vende em Gemas.</p>';
    if (sim.level === Number(alvo.level) && sim.aoe === !!alvo.aoe && sim.zmove === !!alvo.zmove && sim.shiny === !!alvo.shiny) {
      return '<p class="pp-prec-fraco">Mude o nível, ligue ou desligue os extras ou o shiny para ver o preço.</p>';
    }
    const s = A.simular(alvo, j.vendas, moeda, sim);
    // Shiny muda a Nota: com outro status shiny, a conta não usa a Nota desta ficha (analise.simular)
    const emQue = s.semNota ? 'em nível e potência' : 'em Nota e nível';
    // O motor só "vê" um extra entre as vendas parecidas. Se nenhuma delas tem o extra simulado,
    // ligar (ou tirar) o extra multiplica todas por 0,3 e o preço não muda: as "vendas parecidas"
    // do resultado são então as SEM o extra, e a janela precisa dizer isso com todas as letras
    // (14/11/2026: Blastoise Nv 808 com AoE e Z-Move simulados dava "150, cerca de 33 vendas
    // parecidas" e, logo abaixo, "nenhuma parecida" — parecia contraditório).
    const semMedida = [], efeitosSemMedida = [], incertos = [], avisos = [];
    let medidos = 0; // extras mudados que dá para medir (mesmo que incertos)
    const extra = (liga, original, com, sem, peso, nome) => {
      if (liga === original) return;
      const n = liga ? com : sem;
      const quais = `${liga ? 'com' : 'sem'} ${nome}`;
      if (!n) {
        semMedida.push(quais); efeitosSemMedida.push(`${liga ? 'do' : 'de tirar o'} ${nome}`);
        avisos.push(`A espécie não tem nenhuma venda${s.alvo.shiny ? ' shiny' : ''} ${quais} em ${MOEDA[moeda].nome} nos últimos 30 dias.`);
      } else if (peso < 0.05) {
        semMedida.push(quais); efeitosSemMedida.push(`${liga ? 'do' : 'de tirar o'} ${nome}`);
        avisos.push(`A espécie tem ${n} venda${n > 1 ? 's' : ''} ${quais}, mas ${s.semNota ? 'de nível bem diferente' : 'de Nota ou nível bem diferentes'} deste Pokémon, e por isso quase não contam.`);
      } else {
        medidos++;
        if (n < 3 || peso < 0.2) {
          incertos.push(quais);
          avisos.push(`Só ${pct(peso)} do peso das vendas parecidas é de vendas ${quais}: o efeito do ${nome} fica incerto.`);
        }
      }
    };
    extra(sim.aoe, !!alvo.aoe, s.comAoe, s.semAoe, s.pesoMesmoAoe, 'TM AoE');
    extra(sim.zmove, !!alvo.zmove, s.comZ, s.semZ, s.pesoMesmoZ, 'Z-Move');
    // Nível sem nenhuma venda por perto (do simulado ou do desta ficha): o motor só repete o preço das
    // vendas de outros níveis, e a comparação não mede o efeito do nível
    const mudouNivel = sim.level !== Number(alvo.level);
    if (mudouNivel && (!s.pertoDoNivel || !s.pertoDaFicha)) {
      const nv = n => num(n, 0);
      const longe = !s.pertoDoNivel ? sim.level : Number(alvo.level);
      semMedida.push(`de nível perto do Nv ${nv(longe)}`); efeitosSemMedida.push('do nível');
      avisos.push(!s.pertoDoNivel
        ? `A espécie não tem nenhuma venda${s.alvo.shiny ? ' shiny' : ''} entre o Nv ${nv(s.faixaNivel[0])} e o Nv ${nv(s.faixaNivel[1])} em ${MOEDA[moeda].nome} nos últimos 30 dias.`
        : `A espécie não tem vendas${s.alvo.shiny ? ' shiny' : ''} perto do Nv ${nv(alvo.level)} desta ficha em ${MOEDA[moeda].nome} nos últimos 30 dias: o preço dela também não tem base de nível, então a comparação não mede o efeito do nível.`);
    } else if (mudouNivel) medidos++;
    const r = s.res;
    const juntar = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : l[0];
    const shinyTxt = s.alvo.shiny ? 'shiny' : 'sem shiny';
    // o aviso do shiny: de onde vem o número quando a Nota não pode ser usada
    const avisoShiny = s.semNota
      ? `<p class="pp-prec-aviso"><b>${s.alvo.shiny ? 'Como shiny' : 'Sem o shiny'}:</b> o shiny entra na Nota (a de um shiny é bem maior), então a Nota desta ficha não serve para comparar. A conta usa as ${s.total} venda${s.total === 1 ? '' : 's'} ${shinyTxt} da espécie em ${MOEDA[moeda].nome} e compara só pelo nível, potência e extras — é uma ideia do preço, não uma medida.</p>` : '';
    let html;
    if (!r.suficiente) {
      html = s.semNota && s.total < 3
        ? `<p>${s.total ? `Só ${s.total} venda${s.total === 1 ? '' : 's'}` : 'Nenhuma venda'} ${shinyTxt} da espécie em ${MOEDA[moeda].nome} nos últimos 30 dias: não dá para um preço.</p>`
        : '<p>Sem vendas parecidas o bastante com esse caso para um preço.</p>';
      return html + avisos.map(a => `<p class="pp-prec-aviso">${esc(a)}</p>`).join('');
    }
    const nParecidas = num(r.nEfetivo, r.nEfetivo < 10 ? 1 : 0);
    // selo de confiança da simulação: a do motor; "não dá para medir" quando um extra simulado não tem
    // vendas parecidas; no máximo "baixa" quando um extra é incerto ou quando a Nota não pôde ser usada
    const selo = semMedida.length
      ? '<span class="pp-conf pp-conf-baixa" title="Não há vendas parecidas com o que foi simulado para comparar.">não dá para medir</span>'
      : (() => {
        const c = incertos.length || s.semNota ? 'baixa' : r.confianca;
        return `<span class="pp-conf pp-conf-${c}" title="${esc(window.PIUi.DICA.conf[c] || '')}">confiança ${c === 'media' ? 'média' : c}</span>`;
      })();
    // nada que dê para medir mudou (nem o nível, nem o shiny): a % pareceria uma medida e sai; com o
    // nível igual ao da ficha, o número é o desta ficha
    const semMedirNada = semMedida.length && !medidos && !s.semNota;
    const soSemMedida = semMedirNada && !mudouNivel;
    const dif = base && base.suficiente
      ? ` <span class="pp-prec-sim-dif">${variacao(r.precoJusto / base.precoJusto)} o desta ficha (${fmt(base.precoJusto, moeda)})</span>` : '';
    html = `<p>Preço de mercado <b class="pp-prec-sim-justo">${fmt(r.precoJusto, moeda)} ${MOEDA[moeda].icone}</b>${semMedirNada ? '' : dif} ${selo}${oQue('confianca')}</p>`;
    html += `<p class="pp-prec-fraco">faixa ${fmt(r.venderRapido, moeda)}–${fmt(r.esperar, moeda)}${r.faixaAlargada ? ' (alargada: poucas vendas parecidas)' : ''} · cerca de ${nParecidas} vendas parecidas ${emQue}</p>`;
    html += avisoShiny;
    if (semMedida.length) {
      // o que o número é de verdade: o preço das vendas parecidas que NÃO têm o extra simulado
      const de = soSemMedida ? 'É o mesmo desta ficha' : `O número acima não mede o efeito ${juntar(efeitosSemMedida)}`;
      html += `<p class="pp-prec-aviso"><b>${de}:</b> nenhuma das cerca de ${nParecidas} vendas parecidas com este Pokémon (${emQue}) é ${juntar(semMedida)}, então a conta não tem como medir esse efeito. As vendas abaixo são as que formam o número.</p>`;
    }
    return html + avisos.map(a => `<p class="pp-prec-aviso">${esc(a)}</p>`).join('') + htmlSimVendas(r, moeda, s.semNota);
  }

  // ---------- vendas deste Pokémon pelo "#id" (14/11/2026) ----------
  // A busca "#id" da Tabela de preços traz todas as vendas daquele Pokémon, sem a janela de 30 dias.
  // Uma consulta, só com o clique, pela fila de sempre. As linhas trazem os nicks de quem vendeu e
  // de quem comprou: normalizarVenda descarta, e nada disso é guardado.
  async function buscarHistorico(j) {
    if (!j || janela !== j || (j.hist && j.hist.buscando)) return;
    const id = j.alvo.id;
    const ws = window.PIWs;
    if (!ws || !ws.consultarHistorico || !ws.conectado()) { j.hist = { erro: 'sem conexão com o jogo' }; desenharHist(j); return; }
    j.hist = { buscando: true };
    desenharHist(j);
    try {
      const r = await ws.consultarHistorico({ busca: '#' + id, moeda: null, naoContaTabela: true });
      const h = { vendas: A.historicoDoPokemon(r && r.linhas, id), temMais: !!(r && r.temMais) };
      historicos.set(String(id), h);
      if (janela === j) { j.hist = h; desenharHist(j); }
    } catch (e) {
      if (janela !== j) return;
      j.hist = { erro: e && e.tabela ? 'a Tabela de preços do jogo não está respondendo agora' : ((e && e.message) || 'erro desconhecido') };
      desenharHist(j);
    }
  }

  function desenharHist(j) {
    if (janela !== j) return;
    const c = j.el.querySelector('.pp-prec-hist-corpo');
    if (c) c.innerHTML = htmlHistCorpo(j);
  }

  function htmlHistorico(j) {
    if (!j.alvo.id) return '';
    return `
      <div class="pp-prec-bloco pp-prec-hist">
        <div class="pp-prec-titulo">Vendas deste Pokémon <span class="pp-prec-sub">#${esc(j.alvo.id)}</span></div>
        <div class="pp-prec-hist-corpo">${htmlHistCorpo(j)}</div>
      </div>`;
  }

  function htmlHistCorpo(j) {
    const h = j.hist;
    if (!h) {
      return `<p>A Tabela de preços do jogo guarda todas as vendas de cada Pokémon, sem o limite de 30 dias.</p>
        <p class="pp-prec-hist-acao"><button type="button" class="pp-prec-hist-buscar">Buscar as vendas deste Pokémon</button></p>
        <p class="pp-prec-fraco">Uma consulta ao jogo, no ritmo de sempre. A Tabela traz quem vendeu e quem comprou; a extensão descarta esses nomes.</p>`;
    }
    if (h.buscando) return '<div class="pp-an-vazio"><span class="pp-girando" aria-hidden="true"></span> buscando as vendas deste Pokémon…</div>';
    if (h.erro) return `<p>Não deu para buscar: ${esc(h.erro)}. <button type="button" class="pp-prec-hist-buscar">tentar de novo</button></p>`;
    // sem linhas, a janela não afirma "nunca foi vendido": diz só o que a Tabela trouxe
    if (!h.vendas.length) return '<p>A Tabela de preços não trouxe vendas deste Pokémon.</p>';
    const outroNome = h.vendas.some(v => v.nome !== j.alvo.nome); // vendido antes de evoluir: mostra o nome
    const linhas = h.vendas.map(v => `
      <tr>
        <td>${new Date(v.em).toLocaleDateString('pt-BR')} <small>${esc(window.PIUi.fmtHa(v.em))}</small></td>
        <td class="pp-prec-valor">${MOEDA[v.moeda] ? MOEDA[v.moeda].icone : ''} ${fmt(v.preco, v.moeda)}</td>
        ${outroNome ? `<td>${esc(v.nome)}</td>` : ''}
        <td>${num(v.level, 0)}</td>
        <td><b>${num(v.nota, 3)}</b></td>
        <td>${extras(v)}</td>
      </tr>`).join('');
    const n = h.vendas.length;
    const rodape = h.temMais ? `As ${n} vendas mais recentes (há mais antigas).` : `${n === 1 ? '1 venda' : n + ' vendas'}, desde a primeira.`;
    return `
      <table>
        <thead><tr><th>Quando</th><th>Preço</th>${outroNome ? '<th>Como</th>' : ''}<th>Nv</th><th>Nota</th><th>Extras</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <p class="pp-prec-fraco">${rodape} A Nota e o nível são os do dia da venda.</p>`;
  }

  window.PIPrecificar = { abrir, fechar, _htmlGrupos: htmlGrupos }; // _htmlGrupos: para as páginas de teste
})();
