import { Dex } from '@pkmn/dex'
import type { MoveCategory, PokemonType, TeamMember } from './pokemon'

function toLowerPokemonType(value: string): PokemonType | null {
  const normalized = value.trim().toLowerCase()
  const validTypes: PokemonType[] = [
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy',
  ]

  return validTypes.includes(normalized as PokemonType)
    ? (normalized as PokemonType)
    : null
}

export function resolveMoveType(moveName: string): PokemonType | null {
  const move = Dex.moves.get(moveName)
  if (!move?.exists || !move.type) {
    return null
  }

  return toLowerPokemonType(move.type)
}

export function resolveMoveCategory(moveName: string): MoveCategory | null {
  const move = Dex.moves.get(moveName)
  if (!move?.exists || !move.category) {
    return null
  }

  const normalized = move.category.trim().toLowerCase()
  if (normalized === 'physical' || normalized === 'special' || normalized === 'status') {
    return normalized
  }

  return null
}

export function resolveSpeciesTypes(species: string): PokemonType[] {
  const mon = Dex.species.get(species)
  if (!mon?.exists || !mon.types?.length) {
    return []
  }

  return mon.types
    .map((typeName) => toLowerPokemonType(typeName))
    .filter((type): type is PokemonType => type !== null)
}

export function enrichTeamWithDex(team: TeamMember[]): TeamMember[] {
  return team.map((member) => {
    const resolvedTypes = member.types.length > 0 ? member.types : resolveSpeciesTypes(member.species)

    const resolvedMoves = member.moves.map((move) => {
      if (move.type && move.category) {
        return move
      }

      return {
        ...move,
        type: move.type ?? resolveMoveType(move.name),
        category: move.category ?? resolveMoveCategory(move.name),
      }
    })

    return {
      ...member,
      types: resolvedTypes,
      moves: resolvedMoves,
    }
  })
}
