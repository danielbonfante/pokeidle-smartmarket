/*
 * Smart Market — Gemas em dólar (USDT) e real (BRL)
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Valores em Gemas assustam quem não sabe quanto valem. O jogo vende Gemas por USDT e compra de
 * volta (telas "Depósito — comprar Gemas" e "Saque — Gemas para USDT" do RMT): em 13/11/2026,
 * 0,0100 USDT por Gema na compra e 0,0090 no saque. Cada tela da extensão usa a cotação de quem
 * está ali: quem compra na vitrine paga em Gemas (compra); quem vende recebe Gemas e saca (saque,
 * sobre o líquido). O real vem da cotação digitada no popup (a extensão não consulta nenhum site).
 *
 * Os elementos com class "pp-dinheiro", data-gemas e data-tipo ("compra" ou "saque") são
 * preenchidos por pintar(); data-parte escolhe o formato ("usd", "brl" ou "ambos").
 * Se a extensão vir as telas de depósito/saque com outra cotação, guarda a nova (localStorage
 * "pism-cotacao") e repinta tudo.
 */
(function (root) {
  'use strict';

  const COTACAO_PADRAO = { compra: 0.01, saque: 0.009 }; // USDT por Gema (telas do RMT, 13/11/2026)
  const BRL_PADRAO = 5.5;                                  // R$ por USDT (dólar a R$ 5,51 em 9/11/2026)
  const MODOS = ['nada', 'usd', 'usd-brl'];
  const CHAVE = 'pism-cotacao';

  // centavos só abaixo de 100 (acima disso, ",00" ocupa espaço sem dizer nada)
  const casas = x => (x >= 100 ? 0 : 2);
  function valor(x) {
    if (!isFinite(x) || x <= 0) return '';
    if (x < 0.01) return '< 0,01';
    const c = casas(x);
    return x.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  }

  /**
   * Texto do valor em dinheiro de `gemas`, na cotação `tipo` ('compra' | 'saque'), conforme o
   * modo do popup ('nada' | 'usd' | 'usd-brl') e a cotação do real.
   * parte: 'usd' → "1,17"; 'brl' → "6,44" (só no modo usd-brl); 'ambos' → "US$ 1,17 · R$ 6,44".
   * Sem "≈": na extensão o "≈" quer dizer só "preço estimado pela Nota" (13/11/2026).
   */
  function texto(gemas, tipo, parte, opcoes) {
    const o = Object.assign({ modo: 'usd', brl: BRL_PADRAO, cotacao: COTACAO_PADRAO }, opcoes);
    if (o.modo === 'nada' || !(Number(gemas) > 0)) return '';
    // Gemas inteiras, como o jogo paga (o "VOCÊ RECEBE" e o líq da extensão cortam os quebrados)
    const usd = Math.floor(Number(gemas)) * (o.cotacao[tipo] || COTACAO_PADRAO[tipo] || COTACAO_PADRAO.compra);
    const comBrl = o.modo === 'usd-brl' && o.brl > 0;
    if (parte === 'usd') return valor(usd);
    if (parte === 'brl') return comBrl ? valor(usd * o.brl) : '';
    return 'US$ ' + valor(usd) + (comBrl ? ' · R$ ' + valor(usd * o.brl) : '');
  }

  /** Lê "0.0100 USDT por Gema" (ou "0,0090 USDT por Gema") de um texto; null se não achar ou não fizer sentido. */
  function lerCotacao(txt) {
    const m = String(txt || '').match(/(\d+[.,]\d+)\s*USDT\s*por\s*Gema/i);
    if (!m) return null;
    const v = Number(m[1].replace(',', '.'));
    return v >= 0.001 && v <= 1 ? v : null;
  }

  /** Tipo da tela pelo título: depósito (compra de Gemas) ou saque. */
  function tipoDaTela(txt) {
    const t = String(txt || '').toLowerCase();
    if (/saque|sacar/.test(t)) return 'saque';
    if (/dep[oó]sito|comprar gemas/.test(t)) return 'compra';
    return null;
  }

  const pura = { COTACAO_PADRAO, BRL_PADRAO, MODOS, texto, lerCotacao, tipoDaTela };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pura; return; }
  if (root.PIDinheiro) return;

  // ---------- no navegador ----------
  let cotacao = Object.assign({}, COTACAO_PADRAO);
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (c) for (const k of ['compra', 'saque']) if (c[k] >= 0.001 && c[k] <= 1) cotacao[k] = c[k];
  } catch (e) { /* sem localStorage: fica com o padrão */ }

  const opcoes = () => {
    const cfg = root.PIConfig;
    return { modo: cfg ? cfg.valor('dinheiro') : 'usd', brl: cfg ? cfg.valor('cotacaoBrl') : BRL_PADRAO, cotacao };
  };
  const ouvintes = [];

  /** Preenche (ou esconde) os elementos .pp-dinheiro dentro de `raiz`. */
  function pintar(raiz) {
    const o = opcoes();
    (raiz || document).querySelectorAll('.pp-dinheiro[data-tipo]').forEach(el => {
      const t = texto(Number(el.dataset.gemas), el.dataset.tipo, el.dataset.parte || 'ambos', o);
      el.textContent = t;
      el.hidden = !t;
    });
    // linhas inteiras (quadro da ficha): somem quando nenhuma célula tem valor
    (raiz || document).querySelectorAll('.pp-dinheiro-linha').forEach(l => {
      l.hidden = ![...l.querySelectorAll('.pp-dinheiro')].some(el => el.textContent);
    });
  }

  function mudou() {
    pintar(document);
    ouvintes.forEach(fn => { try { fn(); } catch (e) { console.warn('[Smart Market]', e); } });
  }

  // Telas de depósito/saque do jogo: lê a cotação quando aparecem (no máximo uma olhada a cada 2 s)
  function procurarCotacao() {
    let achou = false;
    const r = document.evaluate("//*[contains(text(), 'USDT por Gema')]", document.body || document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < r.snapshotLength; i++) {
      const el = r.snapshotItem(i);
      const v = lerCotacao(el.textContent);
      const tela = el.closest('.modal, [role="dialog"], [class*="modal"]') || el.parentElement;
      const tipo = tipoDaTela(tela && (tela.querySelector('h1, h2, h3, [class*="titulo"], [class*="title"]') || tela).textContent);
      if (v && tipo && cotacao[tipo] !== v) { cotacao[tipo] = v; achou = true; }
    }
    if (!achou) return;
    try { localStorage.setItem(CHAVE, JSON.stringify(Object.assign({ em: Date.now() }, cotacao))); } catch (e) {}
    console.info('[Smart Market] cotação das Gemas lida no jogo: compra ' + cotacao.compra + ', saque ' + cotacao.saque + ' USDT por Gema');
    mudou();
  }
  let agendado = null;
  function observar() {
    if (!document.body) { setTimeout(observar, 500); return; }
    new MutationObserver(() => {
      if (agendado) return;
      agendado = setTimeout(() => { agendado = null; procurarCotacao(); }, 2000);
    }).observe(document.body, { childList: true, subtree: true });
  }
  observar();
  if (root.PIConfig) root.PIConfig.aoMudar(mudou);

  root.PIDinheiro = Object.assign({}, pura, {
    pintar,
    texto: (gemas, tipo, parte) => texto(gemas, tipo, parte, opcoes()),
    cotacao: () => Object.assign({}, cotacao),
    aoMudar: fn => { ouvintes.push(fn); },
  });
})(typeof window !== 'undefined' ? window : globalThis);
