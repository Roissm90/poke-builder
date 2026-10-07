import { TYPE_NAME_ES } from './typeNames'

type Tags = { from?: string; of?: string }

const STAT_NAMES: Record<string, string> = {
  atk: 'Ataque',
  def: 'Defensa',
  spa: 'Ataque Especial',
  spd: 'Defensa Especial',
  spe: 'Velocidad',
  accuracy: 'Precision',
  evasion: 'Evasion',
}

const STATUS_NAMES: Record<string, string> = {
  brn: 'quemado',
  par: 'paralizado',
  psn: 'envenenado',
  tox: 'gravemente envenenado',
  slp: 'dormido',
  frz: 'congelado',
}

export { STATUS_NAMES }


const WEATHER_NAMES: Record<string, string> = {
  sunnyday: 'Dia soleado',
  desolateland: 'Sol extremo',
  raindance: 'Lluvia',
  primordialsea: 'Lluvia torrencial',
  sandstorm: 'Tormenta de arena',
  hail: 'Granizo',
  snow: 'Nieve',
  snowscape: 'Nieve',
  deltastream: 'Corriente extraña',
}

const TYPE_NAMES: Record<string, string> = TYPE_NAME_ES

const REASON_NAMES: Record<string, string> = {
  par: 'paralisis',
  slp: 'esta dormido',
  frz: 'esta congelado',
  flinch: 'se asusto',
  nopp: 'sin PP',
  recharge: 'debe recargar',
}

function parsePokemonIdent(ident: string | undefined): { side: string; name: string } {
  if (!ident) {
    return { side: '', name: '' }
  }
  const match = ident.match(/^(p\d)[ab]?: (.+)$/)
  if (!match) {
    return { side: '', name: ident }
  }
  return { side: match[1], name: match[2] }
}

function stripEffectPrefix(raw: string | undefined): string {
  if (!raw) {
    return 'un efecto'
  }
  return raw.replace(/^(move|ability|item):\s*/, '')
}

function extractTags(args: string[]): Tags {
  const tags: Tags = {}
  for (const arg of args) {
    if (arg.startsWith('[from]')) {
      tags.from = arg.replace('[from]', '').trim()
    } else if (arg.startsWith('[of]')) {
      tags.of = arg.replace('[of]', '').trim()
    }
  }
  return tags
}

function describeCause(tags: Tags): string {
  if (!tags.from) {
    return ''
  }
  const effect = stripEffectPrefix(tags.from)
  if (tags.of) {
    const { name } = parsePokemonIdent(tags.of)
    return name ? ` por ${effect} de ${name}` : ` por ${effect}`
  }
  return ` por ${effect}`
}

function formatHp(raw: string | undefined): string {
  if (!raw) {
    return ''
  }
  if (raw.includes('fnt')) {
    return '0 PS'
  }
  const [fraction] = raw.split(' ')
  return `${fraction} PS`
}

