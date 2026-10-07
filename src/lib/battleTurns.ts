export type TurnLog = {
  turn: number
  label: string
  lines: string[]
}

const TURN_HEADER_RE = /^— Turno (\d+) —$/

/** Agrupa las lineas legibles del combate en turnos, para mostrarlas como tabs. */
export function groupLogByTurn(readableLines: string[]): TurnLog[] {
  const turns: TurnLog[] = []
  let current: TurnLog = { turn: 0, label: 'Previa', lines: [] }

  for (const line of readableLines) {
    const match = line.match(TURN_HEADER_RE)
    if (match) {
      turns.push(current)
      const turnNumber = Number(match[1])
      current = { turn: turnNumber, label: `Turno ${turnNumber}`, lines: [] }
      continue
    }
    current.lines.push(line)
  }
  turns.push(current)

  return turns.filter((turnLog) => turnLog.lines.length > 0)
}

/** Especies (en minusculas) que se debilitaron en el bando indicado, segun el log crudo. */
export function faintedSpeciesForSide(rawLog: string[], side: 'p1' | 'p2'): Set<string> {
  const re = new RegExp(`^\\|faint\\|${side}[ab]: (.+)$`)
  const species = new Set<string>()

  for (const line of rawLog) {
    const match = line.match(re)
    if (match) {
      species.add(match[1].trim().toLowerCase())
    }
  }

  return species
}
