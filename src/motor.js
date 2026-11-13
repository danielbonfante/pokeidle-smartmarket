/*
 * Smart Market — motor de precificação
 * © 2026 dan_the_treiner — uso pessoal; proibido redistribuir, modificar para publicar ou vender (ver LICENSE).
 *
 * Estima o preço de um Pokémon a partir de vendas parecidas da mesma espécie.
 * Cada venda recebe um peso pela semelhança (Nota, nível, potência, AoE/Z-Move)
 * e pela idade; os três preços são quartis ponderados (25% / 50% / 75%).
 *
 * Funciona no navegador (window.PIMotor) e no Node (module.exports), para testes.
 */
(function (root) {
  'use strict';

  const DIA = 24 * 60 * 60 * 1000;

  const PADRAO = {
    janelaDias: 30,      // vendas mais antigas que isso são ignoradas
    meiaVidaDias: 5,     // uma venda de 5 dias atrás vale metade de uma de agora
    // Escalas ajustadas no backtest com a planilha do jogo (10/11/2026)
    escalaNota: 0.08,    // diferença de Nota que já pesa bastante (a Nota vai de 0 a 10)
    escalaNivel: 0.25,   // diferença em log(nível); 0,25 ≈ nível 100 vs 128
    escalaPotencia: 1.5, // diferença de potência (P1, P2, P3…)
    pesoSemExtraIgual: 0.3, // peso para venda com AoE/Z-Move/Mega diferente do alvo
    minVendas: 3,
  };

  /** Normaliza uma venda vinda do WebSocket (linha do historicoGlobal) para o formato do cache. */
  function normalizarVenda(linha) {
    const f = linha && linha.ficha;
    if (!f || linha.tipo !== 'pokemon') return null;
    // número do Pokémon vendido (desde 13/11/2026): mostra quando uma venda é do mesmo Pokémon que
    // está na tela (revenda). Vendas guardadas antes disso não têm; somem do cache em até 30 dias.
    const pokemonId = Number(linha.pokemonId || f.id) || null;
    return {
      id: linha.id,
      pokemonId,
      em: linha.em,
      moeda: linha.moeda, // 'orb' = Gemas, 'gold' = Coins
      preco: Number(linha.bruto),
      speciesId: f.speciesId,
      nome: f.nome,
      level: Number(f.level) || 1,
      nota: Number(f.nota) || 0,
      ivTotal: Number(f.ivTotal) || 0,
      quality: Number(f.quality) || 0,
      potencia: Number(f.potencia) || 0,
      shiny: !!f.shiny,
      aoe: !!f.tmAoe,
      zmove: !!f.tmElemental,
      mega: /^mega\s/i.test(f.nome || ''),
      refino: Number(f.refinoTotal) || 0,
    };
  }

  /** Normaliza um Pokémon (objeto do jogo) para o formato de alvo do motor. */
  function normalizarAlvo(p) {
    return {
      id: p.id,
      speciesId: p.speciesId,
      nome: p.nome,
      level: Number(p.level) || 1,
      nota: Number(p.nota) || 0,
      ivTotal: Number(p.ivTotal) || 0,
      quality: Number(p.quality) || 0,
      potencia: Number(p.potencia) || 0,
      shiny: !!p.shiny,
      aoe: !!(p.tmAoe ?? p.aoe),
      zmove: !!(p.tmElemental ?? p.zmove),
      mega: p.mega ?? /^mega\s/i.test(p.nome || ''),
    };
  }

  /** A venda é deste mesmo Pokémon (revenda)? Precisa do número do Pokémon na venda (guardado desde 13/11/2026). */
  function mesmoPokemon(alvo, v) {
    return !!(alvo && v && v.pokemonId && alvo.id && Number(v.pokemonId) === Number(alvo.id));
  }

  function mesmaEspecie(alvo, v) {
    if (alvo.speciesId != null && v.speciesId != null) return alvo.speciesId === v.speciesId;
    return String(alvo.nome || '').toLowerCase() === String(v.nome || '').toLowerCase();
  }

  function pesoVenda(alvo, v, agora, cfg) {
    const dn = (v.nota - alvo.nota) / cfg.escalaNota;
    const dl = (Math.log(v.level) - Math.log(alvo.level)) / cfg.escalaNivel;
    const dp = (v.potencia - alvo.potencia) / cfg.escalaPotencia;
    let w = Math.exp(-(dn * dn + dl * dl + dp * dp) / 2);
    const idadeDias = Math.max(0, (agora - v.em) / DIA);
    w *= Math.pow(0.5, idadeDias / cfg.meiaVidaDias);
    if (v.aoe !== alvo.aoe) w *= cfg.pesoSemExtraIgual;
    if (v.zmove !== alvo.zmove) w *= cfg.pesoSemExtraIgual;
    if (v.mega !== alvo.mega) w *= cfg.pesoSemExtraIgual;
    return w;
  }

  function quantilPonderado(pares, q) {
    // pares: [{x, w}] ordenados por x
    const total = pares.reduce((s, p) => s + p.w, 0);
    if (!total) return NaN;
    const alvo = q * total;
    let acc = 0;
    for (let i = 0; i < pares.length; i++) {
      const prox = acc + pares[i].w;
      if (prox >= alvo) {
        // interpolação dentro do degrau, para não "pular" entre vendas
        const anterior = i > 0 ? pares[i - 1].x : pares[i].x;
        const frac = pares[i].w ? (alvo - acc) / pares[i].w : 1;
        return i > 0 ? anterior + (pares[i].x - anterior) * Math.min(1, Math.max(0, frac)) : pares[i].x;
      }
      acc = prox;
    }
    return pares[pares.length - 1].x;
  }

  /**
   * Calcula o preço de `alvo` com base em `vendas` (já normalizadas).
   * Retorna null quando não há vendas suficientes da espécie naquela moeda.
   */
  function precificar(alvo, vendas, opcoes) {
    const cfg = Object.assign({}, PADRAO, opcoes);
    const agora = cfg.agora || Date.now();
    const desde = agora - cfg.janelaDias * DIA;

    const candidatas = vendas.filter(v =>
      v.moeda === cfg.moeda &&
      v.em >= desde && v.em <= agora &&
      v.shiny === alvo.shiny &&
      v.preco > 0 &&
      v.id !== alvo.vendaId &&
      mesmaEspecie(alvo, v)
    );
    if (candidatas.length < cfg.minVendas) {
      return { suficiente: false, vendasEspecie: candidatas.length, comparaveis: candidatas.slice(0, 8) };
    }

    const pesadas = candidatas
      .map(v => ({ v, w: pesoVenda(alvo, v, agora, cfg) }))
      .filter(p => p.w > 1e-6);
    if (pesadas.length < cfg.minVendas) {
      return { suficiente: false, vendasEspecie: candidatas.length, comparaveis: candidatas.slice(0, 8) };
    }
    return resultado(pesadas, candidatas.length, cfg);
  }

  /** Quartis ponderados, confiança e vendas que mais pesaram. */
  function resultado(pesadas, vendasEspecie, cfg) {
    // Trabalha em log: preços variam por ordens de grandeza
    const pares = pesadas.map(p => ({ x: Math.log(p.v.preco), w: p.w })).sort((a, b) => a.x - b.x);
    let q1 = Math.exp(quantilPonderado(pares, 0.25));
    const q2 = Math.exp(quantilPonderado(pares, 0.5));
    let q3 = Math.exp(quantilPonderado(pares, 0.75));

    const somaW = pesadas.reduce((s, p) => s + p.w, 0);
    const somaW2 = pesadas.reduce((s, p) => s + p.w * p.w, 0);
    const nEfetivo = (somaW * somaW) / somaW2;

    // Faixa honesta quando poucas vendas dominam (nEfetivo < 3). O peso concentrado numa venda
    // fechava a faixa em volta dela: na planilha de 11/11/2026, com nEfetivo < 2 o pago caía dentro
    // da faixa só 15% das vezes (deveria ser ~50%), e o selo dava "+59%" com uma certeza que não
    // existia (o Mega Dragonite revendido de 13/11/2026). A faixa passa a ter pelo menos a largura
    // das vendas parecidas com o peso achatado (raiz), vezes 3/nEfetivo (até 3×): 15% → 39% (< 2) e
    // 32% → 48% (2–3); com nEfetivo ≥ 3 nada muda, e o Preço justo nunca muda.
    let faixaAlargada = false;
    if (nEfetivo < 3) {
      const achatados = pesadas.map(p => ({ x: Math.log(p.v.preco), w: Math.sqrt(p.w) })).sort((a, b) => a.x - b.x);
      const fator = Math.min(3, Math.max(1, 3 / nEfetivo));
      const meia = fator * (quantilPonderado(achatados, 0.75) - quantilPonderado(achatados, 0.25)) / 2;
      const l2 = Math.log(q2);
      const n1 = Math.min(q1, Math.exp(l2 - meia)), n3 = Math.max(q3, Math.exp(l2 + meia));
      faixaAlargada = n1 < q1 * 0.999 || n3 > q3 * 1.001;
      q1 = n1; q3 = n3;
    }
    const dispersao = q2 ? (q3 - q1) / q2 : Infinity;

    let confianca = 'baixa';
    if (nEfetivo >= 8 && dispersao <= 0.6) confianca = 'alta';
    else if (nEfetivo >= 3 && dispersao <= 1.2) confianca = 'media';

    const comparaveis = pesadas
      .sort((a, b) => b.w - a.w)
      .slice(0, 8)
      .map(p => Object.assign({ peso: p.w / pesadas[0].w }, p.v));

    return {
      suficiente: true,
      moeda: cfg.moeda,
      venderRapido: q1,
      precoJusto: q2,
      esperar: q3,
      nEfetivo,
      vendasEspecie,
      dispersao,
      confianca,
      faixaAlargada, // poucas vendas parecidas: Vender rápido/Esperar foram afastados do justo
      comparaveis,
    };
  }

  // ---------- classe de mercado ----------
  // (A estimativa pela Nota, que usava vendas de outras espécies da mesma classe para shiny/P5 sem
  // vendas da espécie, foi tirada em 13/11/2026: a espécie pesa muito no preço. Sem vendas parecidas
  // da espécie, a extensão diz isso e não estima.)

  /**
   * Classe de mercado: o preço de shiny e de P5 vive em outra escala que o do comum.
   * Shiny P5 fica junto dos shiny: é raríssimo, e a Nota já carrega a potência.
   */
  function classeDe(p) {
    if (p.shiny) return 'S';
    return Number(p.potencia) >= 5 ? 'P5' : '';
  }


  /** Arredonda para um número "de vitrine": 2 algarismos significativos para valores altos. */
  function arredondarPreco(x) {
    if (!isFinite(x)) return x;
    if (x < 100) return Math.max(1, Math.round(x));
    const mag = Math.pow(10, Math.floor(Math.log10(x)) - 1);
    return Math.round(x / mag) * mag;
  }

  // Lendários e míticos do jogo (Pokepédia → Lendários e Míticos). Entram no Mercado em qualquer nível/Nota.
  const LENDARIOS = new Set(('Articuno,Zapdos,Moltres,Mewtwo,Raikou,Entei,Suicune,Lugia,Ho-oh,Regirock,Regice,Registeel,' +
    'Latias,Latios,Kyogre,Groudon,Rayquaza,Uxie,Mesprit,Azelf,Dialga,Palkia,Heatran,Regigigas,Giratina,Cresselia,' +
    'Cobalion,Terrakion,Virizion,Tornadus,Thundurus,Reshiram,Zekrom,Landorus,Kyurem,Xerneas,Yveltal,Zygarde,Type: Null,' +
    'Silvally,Tapu Koko,Tapu Lele,Tapu Bulu,Tapu Fini,Cosmog,Cosmoem,Solgaleo,Lunala,Nihilego,Buzzwole,Pheromosa,' +
    'Xurkitree,Celesteela,Kartana,Guzzlord,Necrozma,Poipole,Naganadel,Stakataka,Blacephalon,Zacian,Zamazenta,Eternatus,' +
    'Kubfu,Urshifu,Regieleki,Regidrago,Glastrier,Spectrier,Calyrex,Enamorus,Wo-Chien,Chien-Pao,Ting-Lu,Chi-Yu,Koraidon,' +
    'Miraidon,Walking Wake,Iron Leaves,Okidogi,Munkidori,Fezandipiti,Ogerpon,Gouging Fire,Raging Bolt,Iron Boulder,' +
    'Iron Crown,Terapagos,Mew,Celebi,Jirachi,Deoxys,Phione,Manaphy,Darkrai,Shaymin,Arceus,Victini,Keldeo,Meloetta,' +
    'Genesect,Diancie,Hoopa,Volcanion,Magearna,Marshadow,Zeraora,Meltan,Melmetal,Zarude,Pecharunt')
    .split(',').map(n => n.toLowerCase()));

  function ehLendario(nome) {
    const base = String(nome || '').toLowerCase().trim()
      .replace(/^(mega|primal)\s+/, '')
      .replace(/\s+[xyz]$/, '');
    return LENDARIOS.has(base);
  }

  // Faixa mínima para anunciar no Mercado da Comunidade (Pokepédia → Mercado da Comunidade)
  const FAIXA_MERCADO = { nivelMin: 50, notaMin: 3.5 };

  /**
   * Diz se o Pokémon pode ser anunciado no RMT. Fora da faixa ele não tem preço de mercado.
   * Retorna { pode, livre, faltaNivel, faltaNota }.
   */
  function faixaMercado(alvo) {
    const livre = !!alvo.shiny || Number(alvo.potencia) >= 5 || ehLendario(alvo.nome);
    if (livre) return { pode: true, livre: true, faltaNivel: false, faltaNota: false };
    const faltaNivel = !(Number(alvo.level) >= FAIXA_MERCADO.nivelMin);
    const faltaNota = !(Number(alvo.nota) >= FAIXA_MERCADO.notaMin);
    return { pode: !faltaNivel && !faltaNota, livre: false, faltaNivel, faltaNota };
  }

  // Comissão do Mercado da Comunidade, paga pelo vendedor (Pokepédia → Todas as taxas)
  const COMISSAO = {
    gold: 0.15, // anúncio em Coins: 15%
    // Pokémon em Gemas: por faixa, como imposto de renda
    orbFaixas: [{ ate: 500, taxa: 0.13 }, { ate: 5000, taxa: 0.10 }, { ate: Infinity, taxa: 0.075 }],
  };

  /** Quanto o vendedor recebe por um Pokémon vendido por `preco` na `moeda`, depois da comissão. */
  function liquidoVendedor(preco, moeda) {
    if (!(preco > 0)) return 0;
    if (moeda !== 'orb') return preco * (1 - COMISSAO.gold);
    let resto = preco, base = 0, liquido = 0;
    for (const f of COMISSAO.orbFaixas) {
      const pedaco = Math.min(resto, f.ate - base);
      if (pedaco <= 0) break;
      liquido += pedaco * (1 - f.taxa);
      resto -= pedaco;
      base = f.ate;
    }
    return liquido;
  }

  /**
   * Valor exato para o "líq" (o que o vendedor recebe), no formato do "VOCÊ RECEBE" do jogo:
   * Gemas inteiras; Coins com uma casa decimal em k/M e duas em B. Corta, nunca arredonda
   * para cima, para não prometer mais do que o jogo vai pagar.
   */
  function formatarValor(x, moeda) {
    if (!isFinite(x)) return '–';
    const f = (v, c) => v.toLocaleString('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: 0 });
    const corta = (v, c) => Math.floor(v * Math.pow(10, c) + 1e-9) / Math.pow(10, c);
    if (moeda === 'orb') return f(Math.floor(x + 1e-9), 0);
    if (x >= 1e9) return f(corta(x / 1e9, 2), 2) + ' B';
    if (x >= 1e6) return f(corta(x / 1e6, 1), 1) + ' M';
    if (x >= 1e3) return f(corta(x / 1e3, 1), 1) + ' k';
    return f(Math.floor(x + 1e-9), 0);
  }

  const api = { PADRAO, FAIXA_MERCADO, COMISSAO, liquidoVendedor, formatarValor, normalizarVenda, normalizarAlvo, precificar, classeDe, mesmaEspecie, mesmoPokemon, arredondarPreco, pesoVenda, ehLendario, faixaMercado };
  root.PIMotor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
