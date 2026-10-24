import type { EngineInterface, Register } from 'claude-code'

import {
  classify,
  JUDGE_SYSTEM,
  judgePrompt,
  MODELS,
  parseJudge,
  parseOverride,
  TIERS,
  type Tier,
} from './classify'

const MODES = ['auto', 'off', ...TIERS] as const
type Mode = (typeof MODES)[number]
type Stats = Record<Tier, number>

// A Haiku turn still looping after this many model requests is harder than it
// looked: the rest of it moves to Sonnet.
const ESCALATE_AT_STEP = 6

const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode)

type Router = {
  mode: Mode
  tier: Tier
  reason: string
  forced: { text: string; tier: Tier } | undefined
}

function show($: EngineInterface, r: Router) {
  $.ui.status(r.mode === 'off' ? undefined : `🧭 ${r.tier}${r.mode === 'auto' ? '' : ' (fixo)'}`)
}

async function decide($: EngineInterface, r: Router, text: string): Promise<void> {
  if (r.mode !== 'auto') {
    r.tier = r.mode as Tier
    r.reason = 'modo fixo'
    return
  }
  if (r.forced && r.forced.text.trim() === text.trim()) {
    r.tier = r.forced.tier
    r.reason = 'forçado com !' + r.forced.tier
    r.forced = undefined
    return
  }
  const verdict = classify(text)
  if (verdict.tier === 'inherit') {
    r.reason = verdict.reason
    return
  }
  if (verdict.isSure) {
    r.tier = verdict.tier
    r.reason = verdict.reason
    return
  }
  const judged = await $.model.complete({
    model: 'haiku',
    system: JUDGE_SYSTEM,
    prompt: judgePrompt(text, r.tier),
    maxTokens: 5,
    effort: 'low',
    timeoutMs: 6000,
  })
  const picked = judged.isAnswered ? parseJudge(judged.text) : undefined
  r.tier = picked ?? verdict.tier
  r.reason = picked ? 'avaliado pelo Haiku' : verdict.reason
}

export const register: Register = on => {
  const r: Router = { mode: 'auto', tier: 'sonnet', reason: '', forced: undefined }
  const turnTiers = new Map<string, Tier>()

  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('mode')
    if (isMode(saved)) r.mode = saved
    await $.command.register({
      name: 'roteador',
      description: 'Roteador de modelo: status | auto | off | haiku | sonnet | opus | reset',
    })
    show($, r)
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    const override = parseOverride(e.text)
    if (!override) return next(e)
    r.forced = { text: override.text, tier: override.tier }
    return next({ ...e, text: override.text })
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined || r.mode === 'off') return next(e)
    await decide($, r, e.text)
    turnTiers.set(e.turnId, r.tier)
    show($, r)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || r.mode === 'off') return yield* next(e)
    let picked = turnTiers.get(e.turnId) ?? r.tier
    if (r.mode === 'auto' && picked === 'haiku' && e.index >= ESCALATE_AT_STEP) {
      picked = 'sonnet'
      r.tier = 'sonnet'
      r.reason = 'escalado: muitos passos no Haiku'
      turnTiers.set(e.turnId, picked)
      show($, r)
    }
    const model = MODELS[picked]
    return yield* next(e.model === model ? e : { ...e, model })
  })

  on('turn.complete', async ($, e, next) => {
    const done = turnTiers.get(e.turnId)
    if (e.agentId === undefined && done) {
      turnTiers.delete(e.turnId)
      const stats = ((await $.store.get('stats')) ?? { haiku: 0, sonnet: 0, opus: 0 }) as Stats
      stats[done] += 1
      await $.store.set('stats', stats)
    }
    return next(e)
  })

  on('command.run', { command: 'roteador' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await $.store.delete('stats')
      return { text: 'Estatísticas zeradas.' }
    }
    if (isMode(arg)) {
      r.mode = arg
      if (r.mode !== 'auto' && r.mode !== 'off') r.tier = r.mode
      await $.store.set('mode', r.mode)
      show($, r)
      return { text: `Roteador: modo ${r.mode}.` }
    }
    if (arg !== '' && arg !== 'status') {
      return { text: 'Uso: /roteador [status | auto | off | haiku | sonnet | opus | reset]' }
    }

    const stats = ((await $.store.get('stats')) ?? { haiku: 0, sonnet: 0, opus: 0 }) as Stats
    const total = stats.haiku + stats.sonnet + stats.opus
    const pct = (n: number) => (total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`)
    return {
      text: [
        `Modo: ${r.mode} · último modelo: ${r.tier}${r.reason ? ` (${r.reason})` : ''}`,
        `Turnos roteados: ${total} — Haiku ${stats.haiku} (${pct(stats.haiku)}), ` +
          `Sonnet ${stats.sonnet} (${pct(stats.sonnet)}), Opus ${stats.opus} (${pct(stats.opus)})`,
        'Force um modelo numa mensagem começando com @haiku, @sonnet ou @opus.',
      ].join('\n'),
    }
  })
}
