// Testes do ui.css: regras que, se trocadas sem querer, quebram a tela no jogo.
// Rodar: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Regras cujo seletor tem o elemento sozinho (não um filho dele), com a propriedade pedida. */
function regras(seletor, prop) {
  const r = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seletores = m[1].split(',').map(s => s.trim());
    if (!seletores.includes(seletor)) continue;
    const v = (m[2].match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)')) || [])[1];
    if (v) r.push(v.trim());
  }
  return r;
}

test('o painel do anúncio é sempre position: fixed (relative fazia ele cair abaixo da caixa do jogo)', () => {
  const pos = regras('.pp-anuncio', 'position');
  assert.ok(pos.length >= 1, 'sem position no .pp-anuncio');
  assert.deepEqual([...new Set(pos)], ['fixed'], 'regras com position: ' + pos.join(', '));
});
