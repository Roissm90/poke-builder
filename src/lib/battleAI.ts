import type { PokemonType, TeamMember } from './pokemon'
import { getTypeEffectiveness } from './typeChart'

function attackingTypes(member: TeamMember): PokemonType[] {
  const moveTypes = member.moves
    .map((move) => move.type)
    .filter((type): type is PokemonType => Boolean(type))
  const unique = [...new Set(moveTypes)]
  return unique.length > 0 ? unique : member.types
}

function bestMultiplierAgainst(attackerTypes: PokemonType[], defenderTypes: PokemonType[]): number {
  if (attackerTypes.length === 0 || defenderTypes.length === 0) {
    return 1
  }

  return Math.max(...attackerTypes.map((type) => getTypeEffectiveness(type, defenderTypes)))
}

function offensiveCoverageScore(attacker: TeamMember, defenders: TeamMember[]): number {
  if (defenders.length === 0) {
    return 0
  }

  const attackerTypes = attackingTypes(attacker)
  const total = defenders.reduce(
    (sum, defender) => sum + bestMultiplierAgainst(attackerTypes, defender.types),
    0,
  )
  return total / defenders.length
}

function defensiveVulnerabilityScore(defender: TeamMember, attackers: TeamMember[]): number {
  if (attackers.length === 0) {
    return 0
  }

  const total = attackers.reduce(
    (sum, attacker) => sum + bestMultiplierAgainst(attackingTypes(attacker), defender.types),
    0,
  )
  return total / attackers.length
}

function threatScore(candidate: TeamMember, opposing: TeamMember[]): number {
  return offensiveCoverageScore(candidate, opposing) - 0.5 * defensiveVulnerabilityScore(candidate, opposing)
}

/** Elige, de `pool`, al Pokemon que supone mayor amenaza para `opposing`. */
export function pickMostThreateningMember(
  pool: TeamMember[],
  opposing: TeamMember[],
): TeamMember | null {
  if (pool.length === 0) {
    return null
  }

  return pool.reduce((best, current) =>
    threatScore(current, opposing) > threatScore(best, opposing) ? current : best,
  )
}

function dropOneCombinations(pool: TeamMember[]): TeamMember[][] {
  if (pool.length <= 4) {
    return [pool]
  }

  const combos: TeamMember[][] = []
  for (let skipIndex = 0; skipIndex < pool.length; skipIndex++) {
    combos.push(pool.filter((_, index) => index !== skipIndex))
  }
  return combos
}

/** Elige los 4 (o menos) Pokemon de `pool` que mejor cubren/sobreviven a `opposing`. */
export function pickBestSquadOfFour(pool: TeamMember[], opposing: TeamMember[]): TeamMember[] {
  const combos = dropOneCombinations(pool)
  let bestCombo = combos[0] ?? []
  let bestScore = -Infinity

  for (const combo of combos) {
    const offense = combo.reduce((sum, member) => sum + offensiveCoverageScore(member, opposing), 0)
    const vulnerability = combo.reduce(
      (sum, member) => sum + defensiveVulnerabilityScore(member, opposing),
      0,
    )
    const typeSpread = new Set(combo.flatMap((member) => member.types)).size
    const score = offense - 0.5 * vulnerability + typeSpread * 0.1

    if (score > bestScore) {
      bestScore = score
      bestCombo = combo
    }
  }

  return bestCombo
}
