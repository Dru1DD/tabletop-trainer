import { rect } from './geometry/geometry'
import { TERRAIN_CATEGORY } from './gameState'
import type { GameState, Terrain, TerrainKind } from './types'
import { tr } from '../i18n/index'

// Terrain editing before the battle. Pieces are axis-aligned rectangles (as in
// the scenarios); rules only care about `kind` and `obscuring`.

export const TERRAIN_PRESETS = {
  ruin: { name: tr('Ruins'), kind: 'ruin', w: 4, h: 3 },
  wall: { name: tr('Wall debris'), kind: 'ruin', w: 3, h: 0.8 },
  woods: { name: tr('Woods'), kind: 'woods', w: 4, h: 4 },
  barricade: { name: tr('Barricade'), kind: 'barricade', w: 4, h: 0.6 },
  container: { name: tr('Container'), kind: 'container', w: 3, h: 1.5 },
} as const satisfies Record<string, { name: string; kind: TerrainKind; w: number; h: number }>

export type TerrainPreset = keyof typeof TERRAIN_PRESETS

export const MIN_SIZE = 0.5
export const MAX_SIZE = 12
const snap = (v: number) => Math.round(v * 2) / 2

export interface Box { x: number; y: number; w: number; h: number }

export function boxOf(t: Terrain): Box {
  const xs = t.poly.map((p) => p.x), ys = t.poly.map((p) => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Where the trees of a wood stand (inches from the piece's corner): a staggered grid, shared by the flat and 2.5D views. */
export function treeSpots(b: Box): { x: number; y: number }[] {
  const cols = Math.max(1, Math.floor(b.w / 1.2)), rows = Math.max(1, Math.floor(b.h / 1.2))
  return Array.from({ length: cols * rows }, (_, i) => {
    const r = Math.floor(i / cols)
    return { x: ((i % cols) + 0.5) * (b.w / cols) + (r % 2 ? 0.25 : -0.25), y: (r + 0.5) * (b.h / rows) }
  })
}

/** Snap to ½″, clamp size and keep the piece on the board. */
export function fitBox(b: Box, board: GameState['board']): Box {
  const w = Math.min(MAX_SIZE, board.width, Math.max(MIN_SIZE, snap(b.w)))
  const h = Math.min(MAX_SIZE, board.height, Math.max(MIN_SIZE, snap(b.h)))
  return { w, h, x: Math.min(board.width - w, Math.max(0, snap(b.x))), y: Math.min(board.height - h, Math.max(0, snap(b.y))) }
}

export const withBox = (t: Terrain, b: Box): Terrain => ({ ...t, poly: rect(b.x, b.y, b.w, b.h) })

export function newPiece(s: GameState, preset: TerrainPreset): Terrain {
  const p = TERRAIN_PRESETS[preset]
  let n = s.terrain.length + 1
  while (s.terrain.some((t) => t.id === `c${n}`)) n++
  const b = fitBox({ x: s.board.width / 2 - p.w / 2, y: s.board.height / 2 - p.h / 2, w: p.w, h: p.h }, s.board)
  return { id: `c${n}`, name: p.name, kind: p.kind, obscuring: TERRAIN_CATEGORY[p.kind].category !== 'exposed', poly: rect(b.x, b.y, b.w, b.h) }
}

/** Validate a layout read from localStorage; null if anything is off. */
export function parseLayout(v: unknown): Terrain[] | null {
  if (!Array.isArray(v)) return null
  const ok = v.every((t) =>
    t && typeof t.id === 'string' && typeof t.name === 'string' && Object.hasOwn(TERRAIN_CATEGORY, t.kind) && typeof t.obscuring === 'boolean' &&
    Array.isArray(t.poly) && t.poly.length >= 3 && t.poly.every((p: { x: unknown; y: unknown }) => Number.isFinite(p?.x) && Number.isFinite(p?.y)))
  return ok ? (v as Terrain[]).filter((t) => t.kind !== 'crater') : null // craters are gone from the game; old saves drop them
}
