/*
 * Smart Market — cache local de vendas (IndexedDB)
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Cada venda é guardada pelo id da venda, sem nick de vendedor, comprador
 * ou de quem capturou. Toda espécie consultada soma vendas novas; as que
 * passam de 30 dias (a janela do preço) são apagadas uma vez por dia.
 */
(function () {
  'use strict';
  if (window.PIStore) return;

  const NOME = 'pokeidle-preco'; // nome antigo mantido de propósito: trocar apagaria o cache de quem já usa
  const VERSAO = 1;
  let dbPromise = null;
  const DIA = 24 * 60 * 60 * 1000;
  const GUARDAR_DIAS = 30;                  // a janela do motor (PIMotor.PADRAO.janelaDias)
  const PODA_CHAVE = 'poda';                // no store 'sync': quando foi a última poda
  const PODA_INICIO_MS = 20 * 1000;         // depois de abrir o jogo, sem disputar com a primeira ficha
  const PODA_CONFERIR_MS = 60 * 60 * 1000;  // com o jogo aberto por dias, confere de hora em hora

  function abrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        const vendas = db.createObjectStore('vendas', { keyPath: 'id' });
        vendas.createIndex('speciesId', 'speciesId');
        vendas.createIndex('nome', 'nome');
        db.createObjectStore('sync', { keyPath: 'chave' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(loja, modo, fn) {
    return abrir().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(loja, modo);
      const r = fn(t.objectStore(loja));
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : r);
      t.onerror = () => reject(t.error);
    }));
  }

  function salvarVendas(vendas) {
    if (!vendas.length) return Promise.resolve();
    return tx('vendas', 'readwrite', s => { vendas.forEach(v => s.put(v)); });
  }

  function vendasPorEspecie(speciesId, nome) {
    return abrir().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('vendas', 'readonly');
      const s = t.objectStore('vendas');
      const req = speciesId != null
        ? s.index('speciesId').getAll(speciesId)
        : s.index('nome').getAll(nome);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  }

  /** Vendas de uma classe de mercado ('S' shiny, 'P5'), de qualquer espécie. */
  function vendasPorClasse(classe) {
    return tx('vendas', 'readonly', s => s.getAll())
      .then(todas => (todas || []).filter(v => window.PIMotor.classeDe(v) === classe));
  }

  function lerSync(chave) {
    return tx('sync', 'readonly', s => s.get(chave));
  }

  function gravarSync(registro) {
    return tx('sync', 'readwrite', s => { s.put(registro); });
  }

  function contar() {
    return tx('vendas', 'readonly', s => s.count());
  }

  /** Resumo do cache para o popup: quantas vendas e espécies, e o período coberto. */
  function resumo() {
    return tx('vendas', 'readonly', s => s.getAll()).then(todas => {
      const especies = new Set();
      let maisAntiga = 0, maisNova = 0;
      for (const v of todas || []) {
        especies.add(v.speciesId != null ? v.speciesId : v.nome);
        if (!maisAntiga || v.em < maisAntiga) maisAntiga = v.em;
        if (v.em > maisNova) maisNova = v.em;
      }
      return { vendas: (todas || []).length, especies: especies.size, maisAntiga, maisNova };
    });
  }

  /** Apaga as vendas e o controle de sync; tudo volta a ser baixado aos poucos, sob demanda. */
  function limpar() {
    return abrir().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(['vendas', 'sync'], 'readwrite');
      t.objectStore('vendas').clear();
      t.objectStore('sync').clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }));
  }

  /**
   * Apaga as vendas com mais de 30 dias, que o preço já não usa. O controle de sync (maxId)
   * fica: a busca continua parando nelas e não as baixa de novo. Devolve quantas apagou.
   */
  function podar(agora) {
    const t0 = agora || Date.now();
    const limite = t0 - GUARDAR_DIAS * DIA;
    return abrir().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(['vendas', 'sync'], 'readwrite');
      let apagadas = 0;
      const req = t.objectStore('vendas').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { t.objectStore('sync').put({ chave: PODA_CHAVE, em: t0, apagadas }); return; }
        if (!(Number(c.value.em) >= limite)) { c.delete(); apagadas++; }
        c.continue();
      };
      t.oncomplete = () => resolve(apagadas);
      t.onerror = () => reject(t.error);
    }));
  }

  /**
   * Poda se a última foi há mais de 1 dia; senão devolve null. Com a Tabela de preços do jogo fora
   * do ar (ws.js) não poda: sem vendas novas, as guardadas são tudo o que sobra para o preço.
   */
  function podarSeVencido(agora) {
    const t0 = agora || Date.now();
    const tabela = window.PIWs && window.PIWs.tabela ? window.PIWs.tabela() : null;
    if (tabela && tabela.fora) return Promise.resolve(null);
    return lerSync(PODA_CHAVE).then(u => (u && t0 - u.em < DIA ? null : podar(t0)));
  }

  function agendarPoda(ms) {
    setTimeout(() => {
      podarSeVencido()
        .then(n => { if (n) console.info('[Smart Market] cache: ' + n + ' vendas com mais de 30 dias apagadas'); })
        .catch(() => {})
        .then(() => agendarPoda(PODA_CONFERIR_MS));
    }, ms);
  }
  agendarPoda(PODA_INICIO_MS);

  window.PIStore = { salvarVendas, vendasPorEspecie, vendasPorClasse, lerSync, gravarSync, contar, resumo, limpar, podar, podarSeVencido };
})();
