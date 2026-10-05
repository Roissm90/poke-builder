import { POKEMON_TYPES, type PokemonType, type TeamAnalysis, type TeamMember } from './pokemon'
import { getTypeEffectiveness } from './typeChart'

type AnalysisContext = {
  airBalloonActive: boolean
  ignoreAbilityDefenses: boolean
}

const DEFAULT_ANALYSIS_CONTEXT: AnalysisContext = {
  airBalloonActive: true,
  ignoreAbilityDefenses: false,
}

function normalizeAbilityName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function normalizeItemName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function isAirBalloon(item: string): boolean {
  const normalized = normalizeItemName(item)
  return normalized === 'airballoon' || normalized === 'globohelio' || normalized === 'airbaloon'
}

function getItemTypeImmunity(item: string): PokemonType | null {
  // In official games, the only held item that grants a direct type immunity
  // to incoming damaging moves is Air Balloon (Ground immunity).
  if (isAirBalloon(item)) {
    return 'ground'
  }

  return null
}

function isRingTarget(item: string): boolean {
  const normalized = normalizeItemName(item)
  return normalized === 'ringtarget' || normalized === 'objetivo'
}

function isIronBall(item: string): boolean {
  const normalized = normalizeItemName(item)
  return normalized === 'ironball' || normalized === 'bolaferrica'
}

function getTypeResistBerryType(item: string): PokemonType | null {
  const normalized = normalizeItemName(item)

  const berryByType: Partial<Record<PokemonType, string[]>> = {
    fire: ['occaberry'],
    water: ['passhoberry'],
    electric: ['wacanberry'],
    grass: ['rindoberry'],
    ice: ['yacheberry'],
    fighting: ['chopleberry'],
    poison: ['kebiaberry'],
    ground: ['shucaberry'],
    flying: ['cobaberry'],
    psychic: ['payapaberry'],
    bug: ['tangaberry'],
    rock: ['chartiberry'],
    ghost: ['kasibberry'],
    dragon: ['habanberry'],
    dark: ['colburberry'],
    steel: ['babiriberry'],
    fairy: ['roseliberry'],
  }

  for (const type of POKEMON_TYPES) {
    const berries = berryByType[type] ?? []
    if (berries.includes(normalized)) {
      return type
    }
  }

  return null
}

function isChilanBerry(item: string): boolean {
  const normalized = normalizeItemName(item)
  return normalized === 'chilanberry'
}

function getTypeMultiplierWithItem(
  member: TeamMember,
  attackType: PokemonType,
): number {
  if (member.types.length === 0) {
    return 1
  }

  const baseMultipliers = member.types.map((defendType) =>
    getTypeEffectiveness(attackType, [defendType]),
  )

  const ringTargetAdjusted = isRingTarget(member.item)
    ? baseMultipliers.map((multiplier) => (multiplier === 0 ? 1 : multiplier))
    : baseMultipliers

  const ironBallAdjusted =
    attackType === 'ground' && isIronBall(member.item)
      ? ringTargetAdjusted.map((multiplier, index) => {
          const defendType = member.types[index]
          if (defendType === 'flying' && multiplier === 0) {
            return 1
          }
          return multiplier
        })
      : ringTargetAdjusted

  return ironBallAdjusted.reduce((acc, multiplier) => acc * multiplier, 1)
}

function getAbilityTypeImmunity(ability: string): PokemonType | null {
  const normalized = normalizeAbilityName(ability)

  if (normalized === 'flashfire' || normalized === 'absorbefuego') {
    return 'fire'
  }
  if (normalized === 'waterabsorb' || normalized === 'absorbeagua' || normalized === 'stormdrain') {
    return 'water'
  }
  if (
    normalized === 'voltabsorb' ||
    normalized === 'absorbeelectricidad' ||
    normalized === 'lightningrod' ||
    normalized === 'motordrive'
  ) {
    return 'electric'
  }
  if (normalized === 'sapsipper' || normalized === 'hervivoro') {
    return 'grass'
  }
  if (normalized === 'levitate' || normalized === 'levitacion') {
    return 'ground'
  }
  if (normalized === 'wellbakedbody') {
    return 'fire'
  }

  return null
}

