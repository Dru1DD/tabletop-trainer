import { useEffect, useState } from 'react'
import { OnlineBanner, OnlineHeader, OnlineScreen } from './multiplayer/OnlineScreen'
import { joinRoom, leaveRoom, parseRoomCode, savedGuestRoom, useMp } from './multiplayer/session'
import { actor } from './game/engine'
import { mapLine } from './game/scenarios/scenarios'
import { missionName } from './game/rules/missions'
import { type ExplainLevel } from './game/types'
import { AI_STEP_MS, useStore } from './store'
import { BattleOverDialog } from './ui/BattleOverDialog'
import { LegalDialog } from './ui/LegalDialog'
import { ReactionPrompt } from './ui/ReactionPrompt'
import { ChargeConfirm } from './ui/ChargeConfirm'
import { RerollPrompt } from './ui/RerollPrompt'
import { HyperAdaptationPrompt } from './ui/HyperAdaptationPrompt'
import { hyperPending } from './game/engine'
import { DOCTRINE_NAME, HYPER_NAME } from './game/rules/detachments'
import { FACTION_STYLE } from './assets/manifest'
import { FACTION_NAME } from './game/data/datasheets'
import { Board } from './ui/Board'
import { ActionPanel, AttackReview, BottomPanel, DiceFaces, RosterPanel } from './ui/Panels'
import { PanelBoundary } from './ui/PanelBoundary'
import { LearningStylePicker, StartScreen } from './ui/StartScreen'
import { scoreText } from './ui/score'
import { tr } from './i18n/index'

export default function App() {
  const game = useStore((s) => s.game)
  const onlineScreen = useMp((s) => s.screen)
  useAiLoop()
  useInviteLink()
  return game ? <GameScreen /> : onlineScreen !== 'none' ? <OnlineScreen /> : <StartScreen />
}

/** Opening `?room=CODE` (an invitation link) joins that room right away. */
function useInviteLink() {
  useEffect(() => {
    const raw = new URLSearchParams(location.search).get('room')
    if (!raw) return
    history.replaceState(null, '', location.pathname)
    const code = parseRoomCode(raw)
    const saved = savedGuestRoom()
    void joinRoom(raw, code && saved?.code === code ? saved.token : null)
  }, [])
}

/** Drives the AI one decision at a time so the player can follow along. Each decision is computed in a
 * Web Worker (`aiStepAsync`), so the page keeps responding while the AI thinks. */
function useAiLoop() {
  const game = useStore((s) => s.game)
  const human = useStore((s) => s.settings.human)
  const aiStep = useStore((s) => s.aiStepAsync)
  const paused = useStore((s) => !!s.deploying || !!s.review || !!s.shared)
  // slower AI for beginners so each enemy action can be followed
  const delay = useStore((s) => (s.settings.explain === 'beginner' ? AI_STEP_MS * 2 : AI_STEP_MS))
  useEffect(() => {
    if (!game || paused || game.winner || actor(game) === human) return
    const t = setTimeout(() => void aiStep(), delay)
    return () => clearTimeout(t)
  }, [game, human, aiStep, paused, delay])
}

const EXPLAIN: Record<ExplainLevel, string> = {
  beginner: tr('Beginner — explain everything'),
  standard: tr('Standard — decisions and restrictions'),
  minimal: tr('Minimum — results only'),
}

