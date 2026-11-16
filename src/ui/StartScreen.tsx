import { useState } from 'react'
import { openOnlineMenu } from '../multiplayer/session'
import { FACTION_STYLE, tokenImageFor } from '../assets/manifest'
import { FACTION_NAME } from '../game/data/datasheets'
import { armyPoints, fmtPoints, POINTS_SOURCE, unitCost } from '../game/data/points'
import { deserialize, readStorage } from '../game/persistence'
import { SCENARIOS, takesLists } from '../game/scenarios/scenarios'
import { PRIMARY, PRIMARY_IDS } from '../game/rules/missions'
import { FIXED_IDS, SECONDARY } from '../game/rules/secondaries'
import { FACTIONS, type PlayerId, type SecondaryId, type UnitState } from '../game/types'
import { AUTOSAVE_KEY, MANUAL_KEY, useStore, type Settings } from '../store'
import { LAYOUT_IDS, LAYOUT_NAME, MAP_IDS, MAPS, PATROL_LAYOUT_NAME } from '../game/scenarios/strikeForce'
import { armyUnits, battleListProblems } from './armyUnits'
import { ArmyBuilder } from './ArmyBuilder'
import { LegalDialog } from './LegalDialog'
import { LEARNING_STYLE, learningStyleOf, type LearningStyle } from './help'
import { LOCALES, LOCALE_NAMES, locale, setLocale, tr, type Locale } from '../i18n/index'

/** A name with the official English one beside it; English shows the name alone. */
const withEn = ({ name, nameEn }: { name: string; nameEn: string }) => (name === nameEn ? name : `${name} (${nameEn})`)

/** Lists the army of `faction`: unit, model count and cost (its army list, or the scenario's training roster). */
function ArmyList({ faction, army }: { faction: PlayerId; army: UnitState[] }) {
  const total = army.reduce((n, u) => n + u.models.length, 0)
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-stone-300" aria-label={tr('Roster: {item}', { item: FACTION_NAME[faction] })}>
      {army.map((u) => {
        const cost = unitCost(army, u)
        return (
          <li key={u.id}>
            {u.name} <span className="text-stone-400">× {u.models.length}</span>{' '}
            <span className="text-stone-500" title={cost.exact ? undefined : tr('This unit size is not in the Munitorum Field Manual — the cost was recalculated per model')}>
              · {fmtPoints(cost)}
            </span>
          </li>
        )
      })}
      <li className="text-stone-400">{tr('Total models: {total}', { total })}</li>
      <li className="font-semibold text-amber-200">{tr('Army cost: {fmtPoints}', { fmtPoints: fmtPoints(armyPoints(army)) })}</li>
    </ul>
  )
}

/** Compares the two armies' points so a lopsided pairing is visible before the battle. */
function PointsMatchup({ settings }: { settings: Settings }) {
  const { human, opponent } = settings
  const a = armyPoints(armyUnits(settings, human))
  const b = armyPoints(armyUnits(settings, opponent))
  const ratio = Math.max(a.points, b.points) / Math.max(1, Math.min(a.points, b.points))
  const lopsided = ratio >= 1.25
  return (
    <p className={`mt-3 rounded p-2 text-xs ${lopsided ? 'bg-amber-950 text-amber-200' : 'bg-stone-900 text-stone-300'}`} aria-label={tr('Army points balance')}>
      {FACTION_NAME[human]}: <b>{fmtPoints(a)}</b> {tr('vs {item}:', { item: FACTION_NAME[opponent] })} <b>{fmtPoints(b)}</b>
      {lopsided && <> {tr('— about {toFixed}× advantage, the battle will be uneven.', { toFixed: ratio.toFixed(1) })}</>}
      <span className="block text-[10px] text-stone-500">
        {tr('Approximate, per {name} from {updated}. “≈” — the unit size is not from the handbook, the cost was recalculated per model.', { name: POINTS_SOURCE.name, updated: POINTS_SOURCE.updated })}
      </span>
    </p>
  )
}