function getAbilityDefensiveMultiplier(
  member: TeamMember,
  attackType: PokemonType,
  context: AnalysisContext,
): number {
  if (context.ignoreAbilityDefenses) {
    return 1
  }

  const ability = member.ability
  const normalized = normalizeAbilityName(ability)

  // Inmunidades por habilidad.
  const immuneType = getAbilityTypeImmunity(ability)
  if (immuneType === attackType) {
    if (attackType === 'ground' && normalized === 'levitate' && isIronBall(member.item)) {
      return 1
    }
    return 0
  }

  // Mitigaciones defensivas relevantes por tipo recibido.
  if (normalized === 'thickfat' && (attackType === 'fire' || attackType === 'ice')) {
    return 0.5
  }
  if (normalized === 'heatproof' && attackType === 'fire') {
    return 0.5
  }
  if (normalized === 'dryskin') {
    if (attackType === 'water') {
      return 0
    }
    if (attackType === 'fire') {
      return 1.25
    }
  }
  if (normalized === 'fluffy') {
    if (attackType === 'fire') {
      return 2
    }
  }

  return 1
}

function getItemDefensiveMultiplier(
  member: TeamMember,
  attackType: PokemonType,
  typeMultiplier: number,
  context: AnalysisContext,
): number {
  const itemTypeImmunity = getItemTypeImmunity(member.item)
  if (context.airBalloonActive && itemTypeImmunity === attackType) {
    return 0
  }

  const resistBerryType = getTypeResistBerryType(member.item)
  if (resistBerryType === attackType && typeMultiplier > 1) {
    // Type-resist berries halve super-effective damage from their matching type.
    return 0.5
  }

  if (isChilanBerry(member.item) && attackType === 'normal' && typeMultiplier > 0) {
    return 0.5
  }

  return 1
}

function getItemRuleNotesForMember(member: TeamMember, context: AnalysisContext): string[] {
  const notes: string[] = []

  const immuneType = getItemTypeImmunity(member.item)
  if (immuneType === 'ground') {
    notes.push(
      context.airBalloonActive
        ? 'Air Balloon: inmunidad a Ground activa hasta recibir dano.'
        : 'Air Balloon: se considera roto en este analisis.',
    )
  }

  if (isRingTarget(member.item)) {
    notes.push('Ring Target: elimina inmunidades por tipo del usuario (x0 pasa a x1).')
  }

  if (isIronBall(member.item)) {
    notes.push('Iron Ball: cancela inmunidad a Ground si el usuario es Flying/Levitate.')
  }

  const resistBerryType = getTypeResistBerryType(member.item)
  if (resistBerryType) {
    notes.push(`Baya reductora: reduce dano supereficaz de tipo ${resistBerryType} (x0.5).`)
  }

  if (isChilanBerry(member.item)) {
    notes.push('Chilan Berry: reduce dano de tipo Normal (x0.5).')
  }

  return notes
}

function getMemberDefensiveMultiplier(
  member: TeamMember,
  attackType: PokemonType,
  context: AnalysisContext,
): number {
  const typeMultiplier = getTypeMultiplierWithItem(member, attackType)
  const abilityMultiplier = getAbilityDefensiveMultiplier(member, attackType, context)
  const itemMultiplier = getItemDefensiveMultiplier(member, attackType, typeMultiplier, context)

  if (typeMultiplier === 0 || abilityMultiplier === 0 || itemMultiplier === 0) {
    return 0
  }

  return typeMultiplier * abilityMultiplier * itemMultiplier
}

