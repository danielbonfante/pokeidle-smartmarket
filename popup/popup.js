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
    // Gemas em dinheiro: o modo e a cotação do real (o campo só aparece com "Dólar e real")
    const cotacao = $('#cotacao-brl');
    const mostrarCotacao = () => { $('#cotacao-area').hidden = config.dinheiro !== 'usd-brl'; };
    document.querySelectorAll('input[name="dinheiro"]').forEach(r => {
      r.checked = r.value === config.dinheiro;
      r.addEventListener('change', () => {
        if (!r.checked) return;
        config.dinheiro = r.value;
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
  const CHAVE_PEDIDO = 'pism-pedido', CHAVE_RESPOSTA = 'pism-resposta', ESPERA_STORAGE_MS = 1500;
  let numPedido = 0;
  function pedirPeloStorage(pedido) {
    return new Promise(res => {
      if (!chrome.storage || !chrome.storage.onChanged) return res(null);
      const id = Date.now() + '-' + (++numPedido);
      const ouvir = (mud, area) => {
        const r = area === 'local' && mud[CHAVE_RESPOSTA] && mud[CHAVE_RESPOSTA].newValue;
        if (!r || r.id !== id) return;
        clearTimeout(fim);
        chrome.storage.onChanged.removeListener(ouvir);
        chrome.storage.local.remove([CHAVE_PEDIDO, CHAVE_RESPOSTA]);
        res(r.dados || null);
      };
      const fim = setTimeout(() => { chrome.storage.onChanged.removeListener(ouvir); chrome.storage.local.remove(CHAVE_PEDIDO); res(null); }, ESPERA_STORAGE_MS);
      chrome.storage.onChanged.addListener(ouvir);
      chrome.storage.local.set({ [CHAVE_PEDIDO]: { id, pedido, em: Date.now() } });
    });
  }

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

  async function atualizarJogo(completo) {
    const r = await pedir(completo ? 'estado' : 'ritmo');
    // fora do jogo as chaves continuam valendo: ficam guardadas no Chrome
    $('#nota-chaves').textContent = r ? 'Vale na hora, em todas as abas do jogo.' : 'Fica guardado e vale quando você abrir o jogo.';
    if (!r) { $('#jogo').hidden = true; $('#fora').hidden = false; return; }
    $('#jogo').hidden = false; $('#fora').hidden = true;
    if (r.erro) { $('#freio').textContent = 'Erro: ' + r.erro; return; }
    if (completo) $('#cache').innerHTML = htmlCache(r.cache);
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
    iniciarApoie();
    await iniciarOpcoes();
    mostrarLimpar();
    try { [aba] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (e) { aba = null; }
    await atualizarJogo(true);
    // o freio muda com o tempo; o cache, não. Fora do jogo não fica perguntando.
    setInterval(() => { if (canal) atualizarJogo(false); }, 2000);
  }

  iniciar();
})();
