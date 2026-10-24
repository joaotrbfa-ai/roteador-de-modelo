# roteador-de-modelo

Mod para o Claude Code que classifica a dificuldade de cada mensagem e roteia o turno para Haiku, Sonnet ou Opus, para economizar tokens.

## Instalação

No prompt de uma sessão do Claude Code:

```
/plugin install roteador-de-modelo --marketplace joaotrbfa-ai/roteador-de-modelo
```

Confirme com `y` para adicionar o marketplace e escolha o escopo.

## Uso

- `/roteador` mostra o modo, o último modelo usado e a contagem de turnos por modelo.
- `/roteador auto | off | haiku | sonnet | opus | reset` muda o modo.
- Comece uma mensagem com `@haiku`, `@sonnet` ou `@opus` para forçar o modelo dela.