function analyzePair(memberA: TeamMember, memberB: TeamMember, context: AnalysisContext) {
  const sharedWeaknessTypes: PokemonType[] = []

  for (const attackType of POKEMON_TYPES) {
    const aDef = getMemberDefensiveMultiplier(memberA, attackType, context)
    const bDef = getMemberDefensiveMultiplier(memberB, attackType, context)

    if (aDef > 1 && bDef > 1) {
      sharedWeaknessTypes.push(attackType)
    }
  }

  const pairMembers: Array<{ pokemon: string; member: TeamMember }> = [
    { pokemon: memberA.species || memberA.id, member: memberA },
    { pokemon: memberB.species || memberB.id, member: memberB },
  ]

  const offensiveTypes = [...new Set(
    pairMembers
      .flatMap(({ member }) => member.moves)
      .filter((move) => Boolean(move.name.trim()) && Boolean(move.type) && move.category !== 'status')
      .map((move) => move.type as PokemonType),
  )]

  const superEffectiveTypes = POKEMON_TYPES.filter((targetType) =>
    offensiveTypes.some((attackType) => getTypeEffectiveness(attackType, [targetType]) > 1),
  )

  const superEffectiveDetails = superEffectiveTypes.map((type) => ({
    type,
    sources: pairMembers.map(({ pokemon, member }) => ({
      pokemon,
      moves: member.moves
        .filter(
          (move) =>
            Boolean(move.name.trim()) && Boolean(move.type) && move.category !== 'status',
        )
        .filter((move) => getTypeEffectiveness(move.type as PokemonType, [type]) > 1)
        .map((move) => ({
          name: move.name,
          isStab: member.types.includes(move.type as PokemonType),
        })),
    })).filter((source) => source.moves.length > 0),
  }))

  return {
    pair: [memberA.species || memberA.id, memberB.species || memberB.id] as [string, string],
    sharedWeaknessTypes,
    superEffectiveTypes,
    superEffectiveDetails,
  }
}

function getRecommendedAttackTypesForTarget(targetType: PokemonType): PokemonType[] {
  return POKEMON_TYPES.filter((attackType) => getTypeEffectiveness(attackType, [targetType]) > 1)
}

