import { Dex } from '@pkmn/dex'

export const OFFICIAL_MOVE_OPTIONS = Dex.moves
  .all()
  .filter((move) => move.exists)
  .sort((a, b) => a.name.localeCompare(b.name))

export const OFFICIAL_ABILITY_OPTIONS = Dex.abilities
  .all()
  .filter((ability) => ability.exists)
  .map((ability) => ability.name)
  .filter((name) => Boolean(name))
  .sort((a, b) => a.localeCompare(b))

export const OFFICIAL_POKEMON_OPTIONS = Dex.species
  .all()
  .map((species) => species.name)
  .filter((name) => Boolean(name))
  .sort((a, b) => a.localeCompare(b))