export function LearningStylePicker() {
  const st = useStore()
  const cur = learningStyleOf(st.settings)
  return (
    <fieldset className="mt-3">
      <legend className="text-sm">{tr('Learning style')}</legend>
      <div className="mt-1 grid gap-1 sm:grid-cols-3">
        {(Object.keys(LEARNING_STYLE) as LearningStyle[]).map((k) => (
          <label key={k} className={`cursor-pointer rounded border p-2 text-xs ${cur === k ? 'border-yellow-400 bg-stone-700' : 'border-stone-600'}`}>
            <input type="radio" name="learning-style" className="mr-1" checked={cur === k} onChange={() => st.setSettings(LEARNING_STYLE[k].settings)} />
            <b>{LEARNING_STYLE[k].label}</b>
            <span className="block text-stone-400">{LEARNING_STYLE[k].hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Step 1: who plays. */
function ArmyStep() {
  const st = useStore()
  const { human, opponent } = st.settings
  return (
    <>
      <h2 className="font-semibold">{tr('Your army')}</h2>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FACTIONS.map((p) => {
          const army = armyUnits(st.settings, p)
          const faces = [...new Set(army.flatMap((u) => u.models.map((m) => m.profileId)))].slice(0, 4)
          return (
            <button
              key={p}
              onClick={() => st.setSettings({ human: p })}
              aria-pressed={human === p}
              className={`flex flex-col items-start justify-start rounded-lg border-2 p-3 text-left ${human === p ? 'border-yellow-400' : 'border-stone-600'}`}
              style={{ background: FACTION_STYLE[p].primary + '55' }}
            >
              <div className="mb-2 flex -space-x-3">
                {faces.map((id) => (
                  <img key={id} src={tokenImageFor(id, st.customTokens)} alt="" className="h-10 w-10 rounded-full border-2 border-stone-900" />
                ))}
              </div>
              <div className="font-semibold">{FACTION_NAME[p]}</div>
              <ArmyList faction={p} army={army} />
            </button>
          )
        })}
      </div>
      <label className="mt-4 block text-sm sm:max-w-sm">{tr('Opponent (computer-controlled)')}
        <select className="input" value={opponent} onChange={(e) => st.setSettings({ opponent: e.target.value as PlayerId })}>
          {FACTIONS.filter((f) => f !== human).map((f) => <option key={f} value={f}>{tr('{item} (AI)', { item: FACTION_NAME[f] })}</option>)}
        </select>
      </label>
      <PointsMatchup settings={st.settings} />
    </>
  )
}

/** Step 2: the scenario and what it asks for. */
function BattleStep() {
  const st = useStore()
  const { human, opponent, scenarioId } = st.settings
  const both = (s: (typeof SCENARIOS)[number]) => s.factions.includes(human) && s.factions.includes(opponent)
  const lists = [st.settings.armies?.[human], st.settings.armies?.[opponent]]
  const playable = (s: (typeof SCENARIOS)[number]) => both(s) && takesLists(s, lists)
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{tr('Scenario')}
          <select className="input" value={scenarioId} onChange={(e) => st.setSettings({ scenarioId: e.target.value })}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id} disabled={!playable(s)}>
                {s.name}{!both(s) ? tr(' — no armies for this pair') : playable(s) ? '' : s.customArmies ? tr(' — rosters over {maxPoints} points need a bigger board', { maxPoints: s.maxPoints ?? 0 }) : tr(' — own rosters only in “Combat Patrol”')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">{tr('AI level')}
          <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
            <option value="beginner">{tr('Beginner — simple priorities')}</option>
            <option value="standard">{tr('Standard — tactical evaluation')}</option>
          </select>
        </label>
        {scenarioId === 'combat-patrol' && (
          <label className="text-sm">{tr('Cover layout')}
            <select className="input" value={st.settings.layoutId ?? 'A'} onChange={(e) => st.setSettings({ layoutId: e.target.value })}>
              {LAYOUT_IDS.map((id) => <option key={id} value={id}>{id} — {PATROL_LAYOUT_NAME[id]}</option>)}
              <option value="random">{tr('Random|f')}</option>
            </select>
          </label>
        )}
        {scenarioId === 'strike-force' && (
          <>
            <label className="text-sm">{tr('Deployment map')}
              <select className="input" value={st.settings.mapId ?? 'random'} onChange={(e) => st.setSettings({ mapId: e.target.value })}>
                <option value="random">{tr('Random (as drawn from the deck)')}</option>
                {MAP_IDS.map((id) => <option key={id} value={id}>{withEn(MAPS[id])}</option>)}
              </select>
            </label>
            <label className="text-sm">{tr('Cover layout')}
              <select className="input" value={st.settings.layoutId ?? 'random'} onChange={(e) => st.setSettings({ layoutId: e.target.value })}>
                <option value="random">{tr('Random|f')}</option>
                {LAYOUT_IDS.map((id) => <option key={id} value={id}>{id} — {LAYOUT_NAME[id]}</option>)}
              </select>
            </label>
            <label className="text-sm">{tr('Primary mission (one for both)')}
              <select className="input" value={st.settings.primary ?? 'random'} onChange={(e) => st.setSettings({ primary: e.target.value })}>
                <option value="random">{tr('Random (D6 roll, as in Mirrored World)')}</option>
                {PRIMARY_IDS.map((id) => <option key={id} value={id}>{withEn(PRIMARY[id])}</option>)}
                <option value="training">{tr('Training score — 5 VP per objective from round 2')}</option>
              </select>
            </label>
            <label className="text-sm">{tr('Secondary missions (yours; the AI plays Tactical)')}
              <select className="input" value={st.settings.secondary ?? 'tactical'} onChange={(e) => st.setSettings({ secondary: e.target.value as never })}>
                <option value="tactical">{tr('Tactical — two cards from the deck each turn')}</option>
                <option value="fixed">{tr('Fixed — two cards for the whole battle')}</option>
                <option value="none">{tr('No secondaries (for both)')}</option>
              </select>
            </label>
            {st.settings.secondary === 'fixed' && [0, 1].map((i) => {
              const cards = st.settings.fixedCards ?? ['assassination', 'bringItDown']
              return (
                <label key={i} className="text-sm">{tr('Fixed card {n}', { n: i + 1 })}
                  <select className="input" value={cards[i]} onChange={(e) => { const next = [...cards]; next[i] = e.target.value as SecondaryId; st.setSettings({ fixedCards: next }) }}>
                    {FIXED_IDS.filter((id) => id === cards[i] || id !== cards[1 - i]).map((id) => <option key={id} value={id}>{withEn(SECONDARY[id])} — {SECONDARY[id].fixedText}</option>)}
                  </select>
                </label>
              )
            })}
          </>
        )}
      </div>
      <p className="mt-3 rounded bg-stone-900 p-2 text-xs text-stone-300">
        {scenario?.description}
        <br />
        <span className="text-amber-300">{scenario?.victory}</span>
      </p>
    </>
  )
}

/** Step 3: own army lists (optional). */
function RosterStep() {
  const { human, opponent } = useStore((s) => s.settings)
  return (
    <>
      <h2 className="font-semibold">{tr('Army rosters')}</h2>
      <p className="mt-1 text-xs text-stone-400">{tr('Optional: skip it to use the standard rosters.')}</p>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <ArmyBuilder faction={human} role={tr('Your army')} />
        <ArmyBuilder faction={opponent} role={tr('Opponent (AI)')} />
      </div>
    </>
  )
}

/** Step 4: what you are about to play, and how much the game explains. */
function ReadyStep() {
  const st = useStore()
  const { human, opponent, scenarioId } = st.settings
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)
  return (
    <>
      <p className="rounded bg-stone-900 p-3 text-sm">
        <b>{FACTION_NAME[human]}</b> ⚔ <b>{FACTION_NAME[opponent]}</b>
        <span className="block text-xs text-stone-400">{scenario?.name} · {st.settings.aiLevel === 'beginner' ? tr('Beginner — simple priorities') : tr('Standard — tactical evaluation')}</span>
      </p>
      <LearningStylePicker />
    </>
  )
}

const STEPS = [
  { label: () => tr('Your army'), body: <ArmyStep /> },
  { label: () => tr('Scenario'), body: <BattleStep /> },
  { label: () => tr('Army rosters'), body: <RosterStep /> },
  { label: () => tr('Ready to start'), body: <ReadyStep /> },
]

/** The main menu: a short home, then "New battle" walks through army → scenario → rosters → start. */
export function StartScreen() {
  const st = useStore()
  const [step, setStep] = useState(-1) // -1 = home
  const [legalOpen, setLegalOpen] = useState(false)
  const auto = deserialize(readStorage(AUTOSAVE_KEY))
  const manual = deserialize(readStorage(MANUAL_KEY))
  const listIssues = battleListProblems(st.settings)
  const last = step === STEPS.length - 1
  return (
    <div className="min-h-full bg-stone-900 p-4 text-stone-100">
      <div className="mx-auto max-w-5xl rounded-lg border border-stone-700 bg-stone-800 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{tr('Tabletop Trainer')}</h1>
          <label className="flex shrink-0 items-center gap-2 text-sm text-stone-400">
            {tr('Language')}
            <select className="input !mt-0 !w-auto" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-1 text-sm text-stone-400">
          {tr('A training simulator for the Warhammer 40,000 rules (11th edition). An unofficial hobby project.')}
        </p>

        {step < 0 ? (
          <div className="mx-auto mt-6 flex max-w-md flex-col gap-2">
            {auto.ok && !auto.file.state.winner && (
              <button className="btn btn-primary w-full" onClick={() => st.load(AUTOSAVE_KEY)}>
                {tr('▶ Continue the battle (round {round}, {toLocaleString})', { round: auto.file.state.round, toLocaleString: new Date(auto.file.savedAt).toLocaleString(locale) })}
              </button>
            )}
            <button className={`btn w-full ${auto.ok && !auto.file.state.winner ? '' : 'btn-primary'}`} onClick={() => setStep(0)}>{tr('New battle')}</button>
            <button className="btn w-full" disabled={listIssues.length > 0} title={listIssues[0] ?? ''} onClick={() => st.newGame()}>{tr('Quick start')}</button>
            <p className="text-xs text-stone-400">{tr('— straight into battle, units at standard positions.')}</p>
            <button className="btn w-full" disabled={!manual.ok} onClick={() => st.load(MANUAL_KEY)} title={manual.ok ? '' : manual.reason}>{tr('Load a save')}</button>
            <button className="btn w-full" onClick={() => openOnlineMenu()}>{tr('🌐 Play online together')}</button>
          </div>
        ) : (
          <>
            <ol className="mt-5 flex flex-wrap gap-1 text-xs" aria-label={tr('New battle')}>
              {STEPS.map((s, i) => (
                <li key={i}>
                  <button className={`rounded-full border px-3 py-1 ${i === step ? 'border-yellow-400 bg-stone-700' : 'border-stone-600 text-stone-400'}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                    {i + 1}. {s.label()}
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-4">{STEPS[step].body}</div>
            {last && listIssues.length > 0 && <p className="mt-2 text-sm text-rose-300">{tr('Fix the army roster to start: {item}', { item: listIssues[0] })}</p>}
            <div className="mt-5 flex gap-2">
              <button className="btn" onClick={() => setStep(step - 1)}>{step === 0 ? tr('Main menu') : tr('◀ Back')}</button>
              {last
                ? <button className="btn btn-primary flex-1" disabled={listIssues.length > 0} title={listIssues[0] ?? ''} onClick={() => st.startDeployment()}>{tr('Start a new battle')}</button>
                : <button className="btn btn-primary flex-1" onClick={() => setStep(step + 1)}>{tr('Next ▶')}</button>}
            </div>
            {last && <p className="mt-2 text-xs text-stone-400">{tr('First you will place your army in your zone, then round 1 begins. ')}</p>}
          </>
        )}
        {st.message && <p className="mt-2 text-sm text-rose-300">{st.message.text}</p>}
        <p className="mt-4 border-t border-stone-700 pt-2 text-[11px] text-stone-500">
          {tr('Unofficial fan project, not affiliated with Games Workshop.')}{' '}
          <button className="underline" onClick={() => setLegalOpen(true)}>{tr('About & legal')}</button>
        </p>
      </div>
      {legalOpen && <LegalDialog onClose={() => setLegalOpen(false)} />}
    </div>
  )
}