export function analyzeTeam(
  team: TeamMember[],
  context: Partial<AnalysisContext> = {},
): TeamAnalysis {
  const fullContext: AnalysisContext = {
    ...DEFAULT_ANALYSIS_CONTEXT,
    ...context,
  }

  const defensiveByType = POKEMON_TYPES.map((attackType) => {
    let weak = 0
    let resist = 0
    let immune = 0
    let neutral = 0
    const weakMembers: string[] = []
    const resistMembers: string[] = []
    const immuneMembers: string[] = []
    const neutralMembers: string[] = []

    for (const [index, member] of team.entries()) {
      const memberName = member.species || `Slot ${index + 1}`
      const mult = getMemberDefensiveMultiplier(member, attackType, fullContext)
      if (mult === 0) {
        immune += 1
        immuneMembers.push(memberName)
      } else if (mult > 1) {
        weak += 1
        weakMembers.push(memberName)
      } else if (mult < 1) {
        resist += 1
        resistMembers.push(memberName)
      } else {
        neutral += 1
        neutralMembers.push(memberName)
      }
    }

    return {
      type: attackType,
      weak,
      resist,
      immune,
      neutral,
      weakMembers,
      resistMembers,
      immuneMembers,
      neutralMembers,
    }
  })

  const biggestWeaknesses = defensiveByType
    .filter((row) => row.weak > 0)
    .sort((a, b) => b.weak - a.weak)
    .map((row) => ({ type: row.type, count: row.weak }))

  const strongestResists = defensiveByType
    .filter((row) => row.resist + row.immune > 0)
    .sort((a, b) => b.resist + b.immune - (a.resist + a.immune))
    .map((row) => ({ type: row.type, count: row.resist + row.immune }))

  const moveTypes = team
    .flatMap((member) => member.moves)
    .filter((move) => move.category !== 'status')
    .map((move) => move.type)
    .filter((type): type is PokemonType => Boolean(type))

  const stabTypes = team.flatMap((member) => member.types)
  const allAttackTypes = [...new Set([...moveTypes, ...stabTypes])]

  const uncoveredTypes = POKEMON_TYPES.filter((defendType) => {
    if (allAttackTypes.length === 0) {
      return true
    }

    return !allAttackTypes.some((attackType) => {
      const multiplier = getTypeEffectiveness(attackType, [defendType])
      return multiplier > 1
    })
  })

  const coveredTypes = POKEMON_TYPES.filter((type) => !uncoveredTypes.includes(type))

  const offensiveByTargetType = POKEMON_TYPES.map((targetType) => {
    const moveEntries = team.flatMap((member, index) => {
      const pokemonName = member.species || `Slot ${index + 1}`
      return member.moves
        .filter(
          (move) =>
            Boolean(move.name.trim()) && Boolean(move.type) && move.category !== 'status',
        )
        .map((move) => {
          const moveType = move.type as PokemonType
          const multiplier = getTypeEffectiveness(moveType, [targetType])
          return {
            pokemon: pokemonName,
            moveName: move.name,
            moveType,
            multiplier,
            isStab: member.types.includes(moveType),
          }
        })
    })

    const multipliers = moveEntries.map((entry) => ({
      attackType: entry.moveType,
      multiplier: entry.multiplier,
    }))

    const bestMultiplier = multipliers.reduce(
      (best, current) => (current.multiplier > best ? current.multiplier : best),
      0,
    )

    const sourceTypes = multipliers
      .filter((entry) => entry.multiplier === bestMultiplier && bestMultiplier > 0)
      .map((entry) => entry.attackType)

    const bestMoveEntries = moveEntries.filter((entry) => entry.multiplier === bestMultiplier)
    const sourceMap = new Map<string, { pokemon: string; moves: Array<{ name: string; type: PokemonType; isStab: boolean }> }>()

    for (const entry of bestMoveEntries) {
      const existing = sourceMap.get(entry.pokemon)
      const movePayload = {
        name: entry.moveName,
        type: entry.moveType,
        isStab: entry.isStab,
      }

      if (!existing) {
        sourceMap.set(entry.pokemon, {
          pokemon: entry.pokemon,
          moves: [movePayload],
        })
        continue
      }

      const alreadyIncluded = existing.moves.some(
        (move) => move.name === movePayload.name && move.type === movePayload.type,
      )
      if (!alreadyIncluded) {
        existing.moves.push(movePayload)
      }
    }

    const sources = [...sourceMap.values()].sort((a, b) => a.pokemon.localeCompare(b.pokemon))

    return {
      targetType,
      bestMultiplier,
      sourceTypes,
      sources,
    }
  })

  const synergyPairs = team
    .flatMap((memberA, indexA) =>
      team.slice(indexA + 1).map((memberB) => analyzePair(memberA, memberB, fullContext)),
    )
    .sort(
      (a, b) =>
        a.sharedWeaknessTypes.length - b.sharedWeaknessTypes.length ||
        b.superEffectiveTypes.length - a.superEffectiveTypes.length,
    )

  const itemRuleNotes = team
    .map((member, index) => {
      const pokemon = member.species || `Slot ${index + 1}`
      const rules = getItemRuleNotesForMember(member, fullContext)
      return { pokemon, rules }
    })
    .filter((entry) => entry.rules.length > 0)

  const recommendations: string[] = []

  for (const missingType of uncoveredTypes) {
    const recommendedAttackTypes = getRecommendedAttackTypesForTarget(missingType)
      .slice(0, 3)
      .join(', ')

    recommendations.push(
      `Cobertura faltante contra ${missingType}: considera movimientos de tipo ${recommendedAttackTypes}.`,
    )
  }

  const notes: string[] = []
  if (team.length === 0) {
    notes.push('No hay Pokemon cargados aun.')
  }
  if (moveTypes.length === 0) {
    notes.push('No hay tipos de movimientos identificados. Usando tipos STAB para cobertura minima.')
  }
  if (team.some((member) => member.types.length === 0)) {
    notes.push('Algunos Pokemon no tienen tipos cargados todavia. Puedes completarlos manualmente en el editor.')
  }
  if (!fullContext.airBalloonActive) {
    notes.push('Modo combate activo: Air Balloon/Globo Helio se considera roto.')
  }
  if (fullContext.ignoreAbilityDefenses) {
    notes.push('Modo Mold Breaker activo: se ignoran inmunidades/reducciones por habilidad.')
  }

  return {
    defensiveByType,
    biggestWeaknesses,
    strongestResists,
    uncoveredTypes,
    coveredTypes,
    offensiveByTargetType,
    synergyPairs,
    itemRuleNotes,
    recommendations,
    notes,
  }
}
