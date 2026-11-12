/*
 * Smart Market — configuração do popup, no lado do jogo (MAIN world)
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * O MAIN world não tem chrome.*. Quem lê o chrome.storage é a ponte (src/ponte.js, mundo
 * ISOLATED), que manda a configuração para cá por window.postMessage. Os pedidos do popup
 * (ver o cache e o freio, limpar o cache) chegam pelo mesmo caminho e são respondidos aqui.
 * As mensagens trazem `fonte`: 'pism-ponte' (de lá para cá) e 'pism-main' (daqui para lá).
 */
(function (root) {
  'use strict';

  const PADRAO = { quadro: true, selos: true, painel: true };

  /** Configuração com os padrões, só com as chaves conhecidas e valores booleanos. */
  function mesclar(c) {
    const r = Object.assign({}, PADRAO);
    if (c && typeof c === 'object') for (const k in PADRAO) if (typeof c[k] === 'boolean') r[k] = c[k];
    return r;
  }

  const pura = { PADRAO, mesclar };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pura; return; }
  if (root.PIConfig) return;

  let atual = mesclar(null);
  const ouvintes = [];

  function paraPonte(msg) {
    root.postMessage(Object.assign({ fonte: 'pism-main' }, msg), root.location.origin);
  }

  async function estado() {
    const ws = root.PIWs;
    return {
      conectado: !!(ws && ws.conectado()),
      ritmo: ws ? ws.ritmo() : null,
      cache: root.PIStore ? await root.PIStore.resumo() : null,
    };
  }

  const PEDIDOS = {
    estado,
    // leve, para o popup atualizar o freio enquanto fica aberto
    ritmo: async () => ({ conectado: !!(root.PIWs && root.PIWs.conectado()), ritmo: root.PIWs ? root.PIWs.ritmo() : null }),
    'limpar-cache': async () => { await root.PIStore.limpar(); return estado(); },
  };

  async function responder(id, pedido) {
    let dados;
    try {
      const fn = PEDIDOS[pedido];
      dados = fn ? await fn() : { erro: 'pedido desconhecido: ' + pedido };
    } catch (e) {
      dados = { erro: e.message };
    }
    paraPonte({ tipo: 'resposta', id, dados });
  }

  root.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== root || !d || d.fonte !== 'pism-ponte') return;
    if (d.tipo === 'config') {
      const nova = mesclar(d.config);
      if (JSON.stringify(nova) === JSON.stringify(atual)) return;
      atual = nova;
      ouvintes.forEach(fn => { try { fn(atual); } catch (e) { console.warn('[Smart Market]', e); } });
    } else if (d.tipo === 'pedido') {
      responder(d.id, d.pedido);
    }
  });

  root.PIConfig = {
    PADRAO,
    ligado: chave => atual[chave] !== false,
    aoMudar: fn => { ouvintes.push(fn); },
  };

  // a ponte pode ter mandado a configuração antes deste script carregar: pede de novo
  paraPonte({ tipo: 'pedir-config' });
})(typeof window !== 'undefined' ? window : globalThis);
