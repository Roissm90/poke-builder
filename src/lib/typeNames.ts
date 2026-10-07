import type { PokemonType } from './pokemon'

/** Traduccion de tipos de Pokemon al español, usada en toda la landing. */
export const TYPE_NAME_ES: Record<PokemonType, string> = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Electrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psiquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragon',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
}

export function translateType(type: PokemonType | string): string {
  return TYPE_NAME_ES[type as PokemonType] ?? type
}
