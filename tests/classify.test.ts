import { expect, test } from 'claude-code/testing'

import { classify, parseJudge, parseOverride } from '../hooks/classify'

test('mensagens triviais vão para o Haiku', async () => {
  expect(classify('oi, tudo bem?').tier).toBe('haiku')
  expect(classify('traduz isso pro inglês: bom dia').tier).toBe('haiku')
  expect(classify('renomeia a variável x para total').tier).toBe('haiku')
})

test('trabalho difícil vai para o Opus', async () => {
  const v = classify('preciso refatorar a arquitetura do módulo de autenticação, analisando trade-offs')
  expect(v.tier).toBe('opus')
  expect(v.isSure).toBe(true)
})

test('trabalho comum fica no Sonnet', async () => {
  expect(classify('adiciona um botão de logout no header do app').tier).toBe('sonnet')
})

test('continuações herdam o modelo anterior', async () => {
  expect(classify('sim, pode fazer').tier).toBe('inherit')
  expect(classify('continua').tier).toBe('inherit')
})

test('@opus força e é removido do texto', async () => {
  expect(parseOverride('@opus explica isso')).toEqual({ tier: 'opus', text: 'explica isso' })
  expect(parseOverride('!opus explica isso')).toBe(undefined)
  expect(parseOverride('explica isso')).toBe(undefined)
})

test('lê o veredito do juiz', async () => {
  expect(parseJudge('OPUS')).toBe('opus')
  expect(parseJudge('hmm')).toBe(undefined)
})
