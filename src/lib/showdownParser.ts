import type { MoveSlot, TeamMember } from './pokemon'

function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function parseHeadLine(head: string): { species: string; item: string } {
  const [left, right] = head.split('@').map((part) => part.trim())
  const item = right ?? ''

  const withoutGender = left.replace(/\s\(([MF])\)$/i, '').trim()
  const speciesFromNickname = withoutGender.match(/\(([^()]+)\)\s*$/)?.[1]
  const species = (speciesFromNickname ?? withoutGender).trim()

  return { species, item }
}

function parseMove(line: string): MoveSlot {
  const moveName = line.replace(/^-\s*/, '').trim()
  return { name: moveName, type: null, category: null }
}

function isValidBlock(block: string): boolean {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return false
  }

  // Only the species line is mandatory; item, ability, nature and moves are optional in Showdown's format.
  const head = lines[0]
  const isMetaLine =
    head.startsWith('-') ||
    head.startsWith('Ability:') ||
    / Nature$/i.test(head) ||
    /^(EVs|IVs|Level|Shiny|Happiness|Tera Type):/i.test(head)

  return !isMetaLine
}

function buildMember(block: string, index: number): TeamMember | null {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return null
  }

  const { species, item } = parseHeadLine(lines[0])

  let ability = ''
  let nature = ''
  const moves: MoveSlot[] = []

  for (const line of lines.slice(1)) {
    if (line.startsWith('Ability:')) {
      ability = line.replace('Ability:', '').trim()
      continue
    }

    if (line.endsWith(' Nature')) {
      nature = line.replace(' Nature', '').trim()
      continue
    }

    if (line.startsWith('-')) {
      moves.push(parseMove(line))
    }
  }

  while (moves.length < 4) {
    moves.push({ name: '', type: null, category: null })
  }

  return {
    id: `${sanitizeId(species)}-${index + 1}`,
    species,
    spriteUrl: null,
    item,
    ability,
    nature,
    types: [],
    moves,
    source: 'showdown',
  }
}

export function parseShowdownTeam(input: string): TeamMember[] {
  const blocks = input
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)

  return blocks
    .map((block, index) => buildMember(block, index))
    .filter((member): member is TeamMember => member !== null)
}

export function validateShowdownTeamText(input: string): boolean {
  const blocks = input
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)

  if (blocks.length === 0) {
    return false
  }

  return blocks.every((block) => isValidBlock(block))
}
