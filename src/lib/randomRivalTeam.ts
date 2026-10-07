import { Dex } from '@pkmn/dex'
import { resolveMoveCategory, resolveMoveType, resolveSpeciesTypes } from './dexResolver'
import type { MoveSlot, PokemonType, TeamMember } from './pokemon'
import { getTypeEffectiveness } from './typeChart'

const FALLBACK_BST = 500
const BST_TOLERANCE_STEP = 40
const MAX_BST_TOLERANCE = 400
const RANDOM_POOL_SIZE = 8

const BULKY_ITEMS = ['Leftovers', 'Assault Vest', 'Rocky Helmet', 'Heavy-Duty Boots', 'Sitrus Berry']
const PHYSICAL_ITEMS = ['Choice Band', 'Life Orb', 'Choice Scarf', 'Focus Sash']
const SPECIAL_ITEMS = ['Choice Specs', 'Life Orb', 'Choice Scarf', 'Focus Sash']

type DamagingMove = {
  name: string
  type: PokemonType
  category: 'physical' | 'special'
  basePower: number
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Toma `count` elementos sin repetir de entre los mejores (top 6) para variar los sets entre tiradas. */
function sampleTopMoves(sortedPool: DamagingMove[], count: number): DamagingMove[] {
  if (count <= 0) {
    return []
  }
  const shortlist = [...sortedPool.slice(0, 6)]
  const result: DamagingMove[] = []
  while (result.length < count && shortlist.length > 0) {
    const index = Math.floor(Math.random() * shortlist.length)
    result.push(shortlist.splice(index, 1)[0])
  }
  return result
}

function bestMultiplierAgainst(attackTypes: PokemonType[], defendTypes: PokemonType[]): number {
  if (attackTypes.length === 0 || defendTypes.length === 0) {
    return 1
  }
  return Math.max(...attackTypes.map((type) => getTypeEffectiveness(type, defendTypes)))
}

/** Movimientos ofensivos con poder/tipo/categoria resueltos, calculados una sola vez. */
const DAMAGING_MOVE_POOL: DamagingMove[] = Dex.moves
  .all()
  .filter((move) => move.exists && move.basePower > 0 && (move.category === 'Physical' || move.category === 'Special'))
  .reduce<DamagingMove[]>((acc, move) => {
    const type = resolveMoveType(move.name)
    const category = resolveMoveCategory(move.name)
    if (type && (category === 'physical' || category === 'special')) {
      acc.push({ name: move.name, type, category, basePower: move.basePower })
    }
    return acc
  }, [])

function speciesBst(species: string): number {
  const entry = Dex.species.get(species)
  return entry?.exists ? entry.bst : FALLBACK_BST
}

/** Cuanto mejor le va a `candidateTypes` contra `myTeam`, mas amenaza supone como rival. */
function counterScore(candidateTypes: PokemonType[], myTeam: TeamMember[]): number {
  if (myTeam.length === 0) {
    return 0
  }

  const offense =
    myTeam.reduce((sum, member) => sum + bestMultiplierAgainst(candidateTypes, member.types), 0) /
    myTeam.length
  const defense =
    myTeam.reduce((sum, member) => sum + bestMultiplierAgainst(member.types, candidateTypes), 0) /
    myTeam.length

  return offense - 0.5 * defense
}

function pickCandidateSpecies(
  pool: ReturnType<typeof Dex.species.all>,
  targetBst: number,
  myTeam: TeamMember[],
  used: Set<string>,
) {
  let tolerance = BST_TOLERANCE_STEP
  let candidates: typeof pool = []

  while (candidates.length === 0 && tolerance <= MAX_BST_TOLERANCE) {
    candidates = pool.filter(
      (species) => !used.has(species.name) && Math.abs(species.bst - targetBst) <= tolerance,
    )
    tolerance += BST_TOLERANCE_STEP
  }

  if (candidates.length === 0) {
    return null
  }

  const scored = candidates
    .map((species) => ({
      species,
      score: counterScore(resolveSpeciesTypes(species.name), myTeam),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(RANDOM_POOL_SIZE, candidates.length))

  return pickRandom(scored).species
}

function pickMoves(speciesTypes: PokemonType[], atk: number, spa: number, myTeam: TeamMember[]): MoveSlot[] {
  const preferPhysical = atk >= spa
  const mixed = Math.abs(atk - spa) <= Math.max(atk, spa) * 0.15

  const stabPool = DAMAGING_MOVE_POOL.filter(
    (move) =>
      speciesTypes.includes(move.type) &&
      (mixed || (preferPhysical ? move.category === 'physical' : move.category === 'special')),
  ).sort((a, b) => b.basePower - a.basePower)

  const picked: DamagingMove[] = []
  const pickedNames = new Set<string>()

  for (const move of sampleTopMoves(stabPool, 2)) {
    picked.push(move)
    pickedNames.add(move.name)
  }

  const coveragePool = DAMAGING_MOVE_POOL.filter((move) => !pickedNames.has(move.name))
    .map((move) => ({
      move,
      score: bestMultiplierAgainst([move.type], myTeam.flatMap((member) => member.types)) * move.basePower,
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move)

  for (const move of sampleTopMoves(coveragePool, 4 - picked.length)) {
    if (!pickedNames.has(move.name)) {
      picked.push(move)
      pickedNames.add(move.name)
    }
  }

  while (picked.length < 4) {
    const filler = DAMAGING_MOVE_POOL.find((move) => !pickedNames.has(move.name))
    if (!filler) {
      break
    }
    picked.push(filler)
    pickedNames.add(filler.name)
  }

  return picked.map((move) => ({ name: move.name, type: move.type, category: move.category }))
}

function pickItemAndNature(atk: number, spa: number, def: number, spd: number, spe: number) {
  const preferPhysical = atk >= spa
  const bulky = def + spd >= 220

  const item = bulky ? pickRandom(BULKY_ITEMS) : pickRandom(preferPhysical ? PHYSICAL_ITEMS : SPECIAL_ITEMS)

  let nature: string
  if (item === 'Choice Scarf' || spe >= Math.max(atk, spa)) {
    nature = preferPhysical ? 'Jolly' : 'Timid'
  } else if (bulky) {
    nature = def >= spd ? 'Bold' : 'Calm'
  } else {
    nature = preferPhysical ? 'Adamant' : 'Modest'
  }

  return { item, nature }
}

/** Genera un equipo rival aleatorio con Pokemon de stats totales similares a cada miembro de `myTeam`. */
export function generateRandomRivalTeam(myTeam: TeamMember[]): TeamMember[] {
  const allSpecies = Dex.species
    .all()
    // Nunca se generan legendarios/miticos/ultraentes/paradojicos como rival aleatorio.
    .filter((species) => species.exists && species.isNonstandard === null && species.tags.length === 0)

  const used = new Set<string>()
  const rivalTeam: TeamMember[] = []

  for (const member of myTeam) {
    const targetBst = member.species ? speciesBst(member.species) : FALLBACK_BST
    const candidate = pickCandidateSpecies(allSpecies, targetBst, myTeam, used)
    if (!candidate) {
      continue
    }
    used.add(candidate.name)

    const types = resolveSpeciesTypes(candidate.name)
    const { atk, spa, def, spd, spe } = candidate.baseStats
    const { item, nature } = pickItemAndNature(atk, spa, def, spd, spe)
    const abilities = Object.values(candidate.abilities).filter((value): value is string => Boolean(value))

    rivalTeam.push({
      id: crypto.randomUUID(),
      species: candidate.name,
      spriteUrl: null,
      item,
      ability: abilities.length > 0 ? pickRandom(abilities) : '',
      nature,
      types,
      moves: pickMoves(types, atk, spa, myTeam),
      source: 'showdown',
    })
  }

  return rivalTeam
}
