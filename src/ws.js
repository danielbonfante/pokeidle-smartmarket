/*
 * Smart Market — ponte com o WebSocket do jogo
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Roda no "MAIN world" em document_start: embrulha o construtor do WebSocket
 * para guardar a conexão do jogo, indexar os Pokémon que passam nas mensagens
 * (os seus e os do mercado) e fazer consultas ao histórico de vendas do RMT
 * pela mesma conexão, com ritmo controlado.
 */
(function () {
  'use strict';
  if (window.PIWs) return;

  const HOST = 'pokeidle.io';
  // Ritmo. Em 11/11/2026 o jogo avisou "o servidor pediu para ir mais devagar" depois de uma
  // sequência de 40 páginas a cada 450 ms (com outra aba do jogo aberta na mesma conta).
  const INTERVALO_MS = 1500;    // pausa mínima entre consultas
  const TETO_POR_MINUTO = 12;   // no máximo 12 consultas em qualquer janela de 60 s
  const PAUSA_AVISO_MS = 3 * 60 * 1000; // se o servidor pedir calma, para tudo por 3 min
  const INTERVALO_MAX_MS = 6000;
  // Orçamento da conexão inteira: outras extensões podem usar o mesmo socket (uma que
  // acompanhe o Mercado pode mandar ~40 mensagens/min sozinha). Só consulta se o total do último minuto, somando
  // todo mundo, estiver abaixo disso; se ficar ocupado por 30 s, desiste e usa o cache.
  // 11/11/2026: com o total perto de 60/min o servidor respondeu {t:'erro', msg:'Devagar aí — muitas mensagens.'}
  const ORCAMENTO_CONEXAO_MIN = 45;
  const ESPERA_CONEXAO_MAX_MS = 30000;
  const CHAVE_FREIO = 'pism-freio'; // o freio vale por 1 h, mesmo recarregando a página
  const FREIO_VALIDADE_MS = 60 * 60 * 1000;
  const TIMEOUT_MS = 6000;
  const MAX_INDICE = 6000;      // Pokémon guardados em memória para achar a ficha aberta

  let socket = null;
  let seq = 7000000 + Math.floor(Math.random() * 100000); // faixa longe da usada pela UI do jogo
  const pendentes = new Map(); // seq -> {resolve, reject, timer}
  const pokemons = new Map();  // id -> objeto do jogo
  const ouvintesVitrine = [];
  let esperaVitrine = null; // { especieId, resolve, reject, timer } da consulta de vitrine em andamento

  function ehPokemon(o) {
    return o && typeof o === 'object' && typeof o.id === 'number' &&
      'speciesId' in o && 'level' in o && 'nota' in o;
  }

  // Guarda só o que o motor usa: nada de nick (caughtBy, apelido…) nem do resto do objeto
  const CAMPOS = ['id', 'speciesId', 'nome', 'level', 'nota', 'quality', 'potencia', 'shiny', 'tmAoe', 'tmElemental', 'tipos', 'poder'];

  function resumir(o) {
    const r = {};
    for (const k of CAMPOS) if (k in o) r[k] = o[k];
    if (o.ivTotal != null) r.ivTotal = o.ivTotal;
    else if (o.ivs && typeof o.ivs === 'object') {
      r.ivTotal = Object.values(o.ivs).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    return r;
  }

  function indexar(obj, profundidade) {
    if (!obj || typeof obj !== 'object' || profundidade > 6) return;
    if (ehPokemon(obj)) {
      pokemons.delete(obj.id);
      pokemons.set(obj.id, resumir(obj));
      if (pokemons.size > MAX_INDICE) pokemons.delete(pokemons.keys().next().value);
    }
    if (Array.isArray(obj)) {
      for (const x of obj) indexar(x, profundidade + 1);
    } else {
      for (const k in obj) {
        const v = obj[k];
        if (v && typeof v === 'object') indexar(v, profundidade + 1);
      }
    }
  }

  function aoReceber(ev) {
    const d = ev.data;
    if (typeof d !== 'string') return;
    // Só abre o JSON das mensagens que interessam (batalha chega o tempo todo)
    const temPokemon = d.indexOf('"speciesId"') !== -1;
    const ehHistorico = d.indexOf('"historicoGlobal"') !== -1;
    const ehVitrine = d.indexOf('"vitrine"') !== -1;
    // Aviso de excesso de mensagens. Em 11/11/2026 o servidor mandou
    // {"t":"erro","msg":"Devagar aí — muitas mensagens."}; por garantia procura também outras
    // formas ("desacelera", "slow down"…) em qualquer mensagem que não seja de chat
    if (/devagar|desacelera|flood|slow down|rate.?limit|too many/i.test(d) && !/"t"\s*:\s*"chat/.test(d) && !temPokemon) {
      frear(d.slice(0, 200));
    }
    if (!temPokemon && !ehHistorico && !ehVitrine) return;
    let j;
    try { j = JSON.parse(d); } catch (e) { return; }
    if (temPokemon) indexar(j, 0);
    // Vitrine do RMT (anúncios de Pokémon): repassa para os selos da vitrine (vitrine.js)
    if (ehVitrine && j.t === 'market' && j.aba === 'vitrine') {
      // A resposta da vitrine não tem seq: a consulta da extensão reconhece a sua pela espécie
      if (esperaVitrine) {
        const linhas = Array.isArray(j.linhas) ? j.linhas : [];
        if (linhas.every(l => l && l.ficha && l.ficha.speciesId === esperaVitrine.especieId)) {
          const e = esperaVitrine;
          esperaVitrine = null;
          clearTimeout(e.timer);
          e.resolve(j);
        }
      }
      ouvintesVitrine.forEach(fn => { try { fn(j); } catch (e) { console.warn('[Smart Market]', e); } });
    }
    if (ehHistorico && j.seq != null && pendentes.has(j.seq)) {
      const p = pendentes.get(j.seq);
      pendentes.delete(j.seq);
      clearTimeout(p.timer);
      p.resolve(j);
    }
  }

  function anexar(ws) {
    socket = ws;
    ws.addEventListener('message', aoReceber);
    ws.addEventListener('close', () => {
      if (socket === ws) socket = null;
      for (const [s, p] of pendentes) { clearTimeout(p.timer); p.reject(new Error('conexão fechada')); pendentes.delete(s); }
    });
  }

  function ehDoJogo(url) {
    try {
      const u = new URL(String(url), location.href);
      return u.hostname === HOST || u.hostname.endsWith('.' + HOST);
    } catch (e) { return false; }
  }

  const Nativo = window.WebSocket;
  function WebSocketPI(url, protocolos) {
    const ws = protocolos === undefined ? new Nativo(url) : new Nativo(url, protocolos);
    if (ehDoJogo(url)) { ws.__pi = true; anexar(ws); }
    return ws;
  }

  // Se a conexão do jogo foi aberta antes deste script (extensão recarregada com
  // o jogo aberto), ela é capturada no próximo envio — o jogo manda ping sempre.
  const enviarNativo = Nativo.prototype.send;
  const enviosConexao = []; // horários de tudo que saiu para o jogo, de qualquer extensão
  let enviandoNosso = false;  // true durante um envio da própria extensão
  let ultimoListar = null;    // último market.listar enviado pelo jogo (para restaurar a vitrine)
  Nativo.prototype.send = function (dados) {
    if (this.__pi || this === socket || ehDoJogo(this.url)) {
      enviosConexao.push(Date.now());
      if (enviosConexao.length > 500) enviosConexao.splice(0, enviosConexao.length - 500);
      // Só o filtro completo da interface do jogo (tem "tiposUnidos"); outras extensões que
      // acompanham o Mercado mandam versões curtas que não representam a vitrine que o usuário está vendo
      if (!enviandoNosso && typeof dados === 'string' && dados.indexOf('"market.listar"') !== -1 && dados.indexOf('"tiposUnidos"') !== -1) {
        try { ultimoListar = JSON.parse(dados); } catch (e) { /* ignora */ }
      }
    }
    if (!this.__pi && this !== socket && ehDoJogo(this.url)) { this.__pi = true; anexar(this); }
    return enviarNativo.apply(this, arguments);
  };

  function enviosNoUltimoMinuto() {
    const limite = Date.now() - 60000;
    while (enviosConexao.length && enviosConexao[0] < limite) enviosConexao.shift();
    return enviosConexao.length;
  }
  WebSocketPI.prototype = Nativo.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => { WebSocketPI[k] = Nativo[k]; });
  window.WebSocket = WebSocketPI;

  // Fila: uma consulta por vez, com pausa entre elas e teto por minuto
  let fila = Promise.resolve();
  let ultimaEm = 0;
  let intervalo = INTERVALO_MS;
  let pausadoAte = 0;
  let freadoEm = 0; // quando o servidor pediu calma pela última vez (o intervalo maior vale 1 h)
  try {
    const f = JSON.parse(localStorage.getItem(CHAVE_FREIO) || 'null');
    if (f && Date.now() - f.em < FREIO_VALIDADE_MS) {
      intervalo = Math.min(Math.max(INTERVALO_MS, f.intervalo || INTERVALO_MS), INTERVALO_MAX_MS);
      pausadoAte = f.pausadoAte || 0;
      freadoEm = f.em;
    }
  } catch (e) { /* sem localStorage: segue com o ritmo padrão */ }
  const enviosRecentes = []; // horários das consultas no último minuto

  /** O servidor pediu para ir mais devagar: pausa as consultas e dobra o intervalo. */
  function frear(motivo) {
    pausadoAte = Date.now() + PAUSA_AVISO_MS;
    freadoEm = Date.now();
    intervalo = Math.min(intervalo * 2, INTERVALO_MAX_MS);
    try { localStorage.setItem(CHAVE_FREIO, JSON.stringify({ intervalo, pausadoAte, em: Date.now() })); } catch (e) {}
    // info, não warn: o Chrome lista warn de extensão como "erro" em chrome://extensions
    console.info('[Smart Market] o jogo pediu para ir mais devagar — consultas pausadas por 3 min, intervalo agora ' + intervalo + ' ms.', motivo || '');
  }

  /** Passada 1 h do último pedido de calma, o intervalo volta ao normal. */
  function soltarFreioVencido() {
    if (freadoEm && Date.now() - freadoEm >= FREIO_VALIDADE_MS) { freadoEm = 0; intervalo = INTERVALO_MS; }
  }

  function erroPausa() {
    const min = Math.max(1, Math.ceil((pausadoAte - Date.now()) / 60000));
    return new Error('o jogo pediu para ir mais devagar; consultas pausadas por ~' + min + ' min');
  }

  /** Envia pela conexão do jogo marcando que é da extensão (não conta como market.listar do jogo). */
  function enviarNosso(obj) {
    if (!socket || socket.readyState !== 1) throw new Error('sem conexão com o jogo');
    enviandoNosso = true;
    try { socket.send(JSON.stringify(obj)); } finally { enviandoNosso = false; }
  }

  function enviar(corpo) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== 1) return reject(new Error('sem conexão com o jogo'));
      const s = ++seq;
      const timer = setTimeout(() => { pendentes.delete(s); reject(new Error('sem resposta do jogo')); }, TIMEOUT_MS);
      pendentes.set(s, { resolve, reject, timer });
      enviarNosso(Object.assign({ t: 'market.historicoGlobal', seq: s }, corpo));
    });
  }

  /** Põe um envio na fila: intervalo, teto por minuto, orçamento da conexão e pausa do freio. */
  // Quando uma consulta desiste porque a conexão está ocupada, as que já estavam na fila desistem
  // junto, sem esperar mais 30 s cada (ex.: Gemas e Coins pedidas ao mesmo tempo).
  let desistiuEm = 0;
  const erroOcupada = () => new Error('a conexão com o jogo está ocupada por outras extensões; tentando mais tarde');

  function agendar(executar) {
    const pedidoEm = Date.now();
    const tarefa = fila.then(async () => {
      soltarFreioVencido();
      if (Date.now() < pausadoAte) throw erroPausa();
      if (pedidoEm <= desistiuEm) throw erroOcupada();
      const espera = ultimaEm + intervalo - Date.now();
      if (espera > 0) await new Promise(r => setTimeout(r, espera));
      // teto por minuto: espera a consulta mais antiga da janela sair dela
      while (enviosRecentes.length && Date.now() - enviosRecentes[0] > 60000) enviosRecentes.shift();
      if (enviosRecentes.length >= TETO_POR_MINUTO) {
        await new Promise(r => setTimeout(r, 60000 - (Date.now() - enviosRecentes[0]) + 50));
        enviosRecentes.shift();
      }
      // orçamento da conexão: cede a vez quando outras extensões já estão usando muito
      const inicioEspera = Date.now();
      while (enviosNoUltimoMinuto() >= ORCAMENTO_CONEXAO_MIN) {
        if (Date.now() - inicioEspera > ESPERA_CONEXAO_MAX_MS) {
          desistiuEm = Date.now();
          throw erroOcupada();
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      if (Date.now() < pausadoAte) throw erroPausa();
      ultimaEm = Date.now();
      enviosRecentes.push(ultimaEm);
      return executar();
    });
    fila = tarefa.catch(() => {});
    return tarefa;
  }

  // soShiny / soP5: os filtros "Só shiny" e "Apenas P5" da Tabela de preços
  function consultarHistorico({ pagina = 0, moeda = 'orb', busca = '', soShiny = false, soP5 = false } = {}) {
    return agendar(() => {
      const corpo = { pagina, tipo: 'pokemon', moeda };
      if (busca) corpo.busca = busca;
      if (soShiny) corpo.soShiny = 1;
      if (soP5) corpo.soP5 = 1;
      return enviar(corpo);
    });
  }

  /**
   * Uma página de anúncios de uma espécie (o mesmo filtro de clicar na espécie no Mercado).
   * Resolve com a próxima vitrine que chegar só com aquela espécie.
   */
  function consultarVitrine({ especieId, moeda = 'orb' } = {}) {
    return agendar(() => new Promise((resolve, reject) => {
      if (esperaVitrine) { clearTimeout(esperaVitrine.timer); esperaVitrine.reject(new Error('consulta substituída')); }
      const timer = setTimeout(() => {
        if (esperaVitrine && esperaVitrine.timer === timer) esperaVitrine = null;
        reject(new Error('sem resposta do jogo'));
      }, TIMEOUT_MS);
      esperaVitrine = { especieId, resolve, reject, timer };
      try {
        enviarNosso({ t: 'market.listar', tipo: 'pokemon', moeda, busca: '', ordem: 'baratos', pagina: 0, especieId, soShiny: false, soP5: false });
      } catch (e) {
        clearTimeout(timer);
        esperaVitrine = null;
        reject(e);
      }
    }));
  }

  /** Reenvia o último market.listar do jogo, para a vitrine atrás da folha voltar ao que era. */
  function restaurarVitrine(msg) {
    return agendar(() => { enviarNosso(msg); });
  }

  window.PIWs = {
    consultarHistorico,
    consultarVitrine,
    restaurarVitrine,
    ultimoListarDoJogo: () => ultimoListar,
    pokemon: id => pokemons.get(Number(id)) || null,
    pokemonsIndexados: () => [...pokemons.values()],
    conectado: () => !!socket && socket.readyState === 1,
    aoReceberVitrine: fn => { ouvintesVitrine.push(fn); },
    pausado: () => Date.now() < pausadoAte,
    ritmo: () => (soltarFreioVencido(), { intervalo, intervaloNormal: INTERVALO_MS, pausadoAte, freioAte: freadoEm ? freadoEm + FREIO_VALIDADE_MS : 0, tetoPorMinuto: TETO_POR_MINUTO, orcamentoConexao: ORCAMENTO_CONEXAO_MIN, enviosConexaoUltimoMinuto: enviosNoUltimoMinuto() }),
    _frear: frear,
  };
})();
