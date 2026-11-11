/*
 * Pokeidle Smart Market — cache local de vendas (IndexedDB)
 *
 * Cada venda é guardada pelo id da venda, sem nick de vendedor, comprador
 * ou de quem capturou. O cache cresce com o uso: toda espécie consultada
 * soma vendas novas, e as antigas continuam lá além dos 30 dias do jogo.
 */
(function () {
  'use strict';
  if (window.PIStore) return;

  const NOME = 'pokeidle-preco'; // nome antigo mantido de propósito: trocar apagaria o cache de quem já usa
  const VERSAO = 1;
  let dbPromise = null;

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

  window.PIStore = { salvarVendas, vendasPorEspecie, vendasPorClasse, lerSync, gravarSync, contar, resumo, limpar };
})();
