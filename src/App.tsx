import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import './App.scss'
import { analyzeTeam } from './lib/analyzer'
import {
  POKEMON_TYPES,
  type MoveSlot,
  type PokemonType,
  type TeamMember,
} from './lib/pokemon'
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
import { parseShowdownTeam, validateShowdownTeamText } from './lib/showdownParser'
import { DEFAULT_SPRITE_CLASS, DEFAULT_SPRITE_URL, getSpriteUrl, handleSpriteImgError } from './lib/sprite'
import BattleTab from './BattleTab'

const styles = new Proxy({} as Record<string, string>, {
  get: (_, property: string | symbol) => String(property),
}) as Record<string, string>

function Sprite({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const classes = [className, src ? '' : DEFAULT_SPRITE_CLASS].filter(Boolean).join(' ')
  return (
    <img src={src ?? DEFAULT_SPRITE_URL} alt={alt} className={classes} onError={handleSpriteImgError} />
  )
}

const SHOWDOWN_SESSION_KEY = 'poke-builder-showdown-text'

function createEmptyMember(): TeamMember {
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

function getPokemonSprite(team: TeamMember[], species: string): string | null {
  const member = team.find((entry) => entry.species === species)
  return member?.spriteUrl ?? getSpriteUrl(species)
}

type TypeTooltipPlacement = 'top' | 'bottom'

type TypeTooltipState = {
  rowIndex: number
  type: PokemonType
  left: number
  top: number
  placement: TypeTooltipPlacement
}

function App() {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [showdownText, setShowdownText] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    return window.sessionStorage.getItem(SHOWDOWN_SESSION_KEY) ?? ''
  })
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'builder' | 'battle'>('builder')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [activeTypeTooltip, setActiveTypeTooltip] = useState<TypeTooltipState | null>(null)
  const [expandedSynergyPokemon, setExpandedSynergyPokemon] = useState<string[]>([])
  const [pokemonSearches, setPokemonSearches] = useState<Record<string, string>>({})
  const [abilitySearches, setAbilitySearches] = useState<Record<string, string>>({})
  const [moveSearches, setMoveSearches] = useState<Record<string, string>>({})

  const analysis = useMemo(() => analyzeTeam(team), [team])
  const editingMember = useMemo(
    () => team.find((member) => member.id === editingMemberId) ?? null,
    [editingMemberId, team],
  )

  useLayoutEffect(() => {
    if (!activeTypeTooltip) {
      return
    }

    const measurePlacement = () => {
      const wrapper = document.querySelector<HTMLElement>(
        `[data-type-tooltip-id="${activeTypeTooltip.rowIndex}-${activeTypeTooltip.type}"]`,
      )
      if (!wrapper) {
        return
      }

      const wrapperRect = wrapper.getBoundingClientRect()
      const estimatedHeight = 130
      const spaceAbove = wrapperRect.top
      const spaceBelow = window.innerHeight - wrapperRect.bottom
      const placement: TypeTooltipPlacement =
        spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top'
      const nextLeft = wrapperRect.left + wrapperRect.width / 2
      const nextTop =
        placement === 'bottom'
          ? wrapperRect.bottom + 10
          : wrapperRect.top - estimatedHeight - 10

      setActiveTypeTooltip((current) =>
        current &&
        current.left === nextLeft &&
        current.top === nextTop &&
        current.placement === placement
          ? current
          : current
            ? {
                ...current,
                left: nextLeft,
                top: nextTop,
                placement,
              }
            : current,
      )
    }

    measurePlacement()

    const handleResize = () => measurePlacement()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [activeTypeTooltip])

  const activeTypeTooltipDetail = useMemo(() => {
    if (!activeTypeTooltip) {
      return null
    }

    const row = analysis.synergyPairs[activeTypeTooltip.rowIndex]
    if (!row) {
      return null
    }

    return row.superEffectiveDetails.find((entry) => entry.type === activeTypeTooltip.type) ?? null
  }, [activeTypeTooltip, analysis.synergyPairs])

  const synergyByPokemon = useMemo(() => {
    const pairsWithIndex = analysis.synergyPairs.map((pair, pairIndex) => ({
      ...pair,
      pairIndex,
    }))

    return team.map((member, index) => {
      const pokemon = member.species || `Slot ${index + 1}`
      const pairs = pairsWithIndex
        .filter((pair) => pair.pair.includes(pokemon))
        .map((pair) => ({
          ...pair,
          partner: pair.pair[0] === pokemon ? pair.pair[1] : pair.pair[0],
        }))

      return { pokemon, pairs }
    })
  }, [analysis.synergyPairs, team])

  useEffect(() => {
    const available = new Set(synergyByPokemon.map((entry) => entry.pokemon))
    setExpandedSynergyPokemon((current) => current.filter((name) => available.has(name)))
  }, [synergyByPokemon])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = showdownText.trim()
      if (!trimmed) {
        window.sessionStorage.removeItem(SHOWDOWN_SESSION_KEY)
        setTeam([])
        setError('')
        return
      }

      window.sessionStorage.setItem(SHOWDOWN_SESSION_KEY, showdownText)

      if (!validateShowdownTeamText(trimmed)) {
        setTeam([])
        setError('Formato invalido de Showdown.')
        return
      }

      const parsed = parseShowdownTeam(trimmed)
      setTeam(
        enrichTeamWithDex(parsed).map((member) => ({
          ...member,
          source: 'showdown' as const,
        })),
      )
      setError('')
    }, 250)

    return () => window.clearTimeout(timer)
  }, [showdownText])

  useEffect(() => {
    if (!editingMemberId) {
      return
    }

    const stillExists = team.some((member) => member.id === editingMemberId)
    if (!stillExists) {
      setEditingMemberId(null)
    }
  }, [editingMemberId, team])

  function addManualMember() {
    if (team.length >= 6) {
      setError('Un equipo completo tiene 6 Pokemon.')
      return
    }

    setTeam((current) => [...current, createEmptyMember()])
    setError('')
  }

  function clearTeam() {
    setTeam([])
    setShowdownText('')
    window.sessionStorage.removeItem(SHOWDOWN_SESSION_KEY)
    setError('')
  }

  function updateMember(memberId: string, patch: Partial<TeamMember>) {
    setTeam((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              ...patch,
            }
          : member,
      ),
    )
  }

  function updateTypes(memberId: string, slot: 0 | 1, value: string) {
    const parsed = (value || null) as PokemonType | null
    setTeam((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member
        }

        const next = [...member.types]
        if (parsed) {
          next[slot] = parsed
        } else {
          next[slot] = undefined as unknown as PokemonType
        }

        const compact = next.filter((type): type is PokemonType => Boolean(type))
        const unique = [...new Set(compact)]
        return {
          ...member,
          types: unique,
        }
      }),
    )
  }

  function updateMove(memberId: string, index: number, patch: Partial<MoveSlot>) {
    const autoType =
      patch.name !== undefined && patch.type == null ? resolveMoveType(patch.name) : undefined
    const autoCategory =
      patch.name !== undefined && patch.category == null
        ? resolveMoveCategory(patch.name)
        : undefined

    setTeam((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member
        }

        const nextMoves = member.moves.map((move, moveIndex) =>
          moveIndex === index
            ? {
                ...move,
                ...patch,
                type:
                  patch.type !== undefined
                    ? patch.type
                    : autoType !== undefined
                      ? autoType
                      : move.type,
                category:
                  patch.category !== undefined
                    ? patch.category
                    : autoCategory !== undefined
                      ? autoCategory
                      : move.category,
              }
            : move,
        )

        return {
          ...member,
          moves: nextMoves,
        }
      }),
    )
  }

  function removeMember(memberId: string) {
    setTeam((current) => current.filter((member) => member.id !== memberId))
  }

  function toggleSynergyPokemon(pokemon: string) {
    setExpandedSynergyPokemon((current) =>
      current.includes(pokemon)
        ? current.filter((name) => name !== pokemon)
        : [...current, pokemon],
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <h1>Poke Randomlocke Builder</h1>
      </section>

      <nav className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'builder' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          Constructor de equipo
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'battle' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('battle')}
        >
          Simulador de combate
        </button>
      </nav>

      {activeTab === 'battle' ? (
        <BattleTab team={team} />
      ) : (
        <>
      <section className={styles.block}>
        <h2>Importar texto Showdown</h2>
        <div className={styles.showdownBox}>
          <button
            type="button"
            className={styles.clearShowdownBtn}
            onClick={clearTeam}
            aria-label="Limpiar texto Showdown"
            disabled={!showdownText.trim()}
          >
            x
          </button>
          <textarea
            className={styles.textarea}
            rows={10}
            placeholder="Pega aqui tu equipo de Showdown"
            value={showdownText}
            onChange={(event) => setShowdownText(event.target.value)}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={addManualMember}>
            Añadir manualmente
          </button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>

      {team.length === 0 ? null : (
        <>
          <section className={styles.block}>
            <h2>Equipo actual ({team.length}/6)</h2>
            <div className={styles.teamCards}>
              {team.map((member, memberIndex) => (
                <article
                  key={member.id}
                  className={styles.memberCardCompact}
                  onClick={() => setEditingMemberId(member.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setEditingMemberId(member.id)
                    }
                  }}
                >
                  <button
                    type="button"
                    className={styles.removeCardBtn}
                    onClick={(event) => {
                      event.stopPropagation()
                      removeMember(member.id)
                    }}
                  >
                    X
                  </button>

                  <div className={styles.spriteWrap}>
                    <Sprite
                      src={member.spriteUrl ?? getSpriteUrl(member.species)}
                      alt={member.species || `Pokemon ${memberIndex + 1}`}
                      className={styles.sprite}
                    />
                  </div>

                  <h3>{member.species || `Slot ${memberIndex + 1}`}</h3>
                  <p className={styles.typeLine}>
                    {member.types.length > 0 ? (
                      member.types.map((type, index) => (
                        <span key={`${member.id}-type-${type}`} className={styles.typeText}>
                          {index > 0 ? ' / ' : ''}
                          {type}
                        </span>
                      ))
                    ) : (
                      'Sin tipos cargados'
                    )}
                  </p>
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
                    <strong>Moves:</strong>{' '}
                    {member.moves
                      .map((move) => move.name)
                      .filter(Boolean)
                      .join(' | ') || '-'}
                  </p>
                </article>
              ))}

              {team.length < 6 ? (
                <button
                  type="button"
                  className={styles.addTeamCard}
                  onClick={addManualMember}
                  aria-label="Añadir Pokémon manualmente"
                >
                  <span className={styles.addTeamCardPlus}>+</span>
                </button>
              ) : null}
            </div>
          </section>

          {editingMember ? (
            <div
              className={styles.modalOverlay}
              onClick={() => setEditingMemberId(null)}
              role="presentation"
            >
              <section
                className={styles.modalCard}
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <h3>Editar {editingMember.species || 'Pokemon'}</h3>
                  <button type="button" onClick={() => setEditingMemberId(null)}>
                    Cerrar
                  </button>
                </div>

                <div className={styles.memberCard}>
                  <label>
                    Pokemon
                    <div className={styles.moveInputWrap}>
                      <input
                        className={styles.moveNameInput}
                        value={
                          pokemonSearches[editingMember.id] !== undefined
                            ? pokemonSearches[editingMember.id]
                            : editingMember.species
                        }
                        readOnly={editingMember.source === 'showdown'}
                        onFocus={() => {
                          if (editingMember.source === 'showdown') {
                            return
                          }

                          setPokemonSearches((current) => ({
                            ...current,
                            [editingMember.id]: editingMember.species,
                          }))
                        }}
                        onBlur={() => {
                          if (editingMember.source === 'showdown') {
                            return
                          }

                          setPokemonSearches((current) => {
                            const next = { ...current }
                            delete next[editingMember.id]
                            return next
                          })
                        }}
                        onChange={(event) => {
                          if (editingMember.source !== 'manual') {
                            return
                          }

                          const nextValue = event.target.value
                          setPokemonSearches((current) => ({
                            ...current,
                            [editingMember.id]: nextValue,
                          }))

                          const matchingPokemon = OFFICIAL_POKEMON_OPTIONS.find(
                            (entry) =>
                              entry.toLowerCase() === nextValue.trim().toLowerCase(),
                          )

                          if (!nextValue.trim()) {
                            updateMember(editingMember.id, {
                              species: '',
                              spriteUrl: null,
                              types: [],
                            })
                            return
                          }

                          if (matchingPokemon) {
                            updateMember(editingMember.id, {
                              species: matchingPokemon,
                              spriteUrl: null,
                              types: resolveSpeciesTypes(matchingPokemon),
                            })
                          }
                        }}
                        placeholder="ej. Garchomp"
                      />
                      {pokemonSearches[editingMember.id] &&
                        pokemonSearches[editingMember.id].trim() && (
                          <div className={styles.moveSuggestionList}>
                            {OFFICIAL_POKEMON_OPTIONS.filter((entry) =>
                              entry.toLowerCase().includes(
                                pokemonSearches[editingMember.id].trim().toLowerCase(),
                              ),
                            ).slice(0, 20).length > 0 ? (
                              OFFICIAL_POKEMON_OPTIONS.filter((entry) =>
                                entry.toLowerCase().includes(
                                  pokemonSearches[editingMember.id].trim().toLowerCase(),
                                ),
                              )
                                .slice(0, 20)
                                .map((entry) => (
                                  <button
                                    key={`pokemon-${editingMember.id}-${entry}`}
                                    type="button"
                                    className={styles.moveSuggestion}
                                    onMouseDown={(event) => {
                                      event.preventDefault()
                                      setPokemonSearches((current) => {
                                        const next = { ...current }
                                        delete next[editingMember.id]
                                        return next
                                      })
                                      updateMember(editingMember.id, {
                                        species: entry,
                                        spriteUrl: null,
                                        types: resolveSpeciesTypes(entry),
                                      })
                                    }}
                                  >
                                    {entry}
                                  </button>
                                ))
                            ) : (
                              <div className={styles.moveSuggestionEmpty}>No hay resultados</div>
                            )}
                          </div>
                        )}
                    </div>
                  </label>

                  <div className={styles.twoCols}>
                    <label>
                      Tipo 1
                      <select
                        value={editingMember.types[0] ?? ''}
                        disabled={editingMember.source === 'showdown'}
                        onChange={(event) =>
                          updateTypes(editingMember.id, 0, event.target.value)
                        }
                      >
                        <option value="">-</option>
                        {POKEMON_TYPES.map((type) => (
                          <option key={`t1-${editingMember.id}-${type}`} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Tipo 2
                      <select
                        value={editingMember.types[1] ?? ''}
                        disabled={editingMember.source === 'showdown'}
                        onChange={(event) =>
                          updateTypes(editingMember.id, 1, event.target.value)
                        }
                      >
                        <option value="">-</option>
                        {POKEMON_TYPES.map((type) => (
                          <option key={`t2-${editingMember.id}-${type}`} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.twoCols}>
                    <label>
                      Objeto
                      <input
                        value={editingMember.item}
                        readOnly={editingMember.source === 'showdown'}
                        onChange={(event) => {
                          if (editingMember.source !== 'manual') {
                            return
                          }

                          updateMember(editingMember.id, { item: event.target.value })
                        }}
                        placeholder="libre"
                      />
                    </label>
                    <label>
                      Habilidad
                      <div className={styles.moveInputWrap}>
                        <input
                          value={abilitySearches[editingMember.id] ?? editingMember.ability}
                          readOnly={editingMember.source === 'showdown'}
                          onFocus={() => {
                            if (editingMember.source !== 'manual') {
                              return
                            }

                            if (!(editingMember.id in abilitySearches)) {
                              setAbilitySearches((current) => ({
                                ...current,
                                [editingMember.id]: editingMember.ability,
                              }))
                            }
                          }}
                          onChange={(event) => {
                            if (editingMember.source !== 'manual') {
                              return
                            }

                            const nextValue = event.target.value
                            setAbilitySearches((current) => ({
                              ...current,
                              [editingMember.id]: nextValue,
                            }))
                            updateMember(editingMember.id, { ability: nextValue })
                          }}
                          placeholder="ej. Lightning Rod"
                        />
                        {editingMember.source === 'manual' &&
                          abilitySearches[editingMember.id] !== undefined && (
                            <div className={styles.moveSuggestionList}>
                              {OFFICIAL_ABILITY_OPTIONS.filter((entry) =>
                                entry.toLowerCase().includes(
                                  (abilitySearches[editingMember.id] ?? '').trim().toLowerCase(),
                                ),
                              ).slice(0, 20).length > 0 ? (
                                OFFICIAL_ABILITY_OPTIONS.filter((entry) =>
                                  entry.toLowerCase().includes(
                                    (abilitySearches[editingMember.id] ?? '').trim().toLowerCase(),
                                  ),
                                )
                                  .slice(0, 20)
                                  .map((entry) => (
                                    <button
                                      key={`ability-${editingMember.id}-${entry}`}
                                      type="button"
                                      className={styles.moveSuggestion}
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                        setAbilitySearches((current) => {
                                          const next = { ...current }
                                          delete next[editingMember.id]
                                          return next
                                        })
                                        updateMember(editingMember.id, { ability: entry })
                                      }}
                                    >
                                      {entry}
                                    </button>
                                  ))
                              ) : (
                                <div className={styles.moveSuggestionEmpty}>No hay resultados</div>
                              )}
                            </div>
                          )}
                      </div>
                    </label>
                  </div>

                  <label>
                    Naturaleza
                    <input
                      value={editingMember.nature}
                      readOnly={editingMember.source === 'showdown'}
                      onChange={(event) => {
                        if (editingMember.source !== 'manual') {
                          return
                        }

                        updateMember(editingMember.id, { nature: event.target.value })
                      }}
                      placeholder="libre"
                    />
                  </label>

                  <div className={styles.moves}>
                    {editingMember.moves.map((move, moveIndex) => {
                      const moveKey = `${editingMember.id}-${moveIndex}`
                      const resolvedMoveType = move.type ?? resolveMoveType(move.name) ?? null
                      const rawSearchText = moveSearches[moveKey]
                      const isEditing = rawSearchText !== undefined
                      const searchText = rawSearchText ?? ''
                      const displayedMoveName = isEditing ? searchText : move.name
                      const filteredMoves = OFFICIAL_MOVE_OPTIONS.filter((entry) =>
                        entry.name.toLowerCase().includes(searchText.trim().toLowerCase()),
                      ).slice(0, 20)

                      return (
                        <div
                          key={`${editingMember.id}-move-${moveIndex}`}
                          className={styles.twoCols}
                        >
                          <label>
                            Move {moveIndex + 1}
                            <div className={styles.moveInputWrap}>
                              <input
                                className={styles.moveNameInput}
                                value={displayedMoveName}
                                onFocus={() => {
                                  if (!isEditing) {
                                    setMoveSearches((current) => ({
                                      ...current,
                                      [moveKey]: '',
                                    }))
                                  }
                                }}
                                onBlur={() => {
                                  if (searchText.trim() === '') {
                                    setMoveSearches((current) => {
                                      const next = { ...current }
                                      delete next[moveKey]
                                      return next
                                    })
                                  }
                                }}
                                onChange={(event) => {
                                  const nextValue = event.target.value
                                  setMoveSearches((current) => ({
                                    ...current,
                                    [moveKey]: nextValue,
                                  }))

                                  if (!nextValue.trim()) {
                                    updateMove(editingMember.id, moveIndex, {
                                      name: '',
                                      type: null,
                                      category: null,
                                    })
                                    return
                                  }

                                  const matchingMove = OFFICIAL_MOVE_OPTIONS.find(
                                    (entry) =>
                                      entry.name.toLowerCase() === nextValue.trim().toLowerCase(),
                                  )

                                  if (matchingMove) {
                                    const nextType = resolveMoveType(matchingMove.name)
                                    const nextCategory = resolveMoveCategory(matchingMove.name)

                                    setMoveSearches((current) => {
                                      const next = { ...current }
                                      delete next[moveKey]
                                      return next
                                    })

                                    updateMove(editingMember.id, moveIndex, {
                                      name: matchingMove.name,
                                      type: nextType ?? null,
                                      category: nextCategory ?? null,
                                    })
                                  }
                                }}
                                placeholder="Filtrar ataques..."
                              />
                              {searchText.trim() ? (
                                <div className={styles.moveSuggestionList}>
                                  {filteredMoves.length > 0 ? (
                                    filteredMoves.map((entry) => (
                                      <button
                                        key={`${moveKey}-${entry.name}`}
                                        type="button"
                                        className={styles.moveSuggestion}
                                        onMouseDown={(event) => {
                                          event.preventDefault()
                                          const nextType = resolveMoveType(entry.name)
                                          const nextCategory = resolveMoveCategory(entry.name)

                                          setMoveSearches((current) => {
                                            const next = { ...current }
                                            delete next[moveKey]
                                            return next
                                          })

                                          updateMove(editingMember.id, moveIndex, {
                                            name: entry.name,
                                            type: nextType ?? move.type ?? null,
                                            category: nextCategory ?? move.category ?? null,
                                          })
                                        }}
                                      >
                                        {entry.name}
                                      </button>
                                    ))
                                  ) : (
                                    <div className={styles.moveSuggestionEmpty}>
                                      No hay resultados
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </label>
                          <label>
                            Tipo
                            <input
                              className={styles.moveTypeDisplay}
                              value={resolvedMoveType ?? 'auto'}
                              readOnly
                              placeholder="auto"
                              onFocus={(event) => event.currentTarget.blur()}
                            />
                          </label>
                        </div>
                      )
                    })}
                  </div>

                  <div className={styles.modalActions}>
                    <button
                      type="button"
                      onClick={() => {
                        removeMember(editingMember.id)
                        setEditingMemberId(null)
                      }}
                    >
                      Eliminar Pokemon
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          <section className={styles.block}>
            <h2>Analisis de fortalezas y debilidades</h2>
            {analysis.notes.length > 0 ? (
              <ul className={styles.notes}>
                {analysis.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}

            {/* <div className={styles.summary}>
              <div>
                <h3>Debilidades</h3>
                <ul className={styles.summaryTypeList}>
                  {analysis.biggestWeaknesses.map((entry) => (
                    <li key={`weak-${entry.type}`}>
                      <strong>
                        {entry.type}: {entry.count}
                      </strong>
                      <div className={styles.pokemonChipList}>
                        {analysis.defensiveByType
                          .find((row) => row.type === entry.type)
                          ?.weakMembers.map((species) => (
                            <span key={`weak-chip-${entry.type}-${species}`} className={styles.pokemonChip}>
                              {getPokemonSprite(team, species) ? (
                                <img
                                  src={getPokemonSprite(team, species) ?? ''}
                                  alt={species}
                                  className={styles.pokemonChipSprite}
                                />
                              ) : (
                                <span className={styles.pokemonChipPlaceholder}>?</span>
                              )}
                              <span>{species}</span>
                            </span>
                          ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Resistencias</h3>
                <ul className={styles.summaryTypeList}>
                  {analysis.strongestResists.map((entry) => (
                    <li key={`res-${entry.type}`}>
                      <strong>
                        {entry.type}: {entry.count}
                      </strong>
                      <div className={styles.pokemonChipList}>
                        {analysis.defensiveByType
                          .find((row) => row.type === entry.type)
                          ?.resistMembers.concat(
                            analysis.defensiveByType
                              .find((row) => row.type === entry.type)
                              ?.immuneMembers ?? [],
                          )
                          .map((species) => (
                            <span key={`res-chip-${entry.type}-${species}`} className={styles.pokemonChip}>
                              {getPokemonSprite(team, species) ? (
                                <img
                                  src={getPokemonSprite(team, species) ?? ''}
                                  alt={species}
                                  className={styles.pokemonChipSprite}
                                />
                              ) : (
                                <span className={styles.pokemonChipPlaceholder}>?</span>
                              )}
                              <span>{species}</span>
                            </span>
                          ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Inmunes</h3>
                <ul className={styles.summaryTypeList}>
                  {immuneSummary.length > 0 ? (
                    immuneSummary.map((entry) => (
                      <li key={`immune-${entry.type}`}>
                        <strong>
                          {entry.type}: {entry.count}
                        </strong>
                        <div className={styles.pokemonChipList}>
                          {entry.members.map((species) => (
                            <span key={`immune-chip-${entry.type}-${species}`} className={styles.pokemonChip}>
                              {getPokemonSprite(team, species) ? (
                                <img
                                  src={getPokemonSprite(team, species) ?? ''}
                                  alt={species}
                                  className={styles.pokemonChipSprite}
                                />
                              ) : (
                                <span className={styles.pokemonChipPlaceholder}>?</span>
                              )}
                              <span>{species}</span>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))
                  ) : (
                    <li>
                      <strong>-</strong>
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <h3>Tipos sin cobertura supereficaz</h3>
                <p>{analysis.uncoveredTypes.join(', ') || '-'}</p>
                <h3>Tipos cubiertos supereficaz</h3>
                <p>{analysis.coveredTypes.join(', ') || '-'}</p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <h3>Super debilidades</h3>
              <div className={styles.dataTable}>
                <div className={styles.dataHeaderRow}>
                  <div>Tipo de ataque</div>
                  <div>Detalle (x4 y arriba)</div>
                </div>

                {superWeaknesses.length > 0 ? (
                  superWeaknesses.map((row) => (
                    <div key={`super-weak-${row.type}`} className={styles.dataRow}>
                      <div className={styles.dataLabel}>{row.type}</div>

                      <div className={styles.dataValue}>
                        {row.members.length > 0 ? (
                          <div className={styles.pokemonChipList}>
                            {row.members.map((species) => {
                              const spriteUrl = getPokemonSprite(team, species)
                              return (
                                <span key={`super-weak-${row.type}-${species}`} className={styles.pokemonChip}>
                                  {spriteUrl ? (
                                    <img
                                      src={spriteUrl}
                                      alt={species}
                                      className={styles.pokemonChipSprite}
                                    />
                                  ) : (
                                    <span className={styles.pokemonChipPlaceholder}>?</span>
                                  )}
                                  <span>{species}</span>
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.dataRow}>
                    <div className={styles.dataLabel}>-</div>
                    <div className={styles.dataValue}>No hay super debilidades activas.</div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.recommendations}>
              <h3>Recomendaciones automaticas</h3>
              <ul>
                {analysis.recommendations.length > 0 ? (
                  analysis.recommendations.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li>No hay recomendaciones.</li>
                )}
              </ul>
            </div>

            <div className={styles.recommendations}>
              <h3>Reglas de objeto aplicadas</h3>
              {analysis.itemRuleNotes.length > 0 ? (
                <ul>
                  {analysis.itemRuleNotes.map((entry) => (
                    <li key={`item-rule-${entry.pokemon}`}>
                      <strong>{entry.pokemon}:</strong> {entry.rules.join(' | ')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay reglas de objeto especiales activas en el equipo actual.</p>
              )}
            </div>*/}

            <div className={styles.tableWrap}>
              <h3>Defensa por tipo</h3>
              <div className={styles.dataTable}>
                <div className={styles.dataHeaderRow}>
                  <div>Tipo ataque recibido</div>
                  <div>Detalle (debil / resiste / inmune)</div>
                </div>

                {analysis.defensiveByType.map((row) => (
                  <div key={row.type} className={styles.dataRow}>
                    <div className={styles.dataLabel}>{row.type}</div>

                    <div className={styles.dataValue}>
                      <div className={styles.detailRow}>
                        <strong>x4:</strong>
                        {row.x4Members.length > 0 ? (
                          <div className={styles.pokemonChipList}>
                            {row.x4Members.map((species) => {
                              const spriteUrl = getPokemonSprite(team, species)
                              return (
                                <span key={`def-x4-${row.type}-${species}`} className={styles.pokemonChip}>
                                  <Sprite src={spriteUrl} alt={species} className={styles.pokemonChipSprite} />
                                  <span>{species}</span>
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </div>

                      <div className={styles.detailRow}>
                        <strong>Debiles:</strong>
                        {row.weakMembers.length > 0 ? (
                          <div className={styles.pokemonChipList}>
                            {row.weakMembers.map((species) => {
                              const spriteUrl = getPokemonSprite(team, species)
                              return (
                                <span key={`def-weak-${row.type}-${species}`} className={styles.pokemonChip}>
                                  <Sprite src={spriteUrl} alt={species} className={styles.pokemonChipSprite} />
                                  <span>{species}</span>
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </div>

                      <div className={styles.detailRow}>
                        <strong>Resisten:</strong>
                        {row.resistMembers.length > 0 ? (
                          <div className={styles.pokemonChipList}>
                            {row.resistMembers.map((species) => {
                              const spriteUrl = getPokemonSprite(team, species)
                              return (
                                <span key={`def-res-${row.type}-${species}`} className={styles.pokemonChip}>
                                  <Sprite src={spriteUrl} alt={species} className={styles.pokemonChipSprite} />
                                  <span>{species}</span>
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </div>

                      <div className={styles.detailRow}>
                        <strong>Inmunes:</strong>
                        {row.immuneMembers.length > 0 ? (
                          <div className={styles.pokemonChipList}>
                            {row.immuneMembers.map((species) => {
                              const spriteUrl = getPokemonSprite(team, species)
                              return (
                                <span key={`def-imm-${row.type}-${species}`} className={styles.pokemonChip}>
                                  <Sprite src={spriteUrl} alt={species} className={styles.pokemonChipSprite} />
                                  <span>{species}</span>
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.tableWrap}>
              <h3>Eficacia por tipo de ataque</h3>

              <div className={`${styles.dataTable} ${styles.dataTableOffense}`}>
                <div className={styles.dataHeaderRow}>
                  <div>Tipo defensor</div>
                  <div>Mejor multiplicador</div>
                  <div>Pokemon que lo logran (ataques)</div>
                </div>

                {analysis.offensiveByTargetType.map((row) => (
                  <div key={`atk-${row.targetType}`} className={styles.dataRow}>
                    <div className={styles.dataLabel}>{row.targetType}</div>
                    <div className={styles.dataValue}>{row.bestMultiplier.toFixed(2)}x</div>
                    <div className={styles.dataValue}>
                      {row.sources.length > 0 ? (
                        <div className={styles.offenseSourceList}>
                          {row.sources.map((source) => (
                            <p key={`${row.targetType}-${source.pokemon}`}>
                              <strong>{source.pokemon}</strong>{' '}
                              (
                              {source.moves.map((move, moveIndex) => (
                                <span
                                  key={`${row.targetType}-${source.pokemon}-${move.name}-${moveIndex}`}
                                >
                                  {move.isStab ? (
                                    <span className={styles.stabMoveWrap}>
                                      <strong className={styles.stabMove}>{move.name}</strong>
                                      <span className={styles.stabTooltip} role="tooltip">
                                        STAB
                                      </span>
                                    </span>
                                  ) : (
                                    move.name
                                  )}
                                  {moveIndex < source.moves.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                              )
                            </p>
                          ))}
                        </div>
                      ) : (
                        '-'
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.synergyWrap}>
              <h3>Sinergias por pareja</h3>
              {synergyByPokemon.length > 0 ? (
                <div className={styles.synergyAccordion}>
                  {synergyByPokemon.map((entry) => {
                    const isOpen = expandedSynergyPokemon.includes(entry.pokemon)
                    const spriteUrl = getPokemonSprite(team, entry.pokemon)

                    return (
                      <div key={`synergy-${entry.pokemon}`} className={styles.synergyGroup}>
                        <button
                          type="button"
                          className={styles.synergyToggle}
                          onClick={() => toggleSynergyPokemon(entry.pokemon)}
                        >
                          <span className={`${styles.synergyArrow} ${isOpen ? styles.synergyArrowOpen : ''}`}>
                            ▸
                          </span>
                          <span className={styles.pokemonChip}>
                            <Sprite src={spriteUrl} alt={entry.pokemon} className={styles.pokemonChipSprite} />
                            <span>{entry.pokemon}</span>
                          </span>
                        </button>

                        {isOpen ? (
                          <div className={styles.synergyGroupBody}>
                            {entry.pairs.length > 0 ? (
                              entry.pairs.map((row) => (
                                <div
                                  key={`${entry.pokemon}-${row.partner}-${row.pairIndex}`}
                                  className={styles.synergyPairRow}
                                >
                                  <div>
                                    <strong>Pareja:</strong>{' '}
                                    <span className={styles.pokemonChip}>
                                      <Sprite
                                        src={getPokemonSprite(team, row.partner)}
                                        alt={row.partner}
                                        className={styles.pokemonChipSprite}
                                      />
                                      <span>{row.partner}</span>
                                    </span>
                                  </div>

                                  <div>
                                    <strong>Debilidades:</strong>{' '}
                                    {row.sharedWeaknessTypes.length > 0 ? (
                                      <div className={styles.typeChipList}>
                                        {row.sharedWeaknessTypes.map((type) => (
                                          <span
                                            key={`${entry.pokemon}-${row.pairIndex}-shared-${type}`}
                                            className={styles.typeChip}
                                          >
                                            {type}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      '-'
                                    )}
                                  </div>

                                  <div>
                                    <strong>Tipos supereficaces:</strong>{' '}
                                    {row.superEffectiveTypes.length > 0 ? (
                                      <div className={styles.typeChipList}>
                                        {row.superEffectiveTypes.map((type) => (
                                          <span
                                            key={`${entry.pokemon}-${row.pairIndex}-off-${type}`}
                                            className={styles.typeChipTooltipWrap}
                                            tabIndex={0}
                                            data-type-tooltip-id={`${row.pairIndex}-${type}`}
                                            onMouseEnter={(event) => {
                                              const wrapperRect = event.currentTarget.getBoundingClientRect()
                                              setActiveTypeTooltip({
                                                rowIndex: row.pairIndex,
                                                type,
                                                left: wrapperRect.left + wrapperRect.width / 2,
                                                top: wrapperRect.bottom + 10,
                                                placement: 'bottom',
                                              })
                                            }}
                                            onMouseLeave={() => setActiveTypeTooltip(null)}
                                            onFocus={(event) => {
                                              const wrapperRect = event.currentTarget.getBoundingClientRect()
                                              setActiveTypeTooltip({
                                                rowIndex: row.pairIndex,
                                                type,
                                                left: wrapperRect.left + wrapperRect.width / 2,
                                                top: wrapperRect.bottom + 10,
                                                placement: 'bottom',
                                              })
                                            }}
                                            onBlur={() => setActiveTypeTooltip(null)}
                                          >
                                            <span className={styles.typeChip}>{type}</span>
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      '-'
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className={styles.synergyEmpty}>
                                Este Pokemon no tiene parejas disponibles todavia.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className={styles.synergyEmpty}>Necesitas al menos 2 Pokemon para analizar sinergias.</p>
              )}
            </div>
          </section>
        </>
      )}

      {activeTypeTooltip && activeTypeTooltipDetail ? (
        <div
          className={`${styles.typeTooltip} ${styles.typeTooltipVisible} ${
            activeTypeTooltip.placement === 'top'
              ? styles.typeTooltipTop
              : styles.typeTooltipBottom
          }`}
          role="tooltip"
          style={{
            position: 'fixed',
            left: `${activeTypeTooltip.left}px`,
            top: `${activeTypeTooltip.top}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className={styles.typeTooltipGrid}>
            {activeTypeTooltipDetail.sources.map((source) => (
              <div key={`${activeTypeTooltip.rowIndex}-${activeTypeTooltip.type}-${source.pokemon}`}>
                <strong>{source.pokemon}</strong>
                <div className={styles.typeTooltipMoveList}>
                  {source.moves.length > 0 ? (
                    source.moves.map((move) => (
                      <span
                        key={`${activeTypeTooltip.rowIndex}-${activeTypeTooltip.type}-${source.pokemon}-${move.name}`}
                      >
                        {move.isStab ? <strong>{move.name}</strong> : move.name}
                      </span>
                    ))
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
        </>
      )}
    </main>
  )
}

export default App
