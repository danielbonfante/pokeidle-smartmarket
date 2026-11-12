/*
 * Pokeidle Smart Market — badge na ficha do Pokémon
 *
 * Observa o modal #ficha. Quando ele abre (ou troca de Pokémon), lê o id da
 * linha "Identidade #…", acha os dados completos do Pokémon no índice do
 * WebSocket (ou, na falta deles, lê o que dá da própria ficha) e mostra o
 * preço estimado em Gemas e em Coins logo abaixo dos botões.
 */
(function () {
  'use strict';
  if (window.PIUi) return;

  const MOEDAS = [
    { id: 'orb', nome: 'Gemas', icone: '💎' },
    { id: 'gold', nome: 'Coins', icone: '🪙' },
  ];
  const ROTULO_CONF = { alta: 'confiança alta', media: 'confiança média', baixa: 'confiança baixa', estimativa: '≈ estimativa' };

  // Textos dos tooltips (atributo title, como a própria ficha do jogo faz)
  const DICA = {
    venderRapido: 'Vender rápido — 25% das vendas parecidas saíram por menos que isso. Anunciando aqui, tende a vender logo.',
    precoJusto: 'Preço justo — o meio das vendas parecidas: metade saiu por menos, metade por mais.',
    esperar: 'Esperar — só 25% das vendas parecidas saíram por mais que isso. Dá para pedir esse valor se você puder esperar um comprador.',
    conf: {
      alta: 'Confiança alta — muitas vendas parecidas, com preços próximos entre si.',
      media: 'Confiança média — algumas vendas parecidas, ou preços bem espalhados.',
      baixa: 'Confiança baixa — poucas vendas parecidas ou preços muito diferentes entre si. Use só como referência.',
      estimativa: 'Estimativa — não há vendas suficientes desta espécie; o preço vem de outras espécies com Nota parecida. Use só como ordem de grandeza.',
    },
    ver: 'Mostra as vendas da mesma espécie que mais pesaram no cálculo.',
    nv: 'Nível do Pokémon vendido. Vendas com nível parecido com o deste Pokémon pesam mais.',
    nota: 'Nota de 0 a 10 do Pokémon vendido (IV, qualidade, potência e shiny, dentro da espécie). É o que mais pesa na comparação.',
    pot: 'Potência do Pokémon vendido (P1, P2, P3…). Potência maior aumenta os atributos.',
    extras: 'Extras do Pokémon vendido: ✨ = shiny · AoE = tem TM AoE · Z = tem Z-Move · M = é Mega. Vendas com AoE, Z-Move ou Mega diferentes dos deste Pokémon pesam menos. Shiny só é comparado com shiny (e só vende em Gemas).',
    preco: 'Quanto o comprador pagou no total, em Gemas 💎 ou Coins 🪙.',
    ha: 'Há quanto tempo foi a venda. Vendas recentes pesam mais: uma de 5 dias atrás vale metade de uma de hoje.',
    liquidoGemas: 'Você recebe — o que sobra para o vendedor depois da comissão do RMT, se vender por cada um dos preços acima. Pokémon em Gemas paga por faixa: 13% até 500, 10% de 500 a 5.000 e 7,5% acima disso (10.000 Gemas → você recebe 9.110). A pensão do anúncio, 100 mil Coins por dia, é paga à parte, na hora de publicar.',
    liquidoCoins: 'Você recebe — o que sobra para o vendedor depois da comissão do RMT, se vender por cada um dos preços acima. Anúncio em Coins paga 15%. A pensão do anúncio, 100 mil Coins por dia, é paga à parte, na hora de publicar.',
    faixa: 'Regra do Mercado da Comunidade: só entra Pokémon com Nv 50+ e Nota 3,5+. Shiny, P5 e lendário/mítico entram com qualquer nível e Nota.',
    estimativa: 'Estimativa pela Nota — sem vendas suficientes desta espécie, o preço vem de vendas de outras espécies da mesma classe (shiny ou P5), com Nota e nível parecidos. No teste com 5.000 vendas reais, o valor pago caiu dentro da faixa Vender rápido–Esperar em metade dos casos, e o erro típico do Preço justo foi de 60% a 100%.',
    soGemas: 'Regra do Mercado da Comunidade: Pokémon shiny só pode ser anunciado em Gemas.',
    especie: 'Espécie do Pokémon vendido. Na estimativa pela Nota entram vendas de outras espécies.',
    usar: 'Preenche o campo "Preço por unidade" do jogo com este valor. Quem publica o anúncio é você.',
    avenda: 'Anúncios abertos agora desta espécie, nesta moeda, os mais parecidos com este Pokémon primeiro. A porcentagem compara com o Preço justo.',
    vendidos: 'Vendas desta espécie nos últimos 30 dias, nesta moeda, as mais parecidas com este Pokémon primeiro.',
    travado: 'o jogo só deixa mudar o preço a cada 30 min',
    precificar: 'Abre a análise completa: o preço justo com as vendas parecidas na barra, a confiança medida nesta espécie e os grupos de preço.',
  };
  const FAIXA = window.PIMotor.FAIXA_MERCADO;

  let fichaAtual = null; // id do Pokémon com badge renderizado

  // ---------- formatação ----------
  function fmtNumero(x, casas) {
    return x.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });
  }
  function fmtPreco(x, moeda) {
    if (!isFinite(x)) return '–';
    x = window.PIMotor.arredondarPreco(x);
    if (moeda === 'orb') return fmtNumero(x, 0);
    if (x >= 1e9) return fmtNumero(x / 1e9, 2) + ' B';
    if (x >= 1e6) return fmtNumero(x / 1e6, 1) + ' M';
    if (x >= 1e3) return fmtNumero(x / 1e3, 1) + ' k';
    return fmtNumero(x, 0);
  }
  function fmtIdade(em) {
    const min = Math.round((Date.now() - em) / 60000);
    if (min < 60) return min + ' min';
    const h = Math.round(min / 60);
    if (h < 48) return h + ' h';
    return Math.round(h / 24) + ' d';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- leitura da ficha ----------
  function numeroPt(txt) {
    if (txt == null) return NaN;
    const m = String(txt).replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function idDaFicha(ficha) {
    const nums = ficha.querySelectorAll('.txt-num');
    for (const n of nums) {
      const m = n.textContent.trim().match(/^#(\d{5,})$/);
      if (m) return Number(m[1]);
    }
    return null;
  }

  function valorDoRotulo(ficha, rotulo) {
    const spans = ficha.querySelectorAll('.fi-heroi-info span');
    for (const s of spans) {
      if (s.textContent.trim().toLowerCase() === rotulo) {
        const b = s.parentElement && s.parentElement.querySelector('b');
        if (b) return b.textContent.trim();
      }
    }
    return null;
  }

  /** Plano B: quando o Pokémon não passou pelo WebSocket, lê o que a ficha mostra. */
  function alvoDoDom(ficha, id) {
    const nome = (ficha.querySelector('.fi-nome') || {}).textContent;
    const nivel = numeroPt((ficha.querySelector('.fi-nivel-chip') || {}).textContent);
    const notaEl = ficha.querySelector('[data-nota]');
    if (!nome || !isFinite(nivel) || !notaEl) return null;
    return {
      id,
      speciesId: null,
      nome: nome.trim(),
      level: nivel,
      nota: Number(notaEl.getAttribute('data-nota')),
      quality: numeroPt(valorDoRotulo(ficha, 'qualidade')),
      ivTotal: numeroPt(valorDoRotulo(ficha, 'iv somado')),
      potencia: numeroPt(valorDoRotulo(ficha, 'potência')) || 0,
      shiny: false,
      aoe: false,
      zmove: false,
      mega: /^mega\s/i.test(nome.trim()),
      parcial: true,
    };
  }

  // ---------- render ----------
  function criarBadge(alvo, faixa) {
    const el = document.createElement('div');
    el.className = 'pp-badge';
    el.dataset.id = alvo.id;
    el.innerHTML = `
      <div class="pp-topo">
        <span class="pp-titulo">Preço estimado</span>
        <span class="pp-conf" hidden></span>
        <button type="button" class="pp-precificar" title="${esc(DICA.precificar)}">Precificar</button>
        <button type="button" class="pp-ver" title="${esc(DICA.ver)}">vendas</button>
      </div>
      <div class="pp-rotulos"><span title="${esc(DICA.venderRapido)}">Vender rápido</span><span title="${esc(DICA.precoJusto)}">Preço justo</span><span title="${esc(DICA.esperar)}">Esperar</span></div>
      ${MOEDAS.map(m => `
        <div class="pp-linha" data-moeda="${m.id}">
          <span class="pp-moeda" title="${m.nome}">${m.icone}</span>
          <b class="pp-q1">…</b><b class="pp-q2">…</b><b class="pp-q3">…</b>
        </div>
        <div class="pp-liq" data-moeda="${m.id}" hidden title="${esc(m.id === 'orb' ? DICA.liquidoGemas : DICA.liquidoCoins)}">
          <span>líq</span><i class="pp-l1"></i><i class="pp-l2"></i><i class="pp-l3"></i>
        </div>`).join('')}
      <div class="pp-status">consultando vendas…</div>
      <div class="pp-comps" hidden></div>
      ${faixa && faixa.faltaNivel ? `<div class="pp-aviso" title="${esc(DICA.faixa)}">Só pode ser anunciado no Mercado a partir do Nv ${FAIXA.nivelMin} (este está no Nv ${alvo.level}). O preço acima vale para quando ele chegar lá.</div>` : ''}
      ${alvo.parcial ? '<div class="pp-aviso">AoE, Z-Move e shiny não foram detectados nesta ficha.</div>' : ''}
    `;
    el.querySelector('.pp-ver').addEventListener('click', ev => {
      ev.stopPropagation();
      const c = el.querySelector('.pp-comps');
      c.hidden = !c.hidden;
    });
    return el;
  }

  /** Badge para quem não pode ir ao RMT: Nota abaixo do mínimo e sem passe livre (shiny, P5, lendário). */
  function criarBadgeForaDaFaixa(alvo) {
    const el = document.createElement('div');
    el.className = 'pp-badge pp-fora';
    el.dataset.id = alvo.id;
    const nota = isFinite(alvo.nota) ? fmtNumero(alvo.nota, 3) : '?';
    el.innerHTML = `
      <div class="pp-topo"><span class="pp-titulo">Preço estimado</span></div>
      <div class="pp-fora-msg" title="${esc(DICA.faixa)}">
        <b>Não pode ser anunciado no Mercado.</b>
        O RMT só aceita Pokémon com Nota ${fmtNumero(FAIXA.notaMin, 1)}+ e Nv ${FAIXA.nivelMin}+, e este tem Nota ${nota}.
        Subir de nível não muda a Nota; evoluir sobe.
      </div>
      ${alvo.parcial ? '<div class="pp-aviso">Shiny não foi detectado nesta ficha. Se ele for shiny, pode ser anunciado em Gemas.</div>' : ''}
    `;
    return el;
  }

  function renderMoeda(badge, moeda, res) {
    const linha = badge.querySelector(`.pp-linha[data-moeda="${moeda}"]`);
    if (!linha) return;
    const [q1, q2, q3] = ['.pp-q1', '.pp-q2', '.pp-q3'].map(s => linha.querySelector(s));
    linha.classList.remove('pp-estimativa');
    const liq = badge.querySelector(`.pp-liq[data-moeda="${moeda}"]`);
    if (liq) {
      const ok = res && res.suficiente;
      liq.hidden = !ok;
      if (ok) {
        const l = x => window.PIMotor.formatarValor(window.PIMotor.liquidoVendedor(window.PIMotor.arredondarPreco(x), moeda), moeda);
        liq.querySelector('.pp-l1').textContent = l(res.venderRapido);
        liq.querySelector('.pp-l2').textContent = (res.estimativa ? '≈ ' : '') + l(res.precoJusto);
        liq.querySelector('.pp-l3').textContent = l(res.esperar);
      }
    }
    if (!res || !res.suficiente) {
      q1.textContent = '–'; q3.textContent = '–';
      q2.textContent = res && res.soGemas ? 'só em Gemas'
        : res && res.vendasEspecie ? `${res.vendasEspecie} venda(s)` : 'sem vendas';
      linha.title = res && res.soGemas ? DICA.soGemas : '';
      linha.classList.add('pp-vazia');
      return;
    }
    linha.classList.remove('pp-vazia');
    q1.textContent = fmtPreco(res.venderRapido, moeda);
    q2.textContent = fmtPreco(res.precoJusto, moeda);
    q3.textContent = fmtPreco(res.esperar, moeda);
    if (res.estimativa) {
      linha.classList.add('pp-estimativa');
      q2.textContent = '≈ ' + q2.textContent;
      linha.title = `${DICA.estimativa} Base: ${res.vendasClasse} vendas, ~${fmtNumero(res.nEfetivo, 1)} parecidas.`;
    } else {
      linha.title = `${res.vendasEspecie} vendas da espécie, ~${fmtNumero(res.nEfetivo, 1)} parecidas`;
    }
  }

  function comparar(seu) {
    return typeof seu === 'number' && isFinite(seu) ? ` (este: ${seu})` : '';
  }

  function extrasTexto(o) {
    return [o.shiny ? 'shiny' : '', o.aoe ? 'TM AoE' : '', o.zmove ? 'Z-Move' : '', o.mega ? 'Mega' : ''].filter(Boolean).join(', ') || 'nenhum';
  }

  function linhaVenda(m, v, alvo, comEspecie) {
    const extras = [v.shiny ? '✨' : '', v.aoe ? 'AoE' : '', v.zmove ? 'Z' : '', v.mega ? 'M' : ''].filter(Boolean).join(' ');
    const data = new Date(v.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const t = {
      nv: `Nível ${v.level}${comparar(alvo.level)}`,
      nota: `Nota ${fmtNumero(v.nota, 3)} de 10${(isFinite(alvo.nota) ? ` (este: ${fmtNumero(alvo.nota, 3)})` : '')}`,
      pot: `Potência ${v.potencia}${comparar(alvo.potencia)}`,
      extras: `Extras: ${extrasTexto(v)} (este: ${alvo.parcial ? 'não detectado' : extrasTexto(alvo)})`,
      preco: `Vendido por ${fmtPreco(v.preco, m.id)} ${m.nome}`,
      ha: `Vendido em ${data}`,
    };
    return `<tr>
      ${comEspecie ? `<td class="pp-esp" title="${esc(v.nome + (v.shiny ? ' (shiny)' : ''))}">${esc(v.nome)}</td>` : ''}
      <td title="${esc(t.nv)}">${v.level}</td>
      <td title="${esc(t.nota)}">${fmtNumero(v.nota, 3)}</td>
      <td title="${esc(t.pot)}">${v.potencia}</td>
      <td title="${esc(t.extras)}">${extras}</td>
      <td title="${esc(t.preco)}">${m.icone} ${fmtPreco(v.preco, m.id)}</td>
      <td title="${esc(t.ha)}">${fmtIdade(v.em)}</td></tr>`;
  }

  function renderResumo(badge, resultados, alvo) {
    // Confiança e lista de vendas seguem a moeda principal (Gemas); se não houver, Coins
    const principal = MOEDAS.map(m => resultados[m.id]).find(r => r && r.suficiente);
    const conf = badge.querySelector('.pp-conf');
    if (principal) {
      conf.hidden = false;
      conf.className = 'pp-conf pp-conf-' + principal.confianca;
      conf.textContent = ROTULO_CONF[principal.confianca];
      conf.title = `${DICA.conf[principal.confianca]} Cerca de ${fmtNumero(principal.nEfetivo, 1)} vendas parecidas.`;
    } else {
      conf.hidden = true;
    }
    // Aviso da estimativa pela Nota
    const estimativa = MOEDAS.some(m => resultados[m.id] && resultados[m.id].estimativa);
    let aviso = badge.querySelector('.pp-estim-aviso');
    if (estimativa && !aviso) {
      aviso = document.createElement('div');
      aviso.className = 'pp-estim-aviso';
      aviso.title = DICA.estimativa;
      aviso.textContent = `≈ Estimativa pela Nota: esta espécie não tem vendas ${alvo.shiny ? 'shiny' : 'P5'} suficientes, ` +
        `então o preço vem de outros ${alvo.shiny ? 'shiny' : 'P5'} com Nota e nível parecidos. Serve como ordem de grandeza; erra bastante.`;
      badge.querySelector('.pp-status').insertAdjacentElement('beforebegin', aviso);
    } else if (!estimativa && aviso) {
      aviso.remove();
    }

    const comps = badge.querySelector('.pp-comps');
    const linhas = MOEDAS.flatMap(m => {
      const r = resultados[m.id];
      return r && r.comparaveis ? r.comparaveis.slice(0, 5).map(v => ({ m, v })) : [];
    });
    comps.innerHTML = linhas.length
      ? `<table><thead><tr>
          ${estimativa ? `<th title="${esc(DICA.especie)}">Pokémon</th>` : ''}
          <th title="${esc(DICA.nv)}">Nv</th><th title="${esc(DICA.nota)}">Nota</th><th title="${esc(DICA.pot)}">P</th>
          <th title="${esc(DICA.extras)}">Extras</th><th title="${esc(DICA.preco)}">Preço</th><th title="${esc(DICA.ha)}">Há</th>
        </tr></thead><tbody>${linhas.map(({ m, v }) => linhaVenda(m, v, alvo, estimativa)).join('')}</tbody></table>`
      : '<p>Nenhuma venda desta espécie no período.</p>';
  }

  // Shiny só se vende por Gemas (regra do Mercado da Comunidade)
  function soGemas(alvo, moeda) {
    return alvo.shiny && moeda !== 'orb';
  }

  /** Filtro da Tabela de preços que traz a classe do alvo, ou null se ele é comum. */
  function filtroDaClasse(alvo) {
    if (alvo.shiny) return { soShiny: true };
    if (Number(alvo.potencia) >= 5) return { soP5: true };
    return null;
  }

  async function calcular(alvo, moeda) {
    if (soGemas(alvo, moeda)) return { suficiente: false, soGemas: true };
    const vendas = await window.PIStore.vendasPorEspecie(alvo.speciesId, alvo.nome);
    const res = window.PIMotor.precificar(alvo, vendas, { moeda });
    if (res.suficiente || !filtroDaClasse(alvo)) return res;
    // Plano B: shiny ou P5 sem vendas suficientes da espécie → estimativa pela Nota
    const daClasse = await window.PIStore.vendasPorClasse(window.PIMotor.classeDe(alvo));
    const est = window.PIMotor.precificarPorNota(alvo, daClasse, { moeda });
    if (!est.suficiente) return res;
    est.vendasEspecie = res.vendasEspecie;
    return est;
  }

  async function atualizar(badge, alvo) {
    const resultados = {};
    const status = badge.querySelector('.pp-status');
    const vivo = () => badge.isConnected && fichaAtual === alvo.id;

    const recalcular = async () => {
      for (const m of MOEDAS) {
        resultados[m.id] = await calcular(alvo, m.id);
        if (!vivo()) return;
        renderMoeda(badge, m.id, resultados[m.id]);
      }
      renderResumo(badge, resultados, alvo);
    };

    // 1) Mostra na hora o que já está no cache
    await recalcular();
    if (!vivo()) return;

    // 2) Busca vendas novas no jogo, uma moeda de cada vez
    if (!window.PIWs.conectado()) {
      status.textContent = 'sem conexão com o jogo — usando só o cache';
      return;
    }
    const filtro = filtroDaClasse(alvo);
    const nomeClasse = alvo.shiny ? 'shiny' : 'P5';
    try {
      for (const m of MOEDAS) {
        if (soGemas(alvo, m.id)) continue; // shiny em Coins não existe: nem consulta
        status.textContent = `atualizando ${m.nome.toLowerCase()}…`;
        let ultimoRender = 0;
        const progresso = rotulo => ({ pagina }) => {
          if (!vivo()) return;
          status.textContent = `${rotulo}… página ${pagina}`;
          if (Date.now() - ultimoRender > 1500) { ultimoRender = Date.now(); recalcular(); }
        };
        await window.PISync.sincronizar(alvo.nome, m.id, progresso(`atualizando ${m.nome.toLowerCase()}`));
        if (!vivo()) return;
        await recalcular();
        if (!vivo()) return;
        // Espécie sem vendas suficientes: busca as vendas de outros shiny/P5 para a estimativa pela Nota
        const r = resultados[m.id];
        if (filtro && !(r && r.suficiente && !r.estimativa)) {
          await window.PISync.sincronizar('', m.id, progresso(`buscando outros ${nomeClasse} em ${m.nome.toLowerCase()}`), filtro);
          if (!vivo()) return;
          await recalcular();
        }
      }
      const total = MOEDAS.reduce((s, m) => s + ((resultados[m.id] && resultados[m.id].vendasEspecie) || 0), 0);
      const estim = MOEDAS.map(m => resultados[m.id]).find(r => r && r.estimativa);
      status.textContent = `${total} vendas da espécie nos últimos 30 dias` +
        (estim ? ` · estimativa com ${estim.vendasClasse} vendas de outros ${nomeClasse}` : '');
    } catch (e) {
      if (vivo()) status.textContent = 'não deu para atualizar agora (' + e.message + ') — usando o cache';
    }
  }

  /**
   * Põe o quadro de preço na largura inteira da ficha, logo abaixo do bloco de cima
   * (.fi-heroi: dados à esquerda, sprite à direita). Dentro da coluna da esquerda ele
   * esticava o painel do sprite e deixava um vão vazio. Se o jogo mudar o layout,
   * cai no lugar antigo, depois dos botões.
   */
  function inserirQuadro(ficha, acoes, el) {
    const heroi = ficha.querySelector('.fi-heroi');
    if (heroi && heroi.parentElement) {
      el.classList.add('pp-largo');
      heroi.insertAdjacentElement('afterend', el);
    } else {
      acoes.insertAdjacentElement('afterend', el);
    }
  }

  function aoMudarFicha() {
    const ficha = document.getElementById('ficha');
    if (!ficha) return;
    // o modal é position: fixed, então offsetParent é sempre null; getClientRects serve
    const aberta = !ficha.classList.contains('hidden') && ficha.getClientRects().length > 0;
    const acoes = ficha.querySelector('.fi-acoes');
    if (!aberta || !acoes) { fichaAtual = null; return; }

    const id = idDaFicha(ficha);
    if (!id) return;
    // desligado no popup: tira o quadro que estiver na ficha e não põe outro
    if (window.PIConfig && !window.PIConfig.ligado('quadro')) {
      ficha.querySelectorAll('.pp-badge').forEach(b => b.remove());
      fichaAtual = null;
      return;
    }
    const existente = ficha.querySelector('.pp-badge');
    if (existente && Number(existente.dataset.id) === id) return;
    if (existente) existente.remove();

    const bruto = window.PIWs.pokemon(id);
    const alvo = bruto ? window.PIMotor.normalizarAlvo(bruto) : alvoDoDom(ficha, id);
    if (!alvo || !alvo.nome) return;

    fichaAtual = id;
    const faixa = window.PIMotor.faixaMercado(alvo);
    // Nota abaixo do mínimo: não pode ir ao RMT, então nem consulta vendas
    if (faixa.faltaNota) {
      inserirQuadro(ficha, acoes, criarBadgeForaDaFaixa(alvo));
      return;
    }
    const badge = criarBadge(alvo, faixa);
    inserirQuadro(ficha, acoes, badge);
    // Abaixo do Nv 50, precifica como se já estivesse no nível mínimo do Mercado
    const alvoPreco = faixa.faltaNivel ? Object.assign({}, alvo, { level: FAIXA.nivelMin }) : alvo;
    const botaoPrecificar = badge.querySelector('.pp-precificar');
    if (botaoPrecificar) botaoPrecificar.addEventListener('click', ev => {
      ev.stopPropagation();
      if (window.PIPrecificar) window.PIPrecificar.abrir(alvoPreco);
    });
    atualizar(badge, alvoPreco).catch(e => console.warn('[Pokeidle Smart Market]', e));
  }

  function iniciar() {
    const ficha = document.getElementById('ficha');
    if (!ficha) { setTimeout(iniciar, 1000); return; }
    let agendado = null;
    const agendar = () => { clearTimeout(agendado); agendado = setTimeout(aoMudarFicha, 120); };
    new MutationObserver(muts => {
      // ignora mudanças feitas pelo próprio badge
      if (muts.every(m => m.target.closest && m.target.closest('.pp-badge'))) return;
      agendar();
    }).observe(ficha, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    agendar();
    if (window.PIConfig) window.PIConfig.aoMudar(agendar);
    console.info('[Pokeidle Smart Market] ativo — created by dan_the_treiner');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.PIUi = { atualizarAgora: aoMudarFicha, fmtPreco, fmtNumero, fmtIdade, esc, calcular, DICA };
})();
