export const POKEMON_TYPES = [
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
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

export type MoveCategory = 'physical' | 'special' | 'status'

export type MoveSlot = {
  name: string
  type: PokemonType | null
  category: MoveCategory | null
}

export type TeamMemberSource = 'manual' | 'showdown'

export type TeamMember = {
  id: string
  species: string
  spriteUrl: string | null
  item: string
  ability: string
  nature: string
  types: PokemonType[]
  moves: MoveSlot[]
  source: TeamMemberSource
}

export type TeamAnalysis = {
  defensiveByType: Array<{
    type: PokemonType
    weak: number
    resist: number
    immune: number
    neutral: number
    weakMembers: string[]
    resistMembers: string[]
    immuneMembers: string[]
    neutralMembers: string[]
    x4Members: string[]
  }>
  biggestWeaknesses: Array<{ type: PokemonType; count: number }>
  strongestResists: Array<{ type: PokemonType; count: number }>
  uncoveredTypes: PokemonType[]
  coveredTypes: PokemonType[]
  offensiveByTargetType: Array<{
    targetType: PokemonType
    bestMultiplier: number
    sourceTypes: PokemonType[]
    sources: Array<{
      pokemon: string
      moves: Array<{
        name: string
        type: PokemonType
        isStab: boolean
      }>
    }>
  }>
  synergyPairs: Array<{
    pair: [string, string]
    sharedWeaknessTypes: PokemonType[]
    superEffectiveTypes: PokemonType[]
    superEffectiveDetails: Array<{
      type: PokemonType
      sources: Array<{
        pokemon: string
        moves: Array<{
          name: string
          isStab: boolean
        }>
      }>
    }>
  }>
  itemRuleNotes: Array<{
    pokemon: string
    rules: string[]
  }>
  recommendations: string[]
  notes: string[]
}