function GameScreen() {
  const st = useStore()
  const game = st.game!
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  // dialog dismissed for this exact finished game object; any new/loaded game re-arms it
  const [overClosedFor, setOverClosedFor] = useState<typeof game | null>(null)
  const lastDice = game.diceLog.at(-1)
  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] bg-stone-900 text-stone-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-700 bg-stone-950 px-3 py-2">
        <h1 className="mr-2 font-bold">{tr('Tabletop Trainer')}</h1>
        {st.deploying ? (
          <span className="rounded bg-yellow-600 px-2 py-0.5 text-sm font-semibold text-black">{tr('Setup: army placement')}</span>
        ) : (
          <>
            <span className="rounded bg-stone-800 px-2 py-0.5 text-sm">{tr('Round {round}/{maxRounds}', { round: game.round, maxRounds: game.maxRounds })}</span>
            {missionName(game) && <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs" title={tr('Primary mission of both sides: {name}', { name: missionName(game) })}>🎯 {missionName(game)!.split(' (')[0]}</span>}
            {mapLine(game) && <span className="hidden rounded bg-stone-800 px-2 py-0.5 text-xs xl:inline" title={mapLine(game)!}>🗺 {mapLine(game)!.split(' (')[0]}</span>}
            <span className="rounded px-2 py-0.5 text-sm" style={{ background: FACTION_STYLE[game.activePlayer].primary }}>
              {tr('Turn: {item}', { item: FACTION_NAME[game.activePlayer] })}
            </span>
          </>
        )}
        <OnlineHeader />
        <span className="text-sm text-stone-300">{tr('VP: {scoreText}', { scoreText: scoreText(game) })}</span>
        {game.players.orks?.riledTurns > 0 && <span className="rounded bg-red-800 px-2 py-0.5 text-xs">WAAAGH!</span>}
        {game.players.marines?.doctrine && <span className="rounded bg-sky-800 px-2 py-0.5 text-xs" title={tr('Space Marines Combat Doctrine until the next Command phase')}>{tr('Doctrine: {name}', { name: DOCTRINE_NAME[game.players.marines.doctrine] })}</span>}
        {game.players.tyranids?.hyperAdaptation && <span className="rounded bg-purple-800 px-2 py-0.5 text-xs" title={tr('Tyranid hyper-adaptation for the whole battle')}>{HYPER_NAME[game.players.tyranids.hyperAdaptation]}</span>}
        {game.players.adeptus_mechanicus?.imperative && <span className="rounded bg-amber-800 px-2 py-0.5 text-xs" title={tr('Adeptus Mechanicus army Imperative doctrine')}>{game.players.adeptus_mechanicus.imperative === 'protector' ? tr('Protector') : tr('Conqueror')}</span>}
        <div className="ml-auto flex flex-wrap gap-1">
          {/* icons only on laptop widths; labels from 1536px */}
          <button className={`btn ${st.measuring ? 'btn-primary' : ''}`} onClick={() => st.toggleMeasure()} aria-pressed={st.measuring} title={tr('Ruler (R)')} aria-label={tr('Ruler')}>📏<span className="hidden 2xl:inline"> {tr('Ruler')}</span></button>
          <button className="btn" disabled={!!st.deploying} onClick={() => st.save()} title={tr('Save')} aria-label={tr('Save')}>💾<span className="hidden 2xl:inline"> {tr('Save')}</span></button>
          <button className="btn" disabled={!!st.shared} onClick={() => st.load()} title={tr('Load')} aria-label={tr('Load')}>📂<span className="hidden 2xl:inline"> {tr('Load')}</span></button>
          {game.winner && <button className="btn" onClick={() => setOverClosedFor(null)} title={tr('Battle results')} aria-label={tr('Results')}>🏆<span className="hidden 2xl:inline"> {tr('Results')}</span></button>}
          <button className="btn" onClick={() => setSettingsOpen(true)} title={tr('Settings')} aria-label={tr('Settings')}>⚙<span className="hidden 2xl:inline"> {tr('Settings')}</span></button>
          <button className="btn" onClick={() => setLegalOpen(true)} title={tr('About & legal')} aria-label={tr('About & legal')}>ⓘ</button>
          <button className="btn" onClick={() => (st.shared ? window.confirm(tr('Leave the online game? Your opponent will see that you disconnected.')) && leaveRoom() : st.quit())} title={st.shared ? tr('Leave the game') : tr('Main menu')} aria-label={tr('Menu')}>☰<span className="hidden 2xl:inline"> {tr('Menu')}</span></button>
        </div>
      </header>

      <main className={`grid min-h-0 grid-cols-1 overflow-y-auto md:grid-cols-2 lg:overflow-hidden ${st.layout.roster ? 'lg:grid-cols-[240px_1fr_270px] 2xl:grid-cols-[300px_1fr_320px]' : 'lg:grid-cols-[60px_1fr_280px] 2xl:grid-cols-[60px_1fr_320px]'}`}>
        <aside className="order-2 border-r border-stone-700 p-2 lg:order-1 lg:overflow-y-auto"><PanelBoundary name={tr('Units')} resetKey={st.selectedUnitId}><RosterPanel /></PanelBoundary></aside>
        <section className="relative order-1 h-[60vh] min-w-0 overflow-hidden md:col-span-2 lg:order-2 lg:col-span-1 lg:h-auto">
          <Board />
          <OnlineBanner />
          {st.measuring && <MeasureBar />}
          {lastDice && !st.review && <DiceToast key={lastDice.id} entryId={lastDice.id} />}
          <AttackReview />
          {st.message && (
            <div className={`absolute left-1/2 top-24 z-[2] max-w-md -translate-x-1/2 rounded px-3 py-2 text-sm shadow ${st.message.kind === 'error' ? 'bg-rose-900' : 'bg-stone-700'}`} role="status">
              {st.message.text} <button className="ml-2 text-stone-300" onClick={() => st.setMessage(null)} aria-label={tr('Close')}>✕</button>
            </div>
          )}
        </section>
        <aside className="order-3 border-l border-stone-700 p-2 lg:overflow-y-auto"><PanelBoundary name={tr('Actions')} resetKey={st.selectedUnitId}><ActionPanel /></PanelBoundary></aside>
      </main>

      <footer className={`${st.layout.log ? 'h-48' : ''} border-t border-stone-700 p-2`}><PanelBoundary name={tr('Log')}><BottomPanel /></PanelBoundary></footer>
      {game.winner && !st.deploying && overClosedFor !== game && (
        <BattleOverDialog game={{ ...game, winner: game.winner }} human={st.settings.human} onClose={() => setOverClosedFor(game)} onNewBattle={() => (st.shared ? leaveRoom() : st.startDeployment())} />
      )}
      {game.reaction?.player === st.settings.human && !game.winner && !st.review && <ReactionPrompt game={game} human={st.settings.human} />}
      <ChargeConfirm />
      {game.pendingReroll?.player === st.settings.human && !game.winner && !st.review && <RerollPrompt game={game} human={st.settings.human} />}
      {hyperPending(game) && st.settings.human === 'tyranids' && !st.review && <HyperAdaptationPrompt game={game} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {legalOpen && <LegalDialog onClose={() => setLegalOpen(false)} />}
    </div>
  )
}

