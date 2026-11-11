# Como contribuir

Obrigado pelo interesse na Pokeidle Smart Market! Contribuições são bem-vindas: correções, ideias para o motor de preço, melhorias de interface e testes.

## Como propor uma mudança

1. Para algo maior que uma correção pequena, **abra uma issue antes** explicando a ideia. Assim dá para combinar o caminho antes de você gastar tempo.
2. Faça um *fork*, crie um branch e mande um *pull request* para o `main`.
3. Só o mantenedor aprova e junta pull requests. Nada entra no `main` sem revisão.

## Regras que não mudam

Pull requests que quebrem qualquer uma destas regras serão recusados, mesmo que o resto esteja bom:

- **Só leitura.** A extensão não compra, não vende, não anuncia, não publica e não automatiza nenhuma ação no jogo. Ela nunca clica em `#cm-publicar` nem manda mensagens de compra, venda ou anúncio pelo WebSocket. O botão "usar" do painel só preenche o campo de preço; quem publica é sempre o jogador.
- **Privacidade.** Nunca guardar nicks: vendedor, comprador, quem capturou (`caughtBy`), apelido. A `normalizarVenda` (`src/motor.js`) e o índice do `ws.js` descartam esses campos; mantenha assim. Nada sai do navegador além das consultas ao próprio jogo: sem servidores externos, telemetria ou analytics.
- **Ritmo de pessoa.** As consultas seguem o ritmo do `ws.js`: uma por vez, 1,5 s entre elas, no máximo 12 por minuto, orçamento de 45 mensagens por minuto na conexão inteira e o freio quando o servidor pede calma. Não diminua esses limites nem faça varreduras do mercado inteiro. O servidor tem anti-flood e um abuso pode prejudicar a conta de quem usa a extensão.
- **Dados e código próprios.** Não copie dados nem código de outros projetos sem licença compatível com a GPL-3.0. O site do briao (Precificador de Pokémon) é só inspiração: não use os dados (`precos.json`) nem o código dele.
- **Sem dependências obrigatórias.** O projeto é JavaScript puro, carregado direto pelo Chrome, sem etapa de build. Os testes usam só o Node.

## Testes

- `node --test tests/*.test.js` precisa passar.
- As páginas em `tests/pagina/` reproduzem partes do jogo com dados falsos. Sirva a raiz do projeto num servidor local (por exemplo `npx http-server -a 127.0.0.1`) e abra a página. O `CLAUDE.md` descreve os casos de cada uma.
- **Mudanças no motor de preço** (`src/motor.js`) precisam mostrar o backtest antes e depois: `node tests/backtest-csv.js planilha.csv`, com a planilha exportada pelo botão "Exportar planilha" da Tabela de preços do jogo. **Não envie a planilha no pull request**: ela traz nicks de jogadores (o `.gitignore` já bloqueia `*.csv`).
- Ao testar no jogo, use uma aba só do jogo e evite buscas com dezenas de páginas.

## Estilo

- Textos da interface, comentários e mensagens de commit em português.
- Funções pequenas, com comentário explicando o *porquê* quando não for óbvio.
- O `CLAUDE.md` registra o protocolo do jogo, a arquitetura e as decisões tomadas. Se a sua mudança descobrir algo novo do jogo ou mudar uma decisão, atualize-o.

## Licença

Ao contribuir, você concorda que a sua contribuição será distribuída sob a [GPL-3.0](LICENSE), a mesma licença do projeto.
