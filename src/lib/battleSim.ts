import type { TeamMember } from './pokemon'

export const BATTLE_FORMAT = 'gen9doublescustomgame'
const FALLBACK_MOVE = 'Tackle'
const BATTLE_LEVEL = 50
const MAX_LOG_LINES = 4000

const ZERO_STATS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const FULL_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }

export type BattleResult = {
  log: string[]
  winnerSide: 'p1' | 'p2' | null
  winnerName: string | null
}

export function toPokemonSet(member: TeamMember) {
  const moves = member.moves
    .map((move) => move.name.trim())
    .filter((name) => name.length > 0)

  return {
    name: member.species || 'Pokemon',
    species: member.species || 'Bulbasaur',
    item: member.item.trim(),
    ability: member.ability.trim(),
    moves: moves.length > 0 ? moves : [FALLBACK_MOVE],
    nature: member.nature.trim() || 'Hardy',
    gender: '',
    evs: { ...ZERO_STATS },
    ivs: { ...FULL_IVS },
    level: BATTLE_LEVEL,
  }
}

/** Simula un combate de dobles (2vs2) entre dos equipos de hasta 4 Pokemon usando @pkmn/sim. */
export async function runDoublesBattle(
  myTeam: TeamMember[],
  rivalTeam: TeamMember[],
  myName = 'Mi equipo',
  rivalName = 'Equipo rival',
): Promise<BattleResult> {
  const { BattleStreams, RandomPlayerAI, Teams } = await import('@pkmn/sim')

  const stream = new BattleStreams.BattleStream()
  const streams = BattleStreams.getPlayerStreams(stream)

  const p1Sets = myTeam.map((member) => toPokemonSet(member))
  const p2Sets = rivalTeam.map((member) => toPokemonSet(member))

  const spec = { formatid: BATTLE_FORMAT }
  const p1spec = { name: myName, team: Teams.pack(p1Sets) }
  const p2spec = { name: rivalName, team: Teams.pack(p2Sets) }

  const p1 = new RandomPlayerAI(streams.p1, { mega: 1 })
  const p2 = new RandomPlayerAI(streams.p2, { mega: 1 })

  void p1.start()
  void p2.start()

  const log: string[] = []
  let winnerName: string | null = null

  const consumeLog = (async () => {
    for await (const chunk of streams.omniscient) {
      for (const line of chunk.split('\n')) {
        log.push(line)
        if (line.startsWith('|win|')) {
          winnerName = line.slice('|win|'.length).trim()
        }
      }

      if (log.length > MAX_LOG_LINES) {
        break
      }
    }
  })()

  void streams.omniscient.write(
    `>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1spec)}\n>player p2 ${JSON.stringify(p2spec)}`,
  )

  await consumeLog

  const winnerSide: 'p1' | 'p2' | null =
    winnerName === myName ? 'p1' : winnerName === rivalName ? 'p2' : null

  return { log, winnerSide, winnerName }
}