function MeasureBar() {
  const st = useStore()
  return (
    <div className="absolute left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs">
      <span>{tr('Ruler: click two points or models (from the base edge).')}</span>
      <label>{tr('Check range')}
        <input className="ml-1 w-12 rounded bg-stone-700 px-1" type="number" min={1} max={72} value={st.measure.range} onChange={(e) => st.setMeasureRange(Number(e.target.value) || 1)} />″
      </label>
      <button className="btn" onClick={() => st.clearMeasure()}>{tr('Reset')}</button>
    </div>
  )
}

function DiceToast({ entryId }: { entryId: number }) {
  const entry = useStore((s) => s.game?.diceLog.find((d) => d.id === entryId))
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500)
    return () => clearTimeout(t)
  }, [])
  if (!visible || !entry) return null
  return (
    <div className="absolute bottom-16 left-2 z-[1] max-w-xs rounded bg-black/80 p-2 text-xs shadow-lg" onClick={() => setVisible(false)} title={tr('Click to hide')}>
      <div className="mb-1 font-semibold">🎲 {entry.title}</div>
      <DiceFaces entry={entry} />
    </div>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const st = useStore()
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-80 rounded-lg bg-stone-800 p-4" role="dialog" aria-label={tr('Settings')} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 font-semibold">{tr('Settings')}</h2>
        <label className="block text-sm">{tr('Explanations')}
          <select className="input" value={st.settings.explain} onChange={(e) => st.setSettings({ explain: e.target.value as ExplainLevel })}>
            {Object.entries(EXPLAIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {!st.shared && (
          <label className="mt-2 block text-sm">{tr('AI level')}
            <select className="input" value={st.settings.aiLevel} onChange={(e) => st.setSettings({ aiLevel: e.target.value as never })}>
              <option value="beginner">{tr('Beginner')}</option>
              <option value="standard">{tr('Standard')}</option>
            </select>
          </label>
        )}
        <LearningStylePicker />
        {st.tutorialDone.length > 0 && <button className="mt-1 text-xs text-sky-300 underline" onClick={() => st.resetTutorial()}>{tr('Redo the tutorial')}</button>}
        <button className="btn btn-primary mt-3 w-full" onClick={onClose}>{tr('Done')}</button>
      </div>
    </div>
  )
}
