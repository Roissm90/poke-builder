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

/** Imagen a mostrar cuando no hay especie o el sprite remoto no carga. */
export const DEFAULT_SPRITE_URL = '/sprite_default.png'

/** Clase que se agrega a la etiqueta <img> cuando se muestra el sprite por defecto. */
export const DEFAULT_SPRITE_CLASS = 'default'

export function handleSpriteImgError(event: { currentTarget: HTMLImageElement }): void {
  const img = event.currentTarget
  if (img.src.endsWith(DEFAULT_SPRITE_URL)) {
    return
  }
  img.onerror = null
  img.src = DEFAULT_SPRITE_URL
  img.classList.add(DEFAULT_SPRITE_CLASS)
}
