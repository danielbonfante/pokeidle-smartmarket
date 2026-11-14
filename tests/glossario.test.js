// "Como ler" (src/glossario.js): o mesmo texto na Precificar e no popup.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const G = require(path.join(__dirname, '..', 'src', 'glossario.js'));

test('glossário: todos os termos têm id, nome e texto, e o "o que é isso?" da Precificar acha o seu', () => {
  const ids = G.TERMOS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const t of G.TERMOS) assert.ok(t.id && t.termo && t.texto.length > 40, t.id);
  // os termos que a janela Precificar liga com "o que é isso?"
  for (const id of ['mercado', 'faixa', 'parecidas', 'confianca', 'grupos']) assert.ok(ids.includes(id), id);
  const fs = require('fs');
  const prec = fs.readFileSync(path.join(__dirname, '..', 'src', 'precificar.js'), 'utf8');
  for (const [, id] of prec.matchAll(/oQue\('([a-z]+)'\)/g)) assert.ok(ids.includes(id), 'oQue sem termo: ' + id);
});

test('glossário: html com todos ou só alguns, na ordem pedida', () => {
  const todos = G.html();
  for (const t of G.TERMOS) assert.ok(todos.includes(`data-termo="${t.id}"`), t.id);
  const dois = G.html(['grupos', 'mercado', 'nao-existe']);
  assert.ok(dois.indexOf('grupos') < dois.indexOf('"mercado"'));
  assert.equal((dois.match(/<dt/g) || []).length, 2);
});
