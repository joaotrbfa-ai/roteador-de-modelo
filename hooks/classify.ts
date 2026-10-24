export type Tier = 'haiku' | 'sonnet' | 'opus'

// 'inherit' keeps the previous turn's tier: a "sim, pode fazer" after an Opus
// plan is still Opus work, however short the message.
export type Verdict = {
  tier: Tier | 'inherit'
  isSure: boolean
  reason: string
}

export const MODELS: Record<Tier, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

export const TIERS: readonly Tier[] = ['haiku', 'sonnet', 'opus']

const OVERRIDE = /^\s*@(haiku|sonnet|opus)\b\s*/i

// "@opus faz X" forces the tier for that message and is stripped from it.
export const parseOverride = (text: string): { tier: Tier; text: string } | undefined => {
  const m = OVERRIDE.exec(text)
  if (!m || !m[1]) return undefined
  return { tier: m[1].toLowerCase() as Tier, text: text.slice(m[0].length) }
}

const CONTINUATION =
  /^((sim|s|ok|okay|beleza|blz|pode|ir|fazer|manda|ver|vai|segue|continua|continue|prossiga|faz|fa[cç]a|isso|exato|perfeito|bora|yes|y|go|ahead|do|it|next|proceed)[\s!.,]*)+$/i

const OPUS_PATTERNS: readonly RegExp[] = [
  /arquitetur|architect/i,
  /refator|refactor|reescrev|rewrite/i,
  /migra[rçc]|migration/i,
  /\bplan(o|ej|ning)|estrat[eé]gi|roadmap/i,
  /trade-?offs?|prós e contras|pros and cons/i,
  /causa raiz|root cause|investig/i,
  /race condition|concorr[eê]ncia|deadlock|concurrency|memory leak|vazamento de mem/i,
  /seguran[cç]a|vulnerab|security|exploit|autentica[cç][aã]o|authz?\b/i,
  /performance|otimiz|optimi[sz]|lat[eê]ncia|escal(a|abilidade)|scalab/i,
  /algoritm|complexidade|prov(a|ar) (que|matem)|demonstr/i,
  /do zero|from scratch|sistema completo|end[- ]to[- ]end|full[- ]stack/i,
  /code review|revis(e|ar|ão) (o |do |de )?c[oó]digo|audit/i,
  /design (de|do) sistema|system design|modelagem|schema do banco/i,
  /n[aã]o (est[aá] )?funciona.*(depois|mesmo|ainda)|ainda (d[aá]|est[aá]) (erro|quebrad)/i,
  /por que (isso|ele|o|a)? ?(acontece|quebra|falha)|why (does|is) .* (fail|break)/i,
]

const HAIKU_PATTERNS: readonly RegExp[] = [
  /^(oi|ol[aá]|hey|hi|hello|bom dia|boa tarde|boa noite|valeu|obrigad[oa]|thanks|thank you)\b/i,
  /tradu[zç]|translate/i,
  /corrig(e|ir) (a )?(ortografia|gram[aá]tica|typo)|\btypo\b|fix (the )?typo/i,
  /renome(ia|ar)|rename/i,
  /format(a|ar|e)|formatting|indenta/i,
  /^(qual|quais|o que [eé]|what is|what's|como (eu )?(fa[cç]o|rodo|instalo)|how do i)\b/i,
  /resum(e|a|o|ir)\b|summari[sz]e|tl;?dr/i,
  /lista(r)? (os|as)? ?arquivos|list (the )?files|\bls\b/i,
  /commit(a|ar)?\b|git (status|log|add|push|pull)/i,
]

const countMatches = (text: string, patterns: readonly RegExp[]) =>
  patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0)

export const classify = (raw: string): Verdict => {
  const text = raw.trim()
  if (text === '') return { tier: 'inherit', isSure: true, reason: 'sem texto' }
  if (text.length <= 40 && CONTINUATION.test(text)) {
    return { tier: 'inherit', isSure: true, reason: 'continuação' }
  }

  const codeBlocks = (text.match(/```/g) ?? []).length / 2
  const hasTrace = /Traceback|at .+:\d+:\d+|Exception|Error:|panic:/.test(text)
  const length = text.length

  const opus =
    countMatches(text, OPUS_PATTERNS) +
    (length > 1500 ? 2 : length > 700 ? 1 : 0) +
    (codeBlocks >= 2 ? 1 : 0) +
    (hasTrace && length > 300 ? 1 : 0)
  const haiku =
    countMatches(text, HAIKU_PATTERNS) + (length < 40 && codeBlocks === 0 && !hasTrace ? 1 : 0)

  if (opus >= 2) return { tier: 'opus', isSure: true, reason: `sinais fortes (${opus})` }
  if (opus === 1) return { tier: 'opus', isSure: false, reason: 'um sinal de complexidade' }
  if (haiku >= 2) return { tier: 'haiku', isSure: true, reason: `tarefa simples (${haiku})` }
  if (haiku === 1) return { tier: 'haiku', isSure: false, reason: 'parece simples' }
  return { tier: 'sonnet', isSure: length <= 300, reason: 'tarefa comum' }
}

export const JUDGE_SYSTEM = `You route a coding assistant's requests to the cheapest model that will do them well.
HAIKU: trivial — chit-chat, quick facts, translation, renames, formatting, one-line edits, running a known command.
SONNET: ordinary work — writing or editing code in a few files, explaining code, normal bugs, scripts, docs.
OPUS: hard — architecture, large refactors, subtle or recurring bugs, security, performance, planning multi-step work, ambiguous requirements.
Answer with exactly one word: HAIKU, SONNET or OPUS.`

export const judgePrompt = (text: string, previous: Tier) =>
  `Previous turn ran on ${previous.toUpperCase()}.\n\nRequest:\n<<<\n${text.slice(0, 4000)}\n>>>`

export const parseJudge = (answer: string): Tier | undefined => {
  const m = /\b(HAIKU|SONNET|OPUS)\b/i.exec(answer)
  return m && m[1] ? (m[1].toLowerCase() as Tier) : undefined
}
