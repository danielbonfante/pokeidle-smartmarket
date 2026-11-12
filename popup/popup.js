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
  const PADRAO = { quadro: true, selos: true, painel: true };
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
  }

  // ---------- aba do jogo ----------
  function pedir(pedido) {
    return new Promise(res => {
      if (!aba) return res(null);
      chrome.tabs.sendMessage(aba.id, { pism: pedido }, r => {
        if (chrome.runtime.lastError) return res(null); // aba sem a extensão (não é o jogo)
        res(r || null);
      });
    });
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
    return `<div class="linha">${estado}</div>${conexao}`;
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
    setInterval(() => atualizarJogo(false), 2000); // o freio muda com o tempo; o cache, não
  }

  iniciar();
})();
