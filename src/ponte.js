/*
 * Smart Market — ponte entre o popup e o jogo (mundo ISOLATED)
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Os scripts da extensão rodam no MAIN world, que não tem chrome.*. Esta ponte roda no
 * mundo ISOLATED da mesma página: lê a configuração no chrome.storage e a manda para o
 * MAIN world (src/config.js) por window.postMessage, e repassa os pedidos do popup
 * (chrome.tabs.sendMessage) para lá, devolvendo a resposta.
 */
(function () {
  'use strict';
  const PADRAO = { quadro: true, selos: true, painel: true, dinheiro: 'usd', cotacaoBrl: 5.5 };
  const ESPERA_MS = 5000;

  function paraMain(msg) {
    window.postMessage(Object.assign({ fonte: 'pism-ponte' }, msg), location.origin);
  }

  function enviarConfig() {
    chrome.storage.local.get('config', r => {
      paraMain({ tipo: 'config', config: Object.assign({}, PADRAO, r && r.config) });
    });
  }

  enviarConfig();
  chrome.storage.onChanged.addListener((mud, area) => {
    if (area === 'local' && mud.config) enviarConfig();
  });

  let ultimoId = 0;
  const esperando = new Map(); // id -> responder do popup

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || !d || d.fonte !== 'pism-main') return;
    if (d.tipo === 'pedir-config') enviarConfig();
    else if (d.tipo === 'resposta' && esperando.has(d.id)) {
      esperando.get(d.id)(d.dados);
      esperando.delete(d.id);
    }
  });

  /** Passa um pedido do popup para o MAIN world e entrega a resposta (ou um erro depois de 5 s). */
  function encaminhar(pedido, responder) {
    const id = ++ultimoId;
    esperando.set(id, responder);
    paraMain({ tipo: 'pedido', id, pedido });
    setTimeout(() => {
      if (!esperando.has(id)) return;
      esperando.get(id)({ erro: 'o jogo não respondeu' });
      esperando.delete(id);
    }, ESPERA_MS);
  }

  chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
    if (!msg || typeof msg.pism !== 'string') return false;
    encaminhar(msg.pism, responder);
    return true; // resposta assíncrona
  });

  // Plano B do popup: em navegadores em que o chrome.tabs.sendMessage não chega à aba, o popup grava o
  // pedido em "pism-pedido" e espera a resposta em "pism-resposta" (só os números do cache e do freio;
  // o popup apaga as duas chaves). Pedidos com mais de 5 s são ignorados.
  chrome.storage.onChanged.addListener((mud, area) => {
    const p = area === 'local' && mud['pism-pedido'] && mud['pism-pedido'].newValue;
    if (!p || !p.id || typeof p.pedido !== 'string' || Date.now() - p.em > ESPERA_MS) return;
    encaminhar(p.pedido, dados => chrome.storage.local.set({ 'pism-resposta': { id: p.id, dados, em: Date.now() } }));
  });
})();