/** Traduce una linea del protocolo de Pokemon Showdown a texto legible en español. Devuelve null si debe ocultarse. */
export function formatBattleLogLine(line: string): string | null {
  if (!line.startsWith('|')) {
    return line.trim() ? line : null
  }

  const [cmd, ...args] = line.slice(1).split('|')

  switch (cmd) {
    case '':
    case 't:':
    case 'gametype':
    case 'gen':
    case 'tier':
    case 'clearpoke':
    case 'poke':
    case 'teampreview':
    case 'teamsize':
    case 'player':
    case 'rule':
    case 'rated':
    case 'split':
    case 'upkeep':
    case 'debug':
      return null

    case 'start':
      return 'Comienza el combate.'

    case 'turn':
      return `— Turno ${args[0]} —`

    case 'switch':
    case 'drag': {
      const { name } = parsePokemonIdent(args[0])
      const hp = formatHp(args[2])
      return `${name} entra al campo${hp ? ` (${hp})` : ''}.`
    }

    case 'move': {
      const source = parsePokemonIdent(args[0]).name
      const move = args[1]
      const target = args[2] ? parsePokemonIdent(args[2]).name : ''
      return target && target !== source
        ? `${source} usa ${move} sobre ${target}.`
        : `${source} usa ${move}.`
    }

    case 'cant': {
      const { name } = parsePokemonIdent(args[0])
      const reasonId = (args[1] ?? '').replace(/^(move|ability):\s*/, '')
      const reason = REASON_NAMES[reasonId] ?? reasonId
      return `${name} no puede atacar${reason ? ` (${reason})` : ''}.`
    }

    case 'faint': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} se debilita.`
    }

    case '-damage': {
      const { name } = parsePokemonIdent(args[0])
      const tags = extractTags(args.slice(2))
      const hp = formatHp(args[1])
      return `${name} recibe daño${describeCause(tags)}${hp ? ` (${hp})` : ''}.`
    }

    case '-heal': {
      const { name } = parsePokemonIdent(args[0])
      const tags = extractTags(args.slice(2))
      const hp = formatHp(args[1])
      return `${name} recupera PS${describeCause(tags)}${hp ? ` (${hp})` : ''}.`
    }

    case '-boost':
    case '-unboost': {
      const { name } = parsePokemonIdent(args[0])
      const stat = STAT_NAMES[args[1]] ?? args[1]
      const verb = cmd === '-boost' ? 'sube' : 'baja'
      return `${stat} de ${name} ${verb}.`
    }

    case '-status': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} queda ${STATUS_NAMES[args[1]] ?? args[1]}.`
    }

    case '-curestatus': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} se recupera de estar ${STATUS_NAMES[args[1]] ?? args[1]}.`
    }

    case '-ability': {
      const { name } = parsePokemonIdent(args[0])
      return `Se activa la habilidad ${args[1]} de ${name}.`
    }

    case '-enditem': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} consume su objeto ${args[1]}.`
    }

    case '-item': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} revela su objeto ${args[1]}.`
    }

    case '-activate': {
      const { name } = parsePokemonIdent(args[0])
      return `Se activa ${stripEffectPrefix(args[1])} de ${name}.`
    }

    case '-start': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} queda afectado por ${stripEffectPrefix(args[1])}.`
    }

    case '-end': {
      const { name } = parsePokemonIdent(args[0])
      return `${stripEffectPrefix(args[1])} termina para ${name}.`
    }

    case '-supereffective':
      return `¡Es muy eficaz contra ${parsePokemonIdent(args[0]).name}!`

    case '-resisted':
      return `No es muy eficaz contra ${parsePokemonIdent(args[0]).name}.`

    case '-immune':
      return `No afecta a ${parsePokemonIdent(args[0]).name}.`

    case '-crit':
      return `¡Golpe critico contra ${parsePokemonIdent(args[0]).name}!`

    case '-miss': {
      const source = parsePokemonIdent(args[0]).name
      const target = args[1] ? parsePokemonIdent(args[1]).name : ''
      return target ? `${source} falla el ataque contra ${target}.` : `${source} falla el ataque.`
    }

    case '-fail': {
      const { name } = parsePokemonIdent(args[0])
      return `El ataque de ${name} falla.`
    }

    case '-weather':
      return args[0] === 'none'
        ? 'El clima vuelve a la normalidad.'
        : `El clima cambia a ${WEATHER_NAMES[args[0]?.toLowerCase()] ?? args[0]}.`

    case '-fieldstart': {
      const tags = extractTags(args.slice(1))
      return `Se activa ${stripEffectPrefix(args[0])}${describeCause(tags)}.`
    }

    case '-fieldend':
      return `Termina ${stripEffectPrefix(args[0])}.`

    case '-sidestart': {
      const sideLabel = parsePokemonIdent(args[0]).name || args[0]
      return `${sideLabel} gana el efecto ${stripEffectPrefix(args[1])}.`
    }

    case '-sideend': {
      const sideLabel = parsePokemonIdent(args[0]).name || args[0]
      return `${sideLabel} pierde el efecto ${stripEffectPrefix(args[1])}.`
    }

    case '-terastallize': {
      const { name } = parsePokemonIdent(args[0])
      return `${name} se teracristaliza (tipo ${TYPE_NAMES[args[1]?.toLowerCase()] ?? args[1]}).`
    }

    case 'win':
      return `¡${args[0]} gana el combate!`

    case 'tie':
      return 'El combate termina en empate.'

    default:
      return null
  }
}
