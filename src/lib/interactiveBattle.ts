import type { BattleRequest } from './battleRequest'
import { BATTLE_FORMAT, toPokemonSet } from './battleSim'
import type { TeamMember } from './pokemon'

export type InteractiveBattleCallbacks = {
  onLog: (line: string) => void
  onRequest: (request: BattleRequest) => void
  onError: (message: string) => void
  onEnd: (winnerName: string | null) => void
}

export type InteractiveBattleHandle = {
  sendChoice: (choice: string) => void
}

function splitFirst(line: string, separator: string): [string, string] {
  const index = line.indexOf(separator)
  return index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)]
}

/** Arranca un combate de dobles donde el jugador elige sus acciones turno a turno contra una IA rival. */
export async function startInteractiveBattle(
  myTeam: TeamMember[],
  rivalTeam: TeamMember[],
  callbacks: InteractiveBattleCallbacks,
  myName = 'Mi equipo',
  rivalName = 'Equipo rival',
): Promise<InteractiveBattleHandle> {
  const { BattleStreams, RandomPlayerAI, Teams } = await import('@pkmn/sim')

  const stream = new BattleStreams.BattleStream()
  const streams = BattleStreams.getPlayerStreams(stream)

  const p1Sets = myTeam.map((member) => toPokemonSet(member))
  const p2Sets = rivalTeam.map((member) => toPokemonSet(member))

  const spec = { formatid: BATTLE_FORMAT }
  const p1spec = { name: myName, team: Teams.pack(p1Sets) }
  const p2spec = { name: rivalName, team: Teams.pack(p2Sets) }

  class ManualPlayer extends BattleStreams.BattlePlayer {
    receiveRequest(request: BattleRequest) {
      if (request.teamPreview) {
        // El orden del equipo ya quedo fijado al elegir el squad, se manda el orden por defecto.
        this.choose('default')
        return
      }
      callbacks.onRequest(request)
    }

    receiveLine(line: string) {
      if (!line.startsWith('|')) {
        return
      }

      const [cmd, rest] = splitFirst(line.slice(1), '|')

      if (cmd === 'request') {
        this.receiveRequest(JSON.parse(rest) as BattleRequest)
        return
      }

      if (cmd === 'error') {
        callbacks.onError(rest)
        return
      }

      this.log.push(line)
      callbacks.onLog(line)

      if (cmd === 'win') {
        callbacks.onEnd(rest.trim())
      } else if (cmd === 'tie') {
        callbacks.onEnd(null)
      }
    }
  }

  const p1 = new ManualPlayer(streams.p1)
  const p2 = new RandomPlayerAI(streams.p2)

  void p1.start()
  void p2.start()

  void streams.omniscient.write(
    `>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1spec)}\n>player p2 ${JSON.stringify(p2spec)}`,
  )

  return {
    sendChoice: (choice: string) => p1.choose(choice),
  }
}
