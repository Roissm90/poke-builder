export type MoveRequestOption = {
  move: string
  id: string
  pp?: number
  maxpp?: number
  target?: string
  disabled?: string | boolean
}

export type ActiveRequestData = {
  moves: MoveRequestOption[]
  trapped?: boolean
  canTerastallize?: string
}

export type PokemonRequestData = {
  ident: string
  details: string
  condition: string
  active: boolean
  moves: string[]
}

export type SideRequestData = {
  name: string
  id: string
  pokemon: PokemonRequestData[]
}

export type TeamPreviewRequest = {
  teamPreview: true
  wait?: undefined
  forceSwitch?: undefined
  active?: undefined
  side: SideRequestData
}

export type ForceSwitchRequest = {
  teamPreview?: undefined
  wait?: undefined
  forceSwitch: boolean[]
  active?: undefined
  side: SideRequestData
}

export type MoveRequest = {
  teamPreview?: undefined
  wait?: undefined
  forceSwitch?: undefined
  active: ActiveRequestData[]
  side: SideRequestData
}

export type WaitRequest = {
  teamPreview?: undefined
  wait: true
  forceSwitch?: undefined
  active?: undefined
  side: SideRequestData
}

export type BattleRequest = TeamPreviewRequest | ForceSwitchRequest | MoveRequest | WaitRequest

/** Targets que requieren que el jugador elija manualmente una de las posiciones rivales. */
export function needsFoeTargetChoice(moveTarget: string | undefined): boolean {
  return moveTarget === 'normal' || moveTarget === 'any' || moveTarget === 'adjacentFoe'
}

/** Targets ambiguos entre uno mismo y el aliado. */
export function needsAllyOrSelfChoice(moveTarget: string | undefined): boolean {
  return moveTarget === 'adjacentAllyOrSelf'
}

/** Para moves que solo pueden apuntar al aliado, calcula el target implicito (sin preguntar). */
export function implicitAllyTarget(moveTarget: string | undefined, slotIndex: number): number | undefined {
  if (moveTarget !== 'adjacentAlly') {
    return undefined
  }
  return slotIndex === 0 ? -2 : -1
}

export function allyOrSelfOptions(slotIndex: number): { label: string; value: number }[] {
  const selfSlot = slotIndex === 0 ? 1 : 2
  const allySlot = slotIndex === 0 ? 2 : 1
  return [
    { label: 'A mi mismo', value: -selfSlot },
    { label: 'A mi aliado', value: -allySlot },
  ]
}

export const FOE_TARGET_OPTIONS = [
  { label: 'Rival 1', value: 1 },
  { label: 'Rival 2', value: 2 },
]
