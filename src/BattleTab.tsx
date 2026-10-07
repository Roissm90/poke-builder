import { useEffect, useMemo, useState } from 'react'
import { pickBestSquadOfFour, pickMostThreateningMember } from './lib/battleAI'
import { formatBattleLogLine, STATUS_NAMES } from './lib/battleLogFormatter'
import {
  allyOrSelfOptions,
  FOE_TARGET_OPTIONS,
  implicitAllyTarget,
  needsAllyOrSelfChoice,
  needsFoeTargetChoice,
  type BattleRequest,
  type MoveRequestOption,
} from './lib/battleRequest'
import { runDoublesBattle } from './lib/battleSim'
import {
  enrichTeamWithDex,
  resolveMoveCategory,
  resolveMoveType,
  resolveSpeciesTypes,
} from './lib/dexResolver'
import {
  OFFICIAL_ABILITY_OPTIONS,
  OFFICIAL_MOVE_OPTIONS,
  OFFICIAL_POKEMON_OPTIONS,
} from './lib/dexOptions'
import { startInteractiveBattle, type InteractiveBattleHandle } from './lib/interactiveBattle'
import type { MoveSlot, TeamMember } from './lib/pokemon'
import { generateRandomRivalTeam } from './lib/randomRivalTeam'
import { parseShowdownTeam, validateShowdownTeamText } from './lib/showdownParser'
import { DEFAULT_SPRITE_CLASS, DEFAULT_SPRITE_URL, getSpriteUrl, handleSpriteImgError } from './lib/sprite'

const styles = new Proxy({} as Record<string, string>, {
  get: (_, property: string | symbol) => String(property),
}) as Record<string, string>

