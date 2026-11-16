/*
 * Smart Market — popup do ícone da extensão
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Liga e desliga o quadro, os selos e o painel (chrome.storage.local, chave "config"; a
 * ponte leva para o jogo na hora). Mostra o cache de vendas e o freio da aba do jogo
 * aberta, pedindo à ponte (src/ponte.js) por chrome.tabs.sendMessage.
 */
(function () {
  'use strict';
  const PADRAO = { quadro: true, selos: true, painel: true, dinheiro: 'usd', cotacaoBrl: 5.5 };
  const $ = s => document.querySelector(s);
  const fmtNum = n => Number(n || 0).toLocaleString('pt-BR');
  const fmtData = ms => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const fmtHora = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fmtSeg = ms => (ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' s';

  let config = Object.assign({}, PADRAO);
  let aba = null;
  let vendasNoCache = 0;

  // ---------- liga / desliga ----------
  function lerConfig() {
    return new Promise(r => chrome.storage.local.get('config', x => r(Object.assign({}, PADRAO, x && x.config))));
  }

  async function iniciarOpcoes() {
    config = await lerConfig();
    document.querySelectorAll('input[data-chave]').forEach(inp => {
      const chave = inp.getAttribute('data-chave');
      inp.checked = config[chave] !== false;
      inp.addEventListener('change', () => {
        config[chave] = inp.checked;
        chrome.storage.local.set({ config });
      });
    });
    // Gemas em dinheiro: dois switches ("Dólar" e "Dólar e real"); ligar um desliga o outro, e os dois
    // desligados é "não mostrar". O campo da cotação do real só fica ativo com "Dólar e real".
    const cotacao = $('#cotacao-brl');
    const switches = [...document.querySelectorAll('input[data-dinheiro]')];
    const mostrarCotacao = () => {
      const brl = config.dinheiro === 'usd-brl';
      switches.forEach(s => { s.checked = s.getAttribute('data-dinheiro') === config.dinheiro; });
      cotacao.disabled = !brl;
      $('#cotacao-caixa').classList.toggle('desligada', !brl);
      $('#cotacao-nota').textContent = brl
        ? 'Cotação do real: quanto vale 1 USDT em reais. A extensão não consulta site de câmbio; atualize o número quando quiser.'
        : 'Cotação do real: só vale com "Dólar e real" ligado. A extensão não consulta site de câmbio; o número é o que você digitar.';
    };
    switches.forEach(s => {
      s.addEventListener('change', () => {
        config.dinheiro = s.checked ? s.getAttribute('data-dinheiro') : 'nada';
        mostrarCotacao();
        chrome.storage.local.set({ config });
      });
    });
    cotacao.value = Number(config.cotacaoBrl).toFixed(2);
    cotacao.addEventListener('change', () => {
      const v = Number(String(cotacao.value).replace(',', '.'));
      if (!(v >= 1 && v <= 20)) { cotacao.value = Number(config.cotacaoBrl).toFixed(2); return; } // fora do razoável: volta
      config.cotacaoBrl = Math.round(v * 100) / 100;
      cotacao.value = config.cotacaoBrl.toFixed(2);
      chrome.storage.local.set({ config });
    });
    mostrarCotacao();
  }

  // ---------- aba do jogo ----------
  function pedirPelaAba(pedido) {
    return new Promise(res => {
      if (!aba || aba.id == null) return res(null);
      try {
        chrome.tabs.sendMessage(aba.id, { pism: pedido }, r => {
          if (chrome.runtime.lastError) return res(null); // aba sem a extensão (não é o jogo)
          res(r || null);
        });
      } catch (e) { res(null); }
    });
  }

  // Plano B: há navegadores em que o chrome.tabs não funciona como no Chrome (a aba ativa não vem, ou
  // a mensagem não chega à aba) e o popup achava que não estava no jogo. Aí o pedido vai pelo
  // chrome.storage: a ponte da aba do jogo (src/ponte.js) vê a mudança e responde pelo storage. Só
  // passam os números do cache e do freio, e as duas chaves são apagadas logo depois.
  // Prazos (revisão de 14/11/2026): 1,5 s para descobrir se o caminho existe; depois de achado, 5 s,
  // como o caminho pela aba (o "estado" lê o cache inteiro e pode demorar numa máquina lenta). Uma
  // resposta que chega depois do prazo ainda é apagada (escuta até 5,5 s), para nada ficar guardado, e,
  // se o caminho ainda não estava achado, ela o acha (máquina lenta: 2ª revisão de 14/11/2026).
  // Só a aba visível do jogo responde (ponte.js); quando o chrome.tabs parece não funcionar (nenhuma
  // aba ativa, ou a "aba ativa" é o próprio popup aberto como janela/aba), o pedido aceita também a
  // aba do jogo em segundo plano (aceitaOculta), que é o caso que motivou o plano B.
  const CHAVE_PEDIDO = 'pism-pedido', CHAVE_RESPOSTA = 'pism-resposta';
  const ESPERA_DESCOBRIR_MS = 1500, ESPERA_STORAGE_MS = 5000;
  let numPedido = 0;
  function pedirPeloStorage(pedido) {
    return new Promise(res => {
      if (!chrome.storage || !chrome.storage.onChanged) return res(null);
      const id = Date.now() + '-' + (++numPedido);
      let respondido = false;
      const parar = () => { chrome.storage.onChanged.removeListener(ouvir); chrome.storage.local.remove([CHAVE_PEDIDO, CHAVE_RESPOSTA]); };
      const ouvir = (mud, area) => {
        const r = area === 'local' && mud[CHAVE_RESPOSTA] && mud[CHAVE_RESPOSTA].newValue;
        if (!r || r.id !== id) return;
        clearTimeout(limpar);
        parar();
        if (!respondido) { respondido = true; res(r.dados || null); }
        else if (!canal && r.dados) canal = 'storage'; // chegou tarde, mas o caminho existe (o próximo tique pede tudo)
      };
      const prazo = canal === 'storage' ? ESPERA_STORAGE_MS : ESPERA_DESCOBRIR_MS;
      setTimeout(() => { if (!respondido) { respondido = true; chrome.storage.local.remove(CHAVE_PEDIDO); res(null); } }, prazo);
      const limpar = setTimeout(parar, ESPERA_STORAGE_MS + 500);
      chrome.storage.onChanged.addListener(ouvir);
      chrome.storage.local.set({ [CHAVE_PEDIDO]: { id, pedido, em: Date.now(), aceitaOculta: tabsSemAba() } });
    });
  }

  // o chrome.tabs não entregou uma aba de verdade (ou entregou o próprio popup)
  // popupComoAba: o próprio popup aberto como aba/janela (chrome.tabs.getCurrent devolve a aba dele,
  // sem pedir permissão), o caso de navegadores que abrem o popup assim (2ª revisão de 15/11/2026)
  let popupComoAba = false;
  const tabsSemAba = () => popupComoAba || !aba || aba.id == null || /^[a-z-]+-extension:/.test(aba.url || '');

  let canal = null; // o caminho que funcionou: 'aba' ou 'storage'
  async function pedir(pedido) {
    if (canal !== 'storage') {
      const r = await pedirPelaAba(pedido);
      if (r) { canal = 'aba'; return r; }
      if (canal === 'aba') return null;
    }
    const r = await pedirPeloStorage(pedido);
    if (r) canal = 'storage';
    return r;
  }

  function htmlCache(c) {
    if (!c) return '<span class="fraco">Não deu para ler o cache.</span>';
    vendasNoCache = c.vendas;
    if (!c.vendas) return 'Vazio. As vendas são baixadas aos poucos, quando você abre uma ficha ou uma vitrine focada.';
    const periodo = c.maisAntiga ? `<div class="linha fraco">de ${fmtData(c.maisAntiga)} a ${fmtData(c.maisNova)}</div>` : '';
    return `<div class="linha"><b>${fmtNum(c.vendas)}</b> vendas de <b>${fmtNum(c.especies)}</b> espécies</div>${periodo}`;
  }

  function htmlFreio(conectado, r) {
    if (!r) return '<span class="fraco">Não deu para ler o freio.</span>';
    const agora = Date.now();
    let estado;
    if (r.pausadoAte > agora) {
      const min = Math.max(1, Math.ceil((r.pausadoAte - agora) / 60000));
      estado = `<span class="estado parado">Pausado</span> o jogo pediu para ir mais devagar. As consultas voltam em ~${min} min.`;
    } else if (r.intervalo > r.intervaloNormal) {
      estado = `<span class="estado lento">Mais devagar</span> ${fmtSeg(r.intervalo)} entre consultas (normal: ${fmtSeg(r.intervaloNormal)})` +
        (r.freioAte ? ` até ${fmtHora(r.freioAte)}.` : '.');
    } else {
      estado = `<span class="estado ok">Normal</span> ${fmtSeg(r.intervalo)} entre consultas, no máximo ${r.tetoPorMinuto} por minuto.`;
    }
    const usados = r.enviosConexaoUltimoMinuto || 0;
    const fracao = Math.min(1, usados / (r.orcamentoConexao || 1));
    const conexao = conectado
      ? `<div class="barra" title="Mensagens que saíram pela conexão do jogo no último minuto, somando o jogo e outras extensões"><i class="${fracao >= 0.8 ? 'alto' : ''}" style="width:${Math.round(fracao * 100)}%"></i></div>
         <div class="linha fraco">Conexão: ${usados} de ${r.orcamentoConexao} mensagens no último minuto (somando o jogo e outras extensões). Acima disso, a extensão espera a vez.</div>`
      : '<div class="linha fraco">Ainda sem conexão com o jogo.</div>';
    // A Tabela de preços do jogo parou de responder (ws.js): sem vendas novas até ela voltar
    const tabela = r.tabelaForaDesde
      ? `<div class="linha"><span class="estado parado">Tabela fora</span> a Tabela de preços do jogo não responde desde ${fmtData(r.tabelaForaDesde)} ${fmtHora(r.tabelaForaDesde)}. ` +
        `Os preços usam só as vendas guardadas, que não são apagadas enquanto isso. Nova tentativa ${r.tabelaProximoTeste > agora ? 'às ' + fmtHora(r.tabelaProximoTeste) : 'na próxima ficha aberta'}.</div>`
      : '';
    return `${tabela}<div class="linha">${estado}</div>${conexao}`;
  }

  // um pedido por vez (o prazo do storage é maior que o intervalo de 2 s), e, com o caminho já achado,
  // "fora do jogo" só depois de 2 falhas seguidas (a aba recarregando não faz a tela piscar)
  let emCurso = false, falhas = 0, cacheVisto = false;
  async function atualizarJogo(completo) {
    if (emCurso) return;
    emCurso = true;
    let r;
    try { r = await pedir(completo ? 'estado' : 'ritmo'); } finally { emCurso = false; }
    if (!r && canal && ++falhas < 2) return;
    if (r) falhas = 0;
    // fora do jogo as chaves continuam valendo: ficam guardadas no Chrome
    $('#nota-chaves').textContent = r ? 'Vale na hora, em todas as abas do jogo.' : 'Fica guardado e vale quando você abrir o jogo.';
    if (!r) { $('#jogo').hidden = true; $('#fora').hidden = false; return; }
    $('#jogo').hidden = false; $('#fora').hidden = true;
    if (r.erro) { $('#freio').textContent = 'Erro: ' + r.erro; return; }
    if (completo) { $('#cache').innerHTML = htmlCache(r.cache); cacheVisto = true; }
    $('#freio').innerHTML = htmlFreio(r.conectado, r.ritmo);
  }

  // ---------- limpar cache (com confirmação) ----------
  function mostrarLimpar() {
    $('#limpar-area').innerHTML = '<button type="button" id="limpar">Limpar cache…</button>';
    $('#limpar').addEventListener('click', confirmarLimpar);
  }

  function confirmarLimpar() {
    $('#limpar-area').innerHTML = `
      <div class="confirmar">
        <p>Apagar as <b>${fmtNum(vendasNoCache)}</b> vendas guardadas? Elas voltam aos poucos quando você abrir fichas e vitrines, no ritmo de sempre.</p>
        <button type="button" class="perigo" id="sim">Apagar</button><button type="button" id="nao">Cancelar</button>
      </div>`;
    $('#nao').addEventListener('click', mostrarLimpar);
    $('#sim').addEventListener('click', async () => {
      $('#sim').disabled = true;
      const r = await pedir('limpar-cache');
      if (!r || r.erro) { $('#limpar-area').innerHTML = `<span class="fraco">Não deu para limpar${r && r.erro ? ': ' + r.erro : ''}.</span>`; return; }
      $('#cache').innerHTML = htmlCache(r.cache);
      $('#limpar-area').innerHTML = '<span class="feito">Cache limpo.</span>';
      setTimeout(mostrarLimpar, 2500);
    });
  }

  // ---------- "Apoie o dev!": o cartão só abre com o clique ----------
  function iniciarApoie() {
    const bt = $('#apoie-bt');
    bt.addEventListener('click', () => {
      const abrir = $('#apoie').hidden;
      $('#apoie').hidden = !abrir;
      bt.setAttribute('aria-expanded', String(abrir));
    });
  }

  async function iniciar() {
    $('#versao').textContent = chrome.runtime.getManifest().version;
    // "Como ler": o mesmo glossário da janela Precificar (src/glossario.js)
    if (window.PIGlossario) $('#glossario').innerHTML = window.PIGlossario.html();
    iniciarApoie();
    await iniciarOpcoes();
    mostrarLimpar();
    // sobras de um popup fechado no meio de um pedido (o plano B pelo storage)
    try { chrome.storage.local.remove([CHAVE_PEDIDO, CHAVE_RESPOSTA]); } catch (e) { /* sem storage */ }
    try { popupComoAba = !!(chrome.tabs.getCurrent && await chrome.tabs.getCurrent()); } catch (e) { popupComoAba = false; }
    try { [aba] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (e) { aba = null; }
    await atualizarJogo(true);
    // o freio muda com o tempo; o cache, não. Sem caminho achado (a aba do jogo ainda carregando, ou
    // fora do jogo), tenta de novo a cada 6 s, com o pedido completo.
    let ciclos = 0;
    setInterval(() => {
      ciclos++;
      if (canal) atualizarJogo(!cacheVisto);
      else if (ciclos % 3 === 0) atualizarJogo(true);
    }, 2000);
  }

  iniciar();
})();
