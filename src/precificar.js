/*
 * Smart Market — janela "Precificar" (análise de preço do Pokémon)
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Aberta pelo botão "Precificar" do quadro de preço da ficha. Mostra o Preço justo em
 * destaque com uma barra onde aparecem as vendas parecidas, frases em português claro,
 * a confiança medida de verdade (o motor refeito para as vendas recentes da espécie) e
 * um aviso quando as vendas se dividem em dois grupos de preço. Usa só o cache: nenhuma
 * consulta nova ao jogo.
 */
(function () {
  'use strict';
  if (window.PIPrecificar) return;

  const A = window.PIAnalise;
  const M = window.PIMotor;
  const MOEDA = window.PIUi.MOEDA;

  let janela = null; // { el, alvo, moeda, geracao }

  const fmt = (x, m) => window.PIUi.fmtPreco(x, m);
  const num = (x, c) => window.PIUi.fmtNumero(x, c);
  const esc = s => window.PIUi.esc(s);
  const pct = x => Math.round(x * 100) + '%';

  // ---------- abrir / fechar ----------
  function abrir(alvo) {
    fechar();
    const el = document.createElement('div');
    el.className = 'pp-prec-fundo';
    el.innerHTML = `
      <div class="pp-prec" role="dialog" aria-label="Precificar ${esc(alvo.nome)}">
        <div class="pp-toldo"></div>
        <div class="pp-prec-topo">
          <div><b>Precificar</b> <span class="pp-prec-sub">· ${esc(alvo.nome)} · Nv ${alvo.level}${alvo.shiny ? ' · ✨ shiny' : ''}</span></div>
          <div class="pp-prec-moedas">
            <button type="button" data-moeda="orb">${MOEDA.orb.icone} Gemas</button>
            <button type="button" data-moeda="gold"${alvo.shiny ? ' disabled title="Shiny só vende em Gemas"' : ''}>${MOEDA.gold.icone} Coins</button>
          </div>
          <button type="button" class="pp-prec-fechar" title="Fechar">✕</button>
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
      const b = ev.target.closest('[data-moeda]');
      if (b && !b.disabled) { janela.moeda = b.getAttribute('data-moeda'); desenhar(); }
    });
    document.body.appendChild(el);
    janela = { el, alvo, moeda: 'orb', geracao: 0 }; // abre em Gemas (shiny só vende em Gemas)
    document.addEventListener('keydown', aoTeclar, true);
    desenhar();
  }

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
    corpo.innerHTML = htmlPreco(alvo, moeda, res, pontos) + htmlVendas(alvo, res, pontos, moeda) +
      htmlConfianca(conf, res) + (grupos ? htmlGrupos(alvo, res, grupos, moeda) : htmlUmGrupo(A.maiorSalto(pontos), moeda));
  }

  // ---------- vendas que mais pesaram ----------
  const VISIVEIS = 10;
  const extras = x => [x.aoe ? 'AoE' : '', x.zmove ? 'Z' : '', x.mega ? 'Mega' : ''].filter(Boolean).join(' · ') || '—';
  const comparar = (v, seu, folga) => !isFinite(seu) || !isFinite(v) ? '' : v > seu + folga ? ' class="pp-prec-acima"' : v < seu - folga ? ' class="pp-prec-abaixo"' : '';

  function htmlVendas(alvo, res, pontos, moeda) {
    if (!res || !res.suficiente || res.estimativa || !pontos.length) return '';
    const linhas = pontos.map((p, i) => `
      <tr${i >= VISIVEIS ? ' class="pp-prec-extra"' : ''}>
        <td><span class="pp-prec-peso" title="parecida ${pct(p.peso)} com esta ficha"><i style="width:${pct(p.peso)}"></i></span></td>
        <td class="pp-prec-valor">${fmt(p.preco, moeda)}</td>
        <td${comparar(p.level, alvo.level, alvo.level * 0.1)}>${p.level}</td>
        <td>P${p.potencia}</td>
        <td>${p.ivTotal || '—'}</td>
        <td>${p.quality ? num(p.quality, 3) : '—'}</td>
        <td${comparar(p.nota, alvo.nota, 0.02)}><b>${num(p.nota, 3)}</b></td>
        <td>${extras(p)}</td>
        <td>${window.PIUi.fmtIdade(p.em)}</td>
      </tr>`).join('');
    const seu = `
      <tr class="pp-prec-seu">
        <td>esta ficha</td>
        <td class="pp-prec-valor" title="o Preço justo calculado para esta ficha"><small>justo</small> ${fmt(res.precoJusto, moeda)}</td>
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
        <div class="pp-prec-titulo">Vendas que mais pesaram no preço</div>
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
        : `Poucas vendas desta espécie em ${MOEDA[moeda].nome} nos últimos 30 dias para estimar o preço.`}</div></div>`;
    }
    const est = res.estimativa ? '≈ ' : '';
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
      return `<b class="pp-prec-marca ${cls}${borda}" style="left:${(p * 100).toFixed(2)}%"><span>${rot}<br>${est}${fmt(x, moeda)}</span></b>`;
    };
    const faixa = `left:${(pos(res.venderRapido) * 100).toFixed(2)}%;width:${((pos(res.esperar) - pos(res.venderRapido)) * 100).toFixed(2)}%`;
    const base = res.estimativa
      ? `≈ Estimativa pela Nota: sem vendas suficientes desta espécie, o preço vem de ${res.vendasClasse} vendas de outras espécies com Nota e nível parecidos. Erra bastante.`
      : `Baseado em ${res.vendasEspecie} vendas desta espécie em ${MOEDA[moeda].nome} nos últimos 30 dias; as mais parecidas com este Pokémon (Nota, nível, potência, extras) pesam mais — cerca de ${num(res.nEfetivo, 0)} contam de verdade.`;
    return `
      <div class="pp-prec-bloco">
        <div class="pp-prec-justo">
          <span>Preço justo</span>
          <b>${est}${fmt(res.precoJusto, moeda)} <small>${MOEDA[moeda].icone}</small></b>
          <em>você recebe ${M.formatarValor(M.liquidoVendedor(window.PIAnuncioLogica ? window.PIAnuncioLogica.valorUsar(res.precoJusto) : res.precoJusto, moeda), moeda)} depois da comissão</em>
        </div>
        <div class="pp-prec-barra" title="Cada ponto é uma venda parecida; quanto maior e mais forte, mais parecida com este Pokémon.">
          <div class="pp-prec-trilho"></div>
          <div class="pp-prec-faixa" style="${faixa}"></div>
          ${pontosHtml}
          ${marca(res.venderRapido, 'pp-prec-q1', 'Vender rápido')}
          ${marca(res.precoJusto, 'pp-prec-q2', 'Justo')}
          ${marca(res.esperar, 'pp-prec-q3', 'Esperar')}
        </div>
        <ul class="pp-prec-frases">
          <li>Metade das vendas parecidas saiu entre <b>${fmt(res.venderRapido, moeda)}</b> e <b>${fmt(res.esperar, moeda)}</b>.</li>
          <li><b>Vender rápido:</b> 1 em cada 4 vendas parecidas saiu por menos que isso — anunciar aqui tende a vender logo.</li>
          <li><b>Esperar:</b> só 1 em cada 4 saiu por mais — dá para pedir se você puder esperar um comprador.</li>
          <li class="pp-prec-base">${esc(base)}</li>
        </ul>
      </div>`;
  }

  function htmlConfianca(conf, res) {
    if (res && res.estimativa) return '';
    if (!conf) {
      return `<div class="pp-prec-bloco"><div class="pp-prec-titulo">Confiança</div><div class="pp-an-vazio">Ainda não há vendas suficientes desta espécie nesta moeda para medir a confiança.</div></div>`;
    }
    const nivel = conf.taxa >= 0.7 ? 'alta' : conf.taxa >= 0.5 ? 'media' : 'baixa';
    return `
      <div class="pp-prec-bloco">
        <div class="pp-prec-titulo">Confiança <b class="pp-prec-conf pp-conf-${nivel}">${pct(conf.taxa)}</b></div>
        <div class="pp-prec-confbarra"><i class="pp-conf-${nivel}" style="width:${pct(conf.taxa)}"></i></div>
        <p>Refazendo a conta para as últimas <b>${conf.total}</b> vendas desta espécie — cada uma só com as vendas anteriores a ela —, o Preço justo ficou a até 25% do valor pago em <b>${conf.acertos}</b> (${Math.round(conf.taxa * 10)} em cada 10).</p>
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
    const est = res && res.estimativa ? '≈ ' : '';
    const seuPreco = res && res.suficiente ? `<small>justo</small> ${est}${fmt(res.precoJusto, moeda)}` : '—';
    const parecido = mp
      ? `Pelas vendas, este Pokémon se parece mais com o <b>grupo ${nomeGrupo(mp.lado)}</b> (${p(mp.fracao)} do peso).`
      : 'Este Pokémon fica no meio dos dois: nenhum grupo se parece claramente mais com ele.';
    // Medido na planilha de 11/11/2026: com o justo no vão, ele ficou a até 25% do pago em ~1 de cada 6 vendas
    const avisoVao = vao ? ' <b>O Preço justo cai no vão entre eles</b>, e nesse caso ele erra mais: nos testes, acertou só cerca de 1 em cada 6 vendas.' : '';
    return `
      <div class="pp-prec-bloco pp-prec-grupos">
        <div class="pp-prec-titulo">⚠ As vendas parecidas se dividem em dois grupos</div>
        <p>Um grupo saiu por <b>${fmt(baixo.min, moeda)}–${fmt(baixo.max, moeda)}</b> (${p(baixo.fracao)} do peso) e outro por <b>${fmt(alto.min, moeda)}–${fmt(alto.max, moeda)}</b> (${p(alto.fracao)}), com pouca coisa no meio.${avisoVao}</p>
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
        <p><b>As vendas parecidas formam um grupo só.</b> O maior salto entre preços vizinhos vai de
        <b>${fmt(salto.de, moeda)}</b> para <b>${fmt(salto.para, moeda)}</b> (${razao}×); a janela só separa em dois grupos a partir de 2,5×.</p>
      </div>`;
  }

  window.PIPrecificar = { abrir, fechar, _htmlGrupos: htmlGrupos }; // _htmlGrupos: para as páginas de teste
})();