function Sprite({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const classes = [className, src ? '' : DEFAULT_SPRITE_CLASS].filter(Boolean).join(' ')
  return (
    <img src={src ?? DEFAULT_SPRITE_URL} alt={alt} className={classes} onError={handleSpriteImgError} />
  )
}

const RIVAL_SESSION_KEY = 'poke-builder-rival-showdown-text'
const SQUAD_SIZE = 4
const BATTLE_MY_NAME = 'Mi equipo'
const BATTLE_RIVAL_NAME = 'Equipo rival'

type Phase = 'setup' | 'bans' | 'squad' | 'result'
type BattleMode = 'auto' | 'manual'

type PendingChoice =
  | { kind: 'move'; moveSlot: number; target?: number; terastallize?: boolean }
  | { kind: 'switch'; pokemonSlot: number }
  | { kind: 'pass' }

function findMemberForPokemon(
  pokemon: { details: string },
  squad: TeamMember[],
): TeamMember | undefined {
  const species = pokemon.details.split(',')[0]?.trim().toLowerCase()
  if (!species) {
    return undefined
  }
  return squad.find((member) => member.species.trim().toLowerCase() === species)
}

type RivalSlotInfo = {
  species: string
  hp: string | null
  status: string | null
  confused: boolean
}

/** Mantiene al dia la info visible del rival (especie, PS y estados) a partir de las lineas del protocolo. */
function applyRivalLogLine(
  line: string,
  slots: (RivalSlotInfo | null)[],
): (RivalSlotInfo | null)[] {
  const parts = line.split('|')
  const cmd = parts[1]
  const slotMatch = (parts[2] ?? '').match(/^p2([ab]):/)
  if (!slotMatch) {
    return slots
  }
  const slotIndex = slotMatch[1] === 'a' ? 0 : 1
  const next = [...slots]

  if (cmd === 'switch' || cmd === 'drag') {
    const species = (parts[3] ?? '').split(',')[0]?.trim() ?? ''
    const [hp, status] = (parts[4] ?? '').trim().split(' ')
    next[slotIndex] = { species, hp: hp || null, status: status || null, confused: false }
    return next
  }

  if (cmd === 'faint') {
    next[slotIndex] = null
    return next
  }

  const current = next[slotIndex]
  if (!current) {
    return next
  }

  if (cmd === '-damage' || cmd === '-heal') {
    const [hp, status] = (parts[3] ?? '').trim().split(' ')
    next[slotIndex] = { ...current, hp: hp || current.hp, status: status || null }
    return next
  }

  if (cmd === '-status') {
    next[slotIndex] = { ...current, status: parts[3] || null }
    return next
  }

  if (cmd === '-curestatus') {
    next[slotIndex] = { ...current, status: null }
    return next
  }

  if (cmd === '-start' && (parts[3] ?? '').toLowerCase().includes('confusion')) {
    next[slotIndex] = { ...current, confused: true }
    return next
  }

  if (cmd === '-end' && (parts[3] ?? '').toLowerCase().includes('confusion')) {
    next[slotIndex] = { ...current, confused: false }
    return next
  }

  return next
}

function choiceToString(choice: PendingChoice | null): string {
  if (!choice || choice.kind === 'pass') {
    return 'pass'
  }
  if (choice.kind === 'switch') {
    return `switch ${choice.pokemonSlot}`
  }
  let text = `move ${choice.moveSlot}`
  if (choice.target !== undefined) {
    text += ` ${choice.target}`
  }
  if (choice.terastallize) {
    text += ' terastallize'
  }
  return text
}

function isPendingChoiceComplete(
  choice: PendingChoice | null,
  moves: MoveRequestOption[],
): boolean {
  if (!choice) {
    return false
  }
  if (choice.kind !== 'move') {
    return true
  }
  const move = moves[choice.moveSlot - 1]
  if (!move) {
    return false
  }
  if (
    (needsFoeTargetChoice(move.target) || needsAllyOrSelfChoice(move.target)) &&
    choice.target === undefined
  ) {
    return false
  }
  return true
}

function createEmptyRivalMember(): TeamMember {
  return {
    id: crypto.randomUUID(),
    species: '',
    spriteUrl: null,
    item: '',
    ability: '',
    nature: '',
    types: [],
    moves: [
      { name: '', type: null, category: null },
      { name: '', type: null, category: null },
      { name: '', type: null, category: null },
      { name: '', type: null, category: null },
    ],
    source: 'manual',
  }
}

function MiniCard({
  member,
  label,
  selected,
  faded,
  onClick,
  showDetails,
}: {
  member: TeamMember
  label?: string
  selected?: boolean
  faded?: boolean
  onClick?: () => void
  showDetails?: boolean
}) {
  const sprite = member.spriteUrl ?? getSpriteUrl(member.species)
  const moveNames = member.moves.map((move) => move.name).filter(Boolean)

  return (
    <article
      className={`${styles.battleMiniCard} ${selected ? styles.battleMiniCardSelected : ''} ${
        faded ? styles.battleMiniCardFaded : ''
      } ${onClick ? styles.battleMiniCardClickable : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
    >
      {label ? <span className={styles.battleMiniCardBadge}>{label}</span> : null}
      <div className={styles.spriteWrap}>
        <Sprite src={sprite} alt={member.species} className={styles.sprite} />
      </div>
      <h4>{member.species || 'Sin nombre'}</h4>
      {showDetails ? (
        <div className={styles.battleMiniCardDetails}>
          <p>
            <strong>Objeto:</strong> {member.item || '-'}
          </p>
          <p>
            <strong>Habilidad:</strong> {member.ability || '-'}
          </p>
          <p>
            <strong>Naturaleza:</strong> {member.nature || '-'}
          </p>
          <p>
            <strong>Movimientos:</strong> {moveNames.length > 0 ? moveNames.join(' | ') : '-'}
          </p>
        </div>
      ) : null}
    </article>
  )
}

function ActiveSlotControls({
  slotIndex,
  pokemonName,
  pokemonCondition,
  moves,
  canTerastallize,
  benchOptions,
  pending,
  onChange,
  member,
  rivalSlots,
  rivalAliveCount,
  switchOnly,
}: {
  slotIndex: number
  pokemonName: string
  pokemonCondition: string
  moves: MoveRequestOption[]
  canTerastallize?: string
  benchOptions: { slot: number; label: string }[]
  pending: PendingChoice | null
  onChange: (choice: PendingChoice | null) => void
  member?: TeamMember
  rivalSlots?: (RivalSlotInfo | null)[]
  rivalAliveCount?: number | null
  switchOnly?: boolean
}) {
  const [mode, setMode] = useState<'move' | 'switch'>(switchOnly ? 'switch' : 'move')
  const pendingTera = pending?.kind === 'move' ? Boolean(pending.terastallize) : false

  return (
    <div className={styles.battleSlotControls}>
      <h4>
        {pokemonName} <span className={styles.battleSlotCondition}>({pokemonCondition})</span>
      </h4>
      {member ? (
        <p className={styles.battleSlotMeta}>
          {member.ability ? `Habilidad: ${member.ability}` : null}
          {member.nature ? ` · Naturaleza: ${member.nature}` : null}
          {member.item ? ` · Objeto: ${member.item}` : null}
        </p>
      ) : null}

      {switchOnly ? null : (
        <div className={styles.battleSlotModeTabs}>
          <button
            type="button"
            className={mode === 'move' ? styles.battleSlotModeActive : ''}
            onClick={() => setMode('move')}
          >
            Atacar
          </button>
          <button
            type="button"
            className={mode === 'switch' ? styles.battleSlotModeActive : ''}
            onClick={() => setMode('switch')}
            disabled={benchOptions.length === 0}
          >
            Cambiar
          </button>
        </div>
      )}

      {mode === 'move' && !switchOnly ? (
        <div className={styles.battleMoveGrid}>
          {moves.map((move, moveIndex) => {
            const moveSlotNumber = moveIndex + 1
            const isDisabled = Boolean(move.disabled)
            const isChosen = pending?.kind === 'move' && pending.moveSlot === moveSlotNumber
            const implicitTarget = implicitAllyTarget(move.target, slotIndex)
            const needsFoe = needsFoeTargetChoice(move.target)
            const needsAllyOrSelf = needsAllyOrSelfChoice(move.target)

            return (
              <div key={`${move.id}-${moveIndex}`} className={styles.battleMoveWrap}>
                <button
                  type="button"
                  className={`${styles.battleMoveBtn} ${isChosen ? styles.battleMoveBtnSelected : ''}`}
                  disabled={isDisabled}
                  onClick={() =>
                    onChange({
                      kind: 'move',
                      moveSlot: moveSlotNumber,
                      target: implicitTarget,
                      terastallize: pendingTera,
                    })
                  }
                >
                  {move.move} {move.pp !== undefined ? `(${move.pp}/${move.maxpp})` : ''}
                </button>

                {isChosen && needsFoe ? (
                  <div className={styles.battleTargetRow}>
                    {FOE_TARGET_OPTIONS.filter((option) => {
                      // Si al rival solo le queda un Pokemon vivo, no hay nada que elegir en el otro puesto.
                      if (rivalAliveCount !== undefined && rivalAliveCount !== null && rivalAliveCount <= 1) {
                        return rivalSlots?.[option.value - 1] != null
                      }
                      return true
                    }).map((option) => {
                      const slot = rivalSlots?.[option.value - 1] ?? null
                      const foeSprite = slot?.species ? getSpriteUrl(slot.species) : null
                      const statusLabel = slot?.status
                        ? STATUS_NAMES[slot.status] ?? slot.status
                        : null
                      const conditionLabels = [statusLabel, slot?.confused ? 'confundido' : null].filter(
                        (label): label is string => Boolean(label),
                      )

                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={
                            pending?.kind === 'move' && pending.target === option.value
                              ? styles.battleTargetBtnSelected
                              : styles.battleTargetBtn
                          }
                          onClick={() =>
                            onChange({
                              kind: 'move',
                              moveSlot: moveSlotNumber,
                              target: option.value,
                              terastallize: pendingTera,
                            })
                          }
                        >
                          <Sprite
                            src={foeSprite}
                            alt={slot?.species ?? ''}
                            className={styles.battleTargetSprite}
                          />
                          <span className={styles.battleTargetInfo}>
                            <span className={styles.battleTargetName}>{slot?.species ?? option.label}</span>
                            {slot?.hp ? (
                              <span className={styles.battleTargetHp}>{slot.hp} PS</span>
                            ) : null}
                            {conditionLabels.length > 0 ? (
                              <span className={styles.battleTargetStatus}>
                                {conditionLabels
                                  .map((label) => label.charAt(0).toUpperCase() + label.slice(1))
                                  .join(' · ')}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {isChosen && needsAllyOrSelf ? (
                  <div className={styles.battleTargetRow}>
                    {allyOrSelfOptions(slotIndex).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          pending?.kind === 'move' && pending.target === option.value
                            ? styles.battleTargetBtnSelected
                            : styles.battleTargetBtn
                        }
                        onClick={() =>
                          onChange({
                            kind: 'move',
                            moveSlot: moveSlotNumber,
                            target: option.value,
                            terastallize: pendingTera,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}

          {canTerastallize ? (
            <label className={styles.battleTeraToggle}>
              <input
                type="checkbox"
                checked={pendingTera}
                disabled={pending?.kind !== 'move'}
                onChange={(event) => {
                  if (pending?.kind !== 'move') {
                    return
                  }
                  onChange({ ...pending, terastallize: event.target.checked })
                }}
              />
              Teracristalizar ({canTerastallize})
            </label>
          ) : null}
        </div>
      ) : (
        <div className={styles.battleMoveGrid}>
          {benchOptions.map((option) => (
            <button
              key={option.slot}
              type="button"
              className={`${styles.battleMoveBtn} ${
                pending?.kind === 'switch' && pending.pokemonSlot === option.slot
                  ? styles.battleMoveBtnSelected
                  : ''
              }`}
              onClick={() => onChange({ kind: 'switch', pokemonSlot: option.slot })}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BattleTab({ team }: { team: TeamMember[] }) {
  const [rivalShowdownText, setRivalShowdownText] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }
    return window.sessionStorage.getItem(RIVAL_SESSION_KEY) ?? ''
  })
  const [rivalTeam, setRivalTeam] = useState<TeamMember[]>([])
  const [rivalError, setRivalError] = useState('')

  const [phase, setPhase] = useState<Phase>('setup')
  const [myBan, setMyBan] = useState<{ id: string; reason: string } | null>(null)
  const [rivalBanId, setRivalBanId] = useState<string | null>(null)
  const [mySquadIds, setMySquadIds] = useState<string[]>([])
  const [rivalSquad, setRivalSquad] = useState<TeamMember[] | null>(null)

  const [isSimulating, setIsSimulating] = useState(false)
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [battleWinner, setBattleWinner] = useState<'mine' | 'rival' | 'draw' | null>(null)
  const [battleError, setBattleError] = useState('')

  const [battleMode, setBattleMode] = useState<BattleMode>('auto')
  const [interactiveHandle, setInteractiveHandle] = useState<InteractiveBattleHandle | null>(null)
  const [currentRequest, setCurrentRequest] = useState<BattleRequest | null>(null)
  const [pendingChoices, setPendingChoices] = useState<(PendingChoice | null)[]>([null, null])
  const [battleEnded, setBattleEnded] = useState(false)
  const [rivalSlots, setRivalSlots] = useState<(RivalSlotInfo | null)[]>([null, null])
  const [rivalAliveCount, setRivalAliveCount] = useState<number | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = rivalShowdownText.trim()
      if (!trimmed) {
        window.sessionStorage.removeItem(RIVAL_SESSION_KEY)
        return
      }

      window.sessionStorage.setItem(RIVAL_SESSION_KEY, rivalShowdownText)

      if (!validateShowdownTeamText(trimmed)) {
        setRivalError('Formato invalido de Showdown.')
        return
      }

      const parsed = parseShowdownTeam(trimmed)
      setRivalTeam(
        enrichTeamWithDex(parsed).map((member) => ({
          ...member,
          source: 'showdown' as const,
        })),
      )
      setRivalError('')
    }, 250)

    return () => window.clearTimeout(timer)
  }, [rivalShowdownText])

  function addRivalManualMember() {
    if (rivalTeam.length >= 6) {
      setRivalError('Un equipo completo tiene 6 Pokemon.')
      return
    }

    setRivalTeam((current) => [...current, createEmptyRivalMember()])
    setRivalError('')
  }

  function updateRivalMember(memberId: string, patch: Partial<TeamMember>) {
    setRivalTeam((current) =>
      current.map((member) => (member.id === memberId ? { ...member, ...patch } : member)),
    )
  }

  function updateRivalMove(memberId: string, index: number, patch: Partial<MoveSlot>) {
    setRivalTeam((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member
        }

        const nextMoves = member.moves.map((move, moveIndex) =>
          moveIndex === index ? { ...move, ...patch } : move,
        )
        return { ...member, moves: nextMoves }
      }),
    )
  }

  function handleRivalSpeciesChange(memberId: string, value: string) {
    const match = OFFICIAL_POKEMON_OPTIONS.find(
      (entry) => entry.toLowerCase() === value.trim().toLowerCase(),
    )
    updateRivalMember(memberId, {
      species: value,
      spriteUrl: null,
      types: match ? resolveSpeciesTypes(match) : [],
    })
  }

  function handleRivalMoveChange(memberId: string, index: number, value: string) {
    const match = OFFICIAL_MOVE_OPTIONS.find(
      (entry) => entry.name.toLowerCase() === value.trim().toLowerCase(),
    )
    updateRivalMove(memberId, index, {
      name: value,
      type: match ? resolveMoveType(match.name) : null,
      category: match ? resolveMoveCategory(match.name) : null,
    })
  }

  function removeRivalMember(memberId: string) {
    setRivalTeam((current) => current.filter((member) => member.id !== memberId))
  }

  function clearRivalTeam() {
    setRivalTeam([])
    setRivalShowdownText('')
    window.sessionStorage.removeItem(RIVAL_SESSION_KEY)
    setRivalError('')
  }

  function generateRandomRival() {
    if (team.length === 0) {
      setRivalError('Primero arma tu equipo en la pestaña "Constructor de equipo".')
      return
    }

    setRivalShowdownText('')
    window.sessionStorage.removeItem(RIVAL_SESSION_KEY)
    setRivalTeam(generateRandomRivalTeam(team))
    setRivalError('')
  }

  function resetBattleFlow() {
    setPhase('setup')
    setMyBan(null)
    setRivalBanId(null)
    setMySquadIds([])
    setRivalSquad(null)
    setBattleLog([])
    setBattleWinner(null)
    setBattleError('')
    setInteractiveHandle(null)
    setCurrentRequest(null)
    setPendingChoices([null, null])
    setBattleEnded(false)
    setRivalSlots([null, null])
    setRivalAliveCount(null)
  }

  function generateRivalBan() {
    const banned = pickMostThreateningMember(team, rivalTeam)
    if (!banned) {
      return
    }

    setMyBan({
      id: banned.id,
      reason: `El rival considera que ${banned.species || 'este Pokemon'} es tu mayor amenaza y lo banea.`,
    })
    setPhase('bans')
  }

  function toggleRivalBan(memberId: string) {
    setRivalBanId((current) => (current === memberId ? null : memberId))
  }

  function proceedToSquadSelection() {
    if (!myBan || !rivalBanId) {
      return
    }

    setMySquadIds([])
    setRivalSquad(null)
    setPhase('squad')
  }

  const remainingMine = useMemo(
    () => (myBan ? team.filter((member) => member.id !== myBan.id) : team),
    [team, myBan],
  )
  const remainingRival = useMemo(
    () => (rivalBanId ? rivalTeam.filter((member) => member.id !== rivalBanId) : rivalTeam),
    [rivalTeam, rivalBanId],
  )
  const squadTarget = Math.min(SQUAD_SIZE, remainingMine.length)

  function toggleSquadMember(memberId: string) {
    setMySquadIds((current) => {
      if (current.includes(memberId)) {
        return current.filter((id) => id !== memberId)
      }
      if (current.length >= squadTarget) {
        return current
      }
      return [...current, memberId]
    })
  }

  async function confirmSquadAndSimulate() {
    // El orden de seleccion define el orden de combate: los primeros elegidos salen al campo.
    const mySquad = mySquadIds
      .map((id) => remainingMine.find((member) => member.id === id))
      .filter((member): member is TeamMember => member !== undefined)
    if (mySquad.length !== squadTarget) {
      return
    }

    const chosenRivalSquad = pickBestSquadOfFour(remainingRival, mySquad)
    setRivalSquad(chosenRivalSquad)
    setPhase('result')
    setIsSimulating(true)
    setBattleError('')
    setBattleLog([])
    setBattleWinner(null)
    setBattleEnded(false)
    setRivalSlots([null, null])
    setRivalAliveCount(chosenRivalSquad.length)

    if (battleMode === 'auto') {
      try {
        const result = await runDoublesBattle(mySquad, chosenRivalSquad)
        setBattleLog(result.log)
        setBattleWinner(
          result.winnerSide === 'p1' ? 'mine' : result.winnerSide === 'p2' ? 'rival' : 'draw',
        )
      } catch (err) {
        setBattleError(
          err instanceof Error
            ? `No se pudo simular el combate: ${err.message}`
            : 'No se pudo simular el combate.',
        )
      } finally {
        setIsSimulating(false)
      }
      return
    }

    try {
      const handle = await startInteractiveBattle(mySquad, chosenRivalSquad, {
        onLog: (line) => {
          setBattleLog((current) => [...current, line])
          setRivalSlots((current) => applyRivalLogLine(line, current))

          if (/^\|faint\|p2[ab]:/.test(line)) {
            setRivalAliveCount((current) => (current === null ? current : Math.max(0, current - 1)))
          }
        },
        onRequest: (request) => {
          setCurrentRequest(request)
          setPendingChoices([null, null])
        },
        onError: (message) => setBattleError(message),
        onEnd: (winnerName) => {
          setBattleEnded(true)
          setCurrentRequest(null)
          setBattleWinner(
            winnerName === BATTLE_MY_NAME ? 'mine' : winnerName === BATTLE_RIVAL_NAME ? 'rival' : 'draw',
          )
        },
      }, BATTLE_MY_NAME, BATTLE_RIVAL_NAME)
      setInteractiveHandle(handle)
      setIsSimulating(false)
    } catch (err) {
      setBattleError(
        err instanceof Error
          ? `No se pudo iniciar el combate: ${err.message}`
          : 'No se pudo iniciar el combate.',
      )
      setIsSimulating(false)
    }
  }

  function updatePendingChoice(slotIndex: number, choice: PendingChoice | null) {
    setPendingChoices((current) => {
      const next = [...current]
      next[slotIndex] = choice
      return next
    })
  }

  function submitMoveTurn() {
    if (!currentRequest?.active || !interactiveHandle) {
      return
    }

    const choiceStrings = currentRequest.active.map((_, slotIndex) => {
      const pokemon = currentRequest.side.pokemon[slotIndex]
      if (!pokemon || pokemon.condition.endsWith('fnt')) {
        return 'pass'
      }
      return choiceToString(pendingChoices[slotIndex])
    })

    interactiveHandle.sendChoice(choiceStrings.join(', '))
    setBattleError('')
  }

  function submitForceSwitchTurn() {
    if (!currentRequest?.forceSwitch || !interactiveHandle) {
      return
    }

    const choiceStrings = currentRequest.forceSwitch.map((mustSwitch, slotIndex) => {
      if (!mustSwitch) {
        return 'pass'
      }
      return choiceToString(pendingChoices[slotIndex])
    })

    interactiveHandle.sendChoice(choiceStrings.join(', '))
    setBattleError('')
  }

  // Mismo orden que el elegido por el usuario, que es el orden en el que saldran al campo.
  const mySquadMembers = mySquadIds
    .map((id) => remainingMine.find((member) => member.id === id))
    .filter((member): member is TeamMember => member !== undefined)
  const readableBattleLog = useMemo(
    () => battleLog.map((line) => formatBattleLogLine(line)).filter((line): line is string => Boolean(line)),
    [battleLog],
  )

  return (
    <div className={styles.battleTab}>
      <section className={styles.block}>
        <h2>Mi equipo</h2>
        {team.length === 0 ? (
          <p className={styles.error}>
            Todavia no tienes Pokemon en la pestaña "Constructor de equipo".
          </p>
        ) : (
          <div className={`${styles.battleMiniGrid} my-team`}>
            {team.map((member) => (
              <MiniCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.block}>
        <h2>Equipo rival</h2>
        <div className={styles.showdownBox}>
          <button
            type="button"
            className={styles.clearShowdownBtn}
            onClick={clearRivalTeam}
            aria-label="Limpiar equipo rival"
            disabled={!rivalShowdownText.trim() && rivalTeam.length === 0}
          >
            x
          </button>
          <textarea
            className={styles.textarea}
            rows={8}
            placeholder="Pega aqui el equipo Showdown del rival"
            value={rivalShowdownText}
            onChange={(event) => setRivalShowdownText(event.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={addRivalManualMember}>
            Añadir manualmente
          </button>
          <button type="button" onClick={generateRandomRival} disabled={team.length === 0}>
            Generar equipo rival aleatorio
          </button>
        </div>
        {rivalError ? <p className={styles.error}>{rivalError}</p> : null}

        {rivalTeam.length > 0 ? (
          <div className={styles.battleRivalGrid}>
            {rivalTeam.map((member) => (
              <article key={member.id} className={styles.battleRivalCard}>
                <button
                  type="button"
                  className={styles.removeCardBtn}
                  onClick={() => removeRivalMember(member.id)}
                >
                  X
                </button>

                <div className={styles.spriteWrap}>
                  <Sprite
                    src={member.spriteUrl ?? getSpriteUrl(member.species)}
                    alt={member.species}
                    className={styles.sprite}
                  />
                </div>

                {member.source === 'showdown' ? (
                  <>
                    <h4>{member.species}</h4>
                    {/* 
                    <p>
                      <strong>Objeto:</strong> {member.item || '-'}
                    </p>
                    <p>
                      <strong>Habilidad:</strong> {member.ability || '-'}
                    </p>
                    <p>
                      <strong>Movimientos:</strong>{' '}
                      {member.moves.map((move) => move.name).filter(Boolean).join(' | ') || '-'}
                    </p> */}
                  </>
                ) : (
                  <div className={styles.battleRivalForm}>
                    <label>
                      Pokemon
                      <input
                        list="battle-pokemon-options"
                        value={member.species}
                        onChange={(event) =>
                          handleRivalSpeciesChange(member.id, event.target.value)
                        }
                        placeholder="ej. Garchomp"
                      />
                    </label>
                    <label>
                      Objeto
                      <input
                        value={member.item}
                        onChange={(event) =>
                          updateRivalMember(member.id, { item: event.target.value })
                        }
                        placeholder="libre"
                      />
                    </label>
                    <label>
                      Habilidad
                      <input
                        list="battle-ability-options"
                        value={member.ability}
                        onChange={(event) =>
                          updateRivalMember(member.id, { ability: event.target.value })
                        }
                        placeholder="ej. Lightning Rod"
                      />
                    </label>
                    <label>
                      Naturaleza
                      <input
                        value={member.nature}
                        onChange={(event) =>
                          updateRivalMember(member.id, { nature: event.target.value })
                        }
                        placeholder="libre"
                      />
                    </label>
                    {member.moves.map((move, moveIndex) => (
                      <label key={`${member.id}-move-${moveIndex}`}>
                        Move {moveIndex + 1}
                        <input
                          list="battle-move-options"
                          value={move.name}
                          onChange={(event) =>
                            handleRivalMoveChange(member.id, moveIndex, event.target.value)
                          }
                          placeholder="Nombre del ataque"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : null}

        <datalist id="battle-pokemon-options">
          {OFFICIAL_POKEMON_OPTIONS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id="battle-ability-options">
          {OFFICIAL_ABILITY_OPTIONS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id="battle-move-options">
          {OFFICIAL_MOVE_OPTIONS.map((move) => (
            <option key={move.name} value={move.name} />
          ))}
        </datalist>
      </section>

      {team.length > 0 && rivalTeam.length > 0 ? (
        <section className={styles.block}>
          <h2>Fase de baneos (VGC 2vs2)</h2>
          <p>
            El rival banea uno de tus Pokemon por amenaza y tu baneas uno del rival. Luego eliges
            4 de los 5 restantes para el combate.
          </p>

          <div className={`${styles.actions} `}>
            <button type="button" onClick={generateRivalBan} disabled={phase !== 'setup'}>
              {myBan ? 'Baneo del rival generado' : 'Generar baneo del rival'}
            </button>
            {phase !== 'setup' ? (
              <button type="button" onClick={resetBattleFlow}>
                Reiniciar baneos
              </button>
            ) : null}
          </div>

          {/* myBan ? <p className={styles.notes}>{myBan.reason}</p> : null */}

          <div className={`${styles.battleBanColumns} combat-team-pre-ban`}>
            <div>
              <h3>Tu equipo</h3>
              <div className={styles.battleMiniGrid}>
                {team.map((member) => (
                  <MiniCard
                    key={member.id}
                    member={member}
                    label={myBan?.id === member.id ? 'Baneado' : undefined}
                    faded={myBan?.id === member.id}
                    showDetails
                  />
                ))}
              </div>
            </div>

            <div>
              <h3>Equipo rival (elige tu baneo)</h3>
              <div className={styles.battleMiniGrid}>
                {rivalTeam.map((member) => (
                  <MiniCard
                    key={member.id}
                    member={member}
                    label={rivalBanId === member.id ? 'Baneado' : undefined}
                    faded={rivalBanId === member.id}
                    selected={rivalBanId === member.id}
                    onClick={
                      phase === 'setup' || phase === 'bans'
                        ? () => toggleRivalBan(member.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          {myBan && rivalBanId && phase === 'bans' ? (
            <div className={styles.actions}>
              <button type="button" onClick={proceedToSquadSelection}>
                Continuar a seleccion de equipo
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {phase === 'squad' || phase === 'result' ? (
        <section className={styles.block}>
          <h2>Elige {squadTarget} de tus {remainingMine.length} restantes</h2>

          <div className={`${styles.battleMiniGrid} my-team-ban`}>
            {remainingMine.map((member) => (
              <MiniCard
                key={member.id}
                member={member}
                selected={mySquadIds.includes(member.id)}
                onClick={phase === 'squad' ? () => toggleSquadMember(member.id) : undefined}
                showDetails
              />
            ))}
          </div>

          {phase === 'squad' ? (
            <div className={styles.actions}>
              <div className={styles.battleModeSelector}>
                <label>
                  <input
                    type="radio"
                    name="battle-mode"
                    checked={battleMode === 'auto'}
                    onChange={() => setBattleMode('auto')}
                  />
                  Simulacion automatica (IA vs IA)
                </label>
                <label>
                  <input
                    type="radio"
                    name="battle-mode"
                    checked={battleMode === 'manual'}
                    onChange={() => setBattleMode('manual')}
                  />
                  Jugar yo mismo (tu eliges, IA rival)
                </label>
              </div>
              <button
                type="button"
                onClick={confirmSquadAndSimulate}
                disabled={mySquadIds.length !== squadTarget}
              >
                Confirmar equipo y simular combate
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {phase === 'result' ? (
        <section className={styles.block}>
          <h2>Combate 2vs2</h2>

          <div className={`${styles.battleBanColumns}`}>
            <div>
              <h3>Mi equipo de combate</h3>
              <div className={`${styles.battleMiniGrid} my-team-ban-post`}>
                {mySquadMembers.map((member) => (
                  <MiniCard key={member.id} member={member} />
                ))}
              </div>
            </div>
            <div>
              <h3>Equipo rival de combate</h3>
              <div className={styles.battleMiniGrid}>
                {(rivalSquad ?? []).map((member) => (
                  <MiniCard key={member.id} member={member} />
                ))}
              </div>
            </div>
          </div>

          {isSimulating ? <p>Simulando combate...</p> : null}
          {battleError ? <p className={styles.error}>{battleError}</p> : null}

          {battleMode === 'manual' && !battleEnded ? (
            <div className={styles.battleManualControls}>
              {!currentRequest ? <p>Preparando combate...</p> : null}
              {currentRequest?.wait ? <p>Esperando al rival...</p> : null}

              {currentRequest?.forceSwitch ? (
                <>
                  <h3>Debes cambiar de Pokemon</h3>
                  <div className={styles.battleActiveColumns}>
                    {currentRequest.forceSwitch.map((mustSwitch, slotIndex) => {
                      if (!mustSwitch) {
                        return null
                      }

                      const benchOptions = currentRequest.side.pokemon
                        .map((pokemon, index) => ({ pokemon, slot: index + 1 }))
                        .filter(({ pokemon }) => !pokemon.active && !pokemon.condition.endsWith('fnt'))
                        .map(({ pokemon, slot }) => ({
                          slot,
                          label: pokemon.ident.split(': ')[1] ?? pokemon.details,
                        }))

                      const switchPokemon = currentRequest.side.pokemon[slotIndex]

                      return (
                        <ActiveSlotControls
                          key={`force-${slotIndex}`}
                          slotIndex={slotIndex}
                          pokemonName={`Posicion ${slotIndex + 1}`}
                          pokemonCondition="debe cambiar"
                          moves={[]}
                          benchOptions={benchOptions}
                          pending={pendingChoices[slotIndex]}
                          onChange={(choice) => updatePendingChoice(slotIndex, choice)}
                          member={
                            switchPokemon ? findMemberForPokemon(switchPokemon, mySquadMembers) : undefined
                          }
                          rivalSlots={rivalSlots}
                          rivalAliveCount={rivalAliveCount}
                          switchOnly
                        />
                      )
                    })}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={submitForceSwitchTurn}
                      disabled={currentRequest.forceSwitch.some(
                        (mustSwitch, slotIndex) => mustSwitch && !pendingChoices[slotIndex],
                      )}
                    >
                      Confirmar cambios
                    </button>
                  </div>
                </>
              ) : null}

              {currentRequest?.active ? (
                <>
                  <h3>Elige las acciones de tu turno</h3>
                  <div className={styles.battleActiveColumns}>
                    {currentRequest.active.map((activeData, slotIndex) => {
                      const pokemon = currentRequest.side.pokemon[slotIndex]
                      if (!pokemon || pokemon.condition.endsWith('fnt')) {
                        return (
                          <div key={`slot-${slotIndex}`} className={styles.battleSlotControls}>
                            <h4>Posicion {slotIndex + 1} (debilitado)</h4>
                          </div>
                        )
                      }

                      const benchOptions = currentRequest.side.pokemon
                        .map((member, index) => ({ member, slot: index + 1 }))
                        .filter(({ member }) => !member.active && !member.condition.endsWith('fnt'))
                        .map(({ member, slot }) => ({
                          slot,
                          label: member.ident.split(': ')[1] ?? member.details,
                        }))

                      return (
                        <ActiveSlotControls
                          key={`slot-${slotIndex}`}
                          slotIndex={slotIndex}
                          pokemonName={pokemon.ident.split(': ')[1] ?? pokemon.details}
                          pokemonCondition={pokemon.condition}
                          moves={activeData.moves}
                          canTerastallize={activeData.canTerastallize}
                          benchOptions={benchOptions}
                          pending={pendingChoices[slotIndex]}
                          onChange={(choice) => updatePendingChoice(slotIndex, choice)}
                          member={findMemberForPokemon(pokemon, mySquadMembers)}
                          rivalSlots={rivalSlots}
                          rivalAliveCount={rivalAliveCount}
                        />
                      )
                    })}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={submitMoveTurn}
                      disabled={currentRequest.active.some((activeData, slotIndex) => {
                        const pokemon = currentRequest.side.pokemon[slotIndex]
                        if (!pokemon || pokemon.condition.endsWith('fnt')) {
                          return false
                        }
                        return !isPendingChoiceComplete(pendingChoices[slotIndex], activeData.moves)
                      })}
                    >
                      Enviar turno
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {!isSimulating && battleWinner ? (
            <p
              className={`${styles.battleResult} ${
                battleWinner === 'mine' ? styles.battleResultWin : styles.battleResultLoss
              }`}
            >
              {battleWinner === 'mine'
                ? 'Ganaste el combate'
                : battleWinner === 'rival'
                  ? 'Gano el equipo rival'
                  : 'Combate sin ganador claro'}
            </p>
          ) : null}

          {battleLog.length > 0 ? (
            <div className={styles.battleLogBox}>
              {readableBattleLog.map((line, index) => (
                <div key={`log-${index}`}>{line}</div>
              ))}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button type="button" onClick={resetBattleFlow}>
              Reiniciar simulador
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
