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

  chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
    if (!msg || typeof msg.pism !== 'string') return false;
    const id = ++ultimoId;
    esperando.set(id, responder);
    paraMain({ tipo: 'pedido', id, pedido: msg.pism });
    setTimeout(() => {
      if (!esperando.has(id)) return;
      esperando.get(id)({ erro: 'o jogo não respondeu' });
      esperando.delete(id);
    }, ESPERA_MS);
    return true; // resposta assíncrona
  });
})();
