export function normalizeSpeciesForSprite(species: string): string {
  return species
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function getSpriteUrl(species: string): string | null {
  const id = normalizeSpeciesForSprite(species)
  if (!id) {
    return null
  }

  return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`
}
