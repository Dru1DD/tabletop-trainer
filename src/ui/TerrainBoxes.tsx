import { Fragment, type CSSProperties, type ReactNode, type Ref } from 'react'
import { boxOf, treeSpots } from '../game/terrainLayout'
import type { Terrain } from '../game/types'
import type { Viewport } from '../view/transform'

// 2.5D: terrain as real CSS 3D boxes. They live in the same tilted, `preserve-3d` container as the Konva canvas, so the
// browser does the perspective and the hiding (a wall covers what stands behind it). Pointer events pass through to
// the canvas, which still draws and handles the flat footprint.

/** Height in inches. */
const HEIGHT: Record<Terrain['kind'], number> = { ruin: 3, container: 2, barricade: 1, woods: 0, crater: 0 }
const WALL = 0.35

interface Look { top: string; front: string; side: string; edge: string }

/** One face of a box; `rot` stands it up on its ground edge. */
function Face({ style, bg, edge, children }: { style: CSSProperties; bg: string; edge: string; children?: ReactNode }) {
  return <div style={{ position: 'absolute', background: bg, boxShadow: `inset 0 0 0 1.5px ${edge}`, ...style }}>{children}</div>
}

/** A box on the table: x, y, w, d on the ground, h tall (all CSS px), raised by z. The south face is the one the camera sees. */
function Block({ x, y, w, d, h, z = 0, look, frontDecor, topBg, shadow = true }: { x: number; y: number; w: number; d: number; h: number; z?: number; look: Look; frontDecor?: ReactNode; topBg?: string; shadow?: boolean }) {
  const { edge } = look
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: d, transformStyle: 'preserve-3d', ...(z ? { transform: `translateZ(${z}px)` } : {}) }}>
      {shadow && <div style={{ position: 'absolute', inset: 0, transform: `translate3d(${h * 0.3}px, ${h * 0.2}px, 0.5px)`, background: 'rgba(0,0,0,0.35)' }} />}
      <Face edge={edge} bg={look.front} style={{ left: 0, top: d, width: w, height: h, transformOrigin: '50% 0', transform: 'rotateX(90deg)' }}>{frontDecor}</Face>
      <Face edge={edge} bg={look.front} style={{ left: 0, top: -h, width: w, height: h, transformOrigin: '50% 100%', transform: 'rotateX(-90deg)' }} />
      <Face edge={edge} bg={look.side} style={{ left: -h, top: 0, width: h, height: d, transformOrigin: '100% 50%', transform: 'rotateY(90deg)' }} />
      <Face edge={edge} bg={look.side} style={{ left: w, top: 0, width: h, height: d, transformOrigin: '0 50%', transform: 'rotateY(-90deg)' }} />
      <Face edge={edge} bg={topBg ?? look.top} style={{ left: 0, top: 0, width: w, height: d, transform: `translateZ(${h}px)` }} />
    </div>
  )
}

/** A four-sided pyramid (a tier of a pine): four triangles leaning in to an apex over the middle of the base. */
function Cone({ x, y, w, d, h, z, front, side }: { x: number; y: number; w: number; d: number; h: number; z: number; front: string; side: string }) {
  const deg = (a: number) => 90 + (Math.atan2(a, h) * 180) / Math.PI // from flat to standing (90°) and on, leaning in
  const lx = Math.hypot(h, w / 2), ly = Math.hypot(h, d / 2) // slant lengths
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: d, transformStyle: 'preserve-3d', transform: `translateZ(${z}px)` }}>
      <div style={{ position: 'absolute', left: 0, top: d, width: w, height: ly, background: front, clipPath: 'polygon(0 0, 100% 0, 50% 100%)', transformOrigin: '50% 0', transform: `rotateX(${deg(d / 2)}deg)` }} />
      <div style={{ position: 'absolute', left: 0, top: -ly, width: w, height: ly, background: front, clipPath: 'polygon(50% 0, 0 100%, 100% 100%)', transformOrigin: '50% 100%', transform: `rotateX(${-deg(d / 2)}deg)` }} />
      <div style={{ position: 'absolute', left: -lx, top: 0, width: lx, height: d, background: side, clipPath: 'polygon(100% 0, 0 50%, 100% 100%)', transformOrigin: '100% 50%', transform: `rotateY(${deg(w / 2)}deg)` }} />
      <div style={{ position: 'absolute', left: w, top: 0, width: lx, height: d, background: side, clipPath: 'polygon(0 0, 0 100%, 100% 50%)', transformOrigin: '0 50%', transform: `rotateY(${-deg(w / 2)}deg)` }} />
    </div>
  )
}

const ribs = (angle: number, a: string, b: string, step: number) => `repeating-linear-gradient(${angle}deg, ${a} 0 ${step / 2}px, ${b} ${step / 2}px ${step}px)`

/** Deterministic 0..1 numbers from the piece id, so a ruin looks the same every render (mulberry32). */
function seeded(id: string) {
  let a = 0
  for (const c of id) a = (Math.imul(a, 31) + c.charCodeAt(0)) | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Heights (0..1 of the full height) of the cells of a broken wall: tall corner posts, gaps and low stumps between.
 * `cap` keeps the near wall low so the camera can see over it into the ruin. */
function crumble(rand: () => number, n: number, posts: boolean, cap: number): number[] {
  const hs = Array.from({ length: n }, (_, i) => {
    if (posts && (i === 0 || i === n - 1)) return (0.8 + rand() * 0.2) * Math.max(cap, 0.7)
    const r = rand()
    return (r < 0.22 ? 0 : r < 0.5 ? 0.2 + rand() * 0.2 : r < 0.8 ? 0.45 + rand() * 0.25 : 0.8 + rand() * 0.2) * cap
  })
  if (n >= 3 && !hs.some((v) => v === 0)) hs[1 + Math.floor(rand() * (n - 2))] = 0 // always a doorway or breach
  return hs
}

function Piece({ t, s }: { t: Terrain; s: number }) {
  const b = boxOf(t)
  const x = b.x * s, y = b.y * s, w = b.w * s, d = b.h * s
  if (t.kind === 'woods') return <Wood t={t} s={s} />
  const h = HEIGHT[t.kind] * s
  if (h <= 0) return null
  const long = b.w >= b.h
  if (t.kind === 'container') {
    const look: Look = { top: '#c2603f', front: '#8a3624', side: '#6a2a1b', edge: 'rgba(255,200,170,0.85)' }
    const along = long ? 90 : 0
    return (
      <Block x={x} y={y} w={w} d={d} h={h} look={look}
        topBg={ribs(along, '#c2603f', '#a8502f', 0.3 * s)}
        frontDecor={<div style={{ position: 'absolute', inset: 0, background: ribs(90, 'transparent', 'rgba(60,18,10,0.55)', 0.3 * s) }} />} />
    )
  }
  if (t.kind === 'barricade') {
    const look: Look = { top: '#57534e', front: '#1c1917', side: '#292524', edge: 'rgba(255,214,140,0.9)' }
    return <Block x={x} y={y} w={w} d={d} h={h} look={look} frontDecor={<div style={{ position: 'absolute', inset: 0, background: ribs(45, '#f59e0b', '#1c1917', 0.5 * s) }} />} />
  }
  return <Ruin t={t} s={s} />
}

const RUIN: Look = { top: '#dbeafe', front: '#1f4e80', side: '#173d66', edge: 'rgba(207,233,255,0.85)' }

/** A ruin is broken walls, not a solid building: posts at the corners, gaps, stumps, and rubble. The near (south) wall
 * is kept low so models standing inside stay visible. */
function Ruin({ t, s }: { t: Terrain; s: number }) {
  const b = boxOf(t)
  const x = b.x * s, y = b.y * s, w = b.w * s, d = b.h * s
  const full = HEIGHT.ruin * s
  const rand = seeded(t.id)
  const cell = 1.1 * s // one wall cell (inch-ish)
  const thin = Math.min(b.w, b.h) < 1.2
  const wall = Math.min(WALL * s, w / 3, d / 3)
  // a run of wall cells along x (`alongX`) or y, starting at (rx, ry), `len` long and `thick` thick
  const run = (key: string, rx: number, ry: number, len: number, thick: number, alongX: boolean, posts: boolean, cap: number) => {
    const n = Math.max(1, Math.round(len / cell))
    const step = len / n
    return crumble(rand, n, posts && n > 1, cap).map((f, i) => {
      if (f <= 0.05) return null
      const hh = Math.max(0.2 * s, full * f)
      return <Block key={`${key}${i}`} x={alongX ? rx + i * step : rx} y={alongX ? ry : ry + i * step} w={alongX ? step : thick} d={alongX ? thick : step} h={hh} look={RUIN} />
    })
  }
  const rubble = Array.from({ length: thin ? 2 : 4 }, (_, i) => {
    const sz = (0.18 + rand() * 0.25) * s
    const rx = x + rand() * (w - sz), ry = y + rand() * (d - sz)
    return <Block key={`r${i}`} x={rx} y={ry} w={sz} d={sz * (0.7 + rand() * 0.6)} h={(0.1 + rand() * 0.15) * s} look={RUIN} />
  })
  if (thin) {
    const thick = Math.min(d, 0.5 * s)
    const along = b.w >= b.h
    return (
      <>
        {along ? run('w', x, y + (d - thick) / 2, w, thick, true, true, 1) : run('w', x + (w - thick) / 2, y, d, thick, false, true, 1)}
        {rubble}
      </>
    )
  }
  return (
    <>
      {run('n', x, y, w, wall, true, true, 1)}
      {run('s', x, y + d - wall, w, wall, true, true, 0.55)}
      {run('e', x + w - wall, y + wall, d - 2 * wall, wall, false, false, 0.85)}
      {run('o', x, y + wall, d - 2 * wall, wall, false, false, 0.85)}
      {rubble}
    </>
  )
}

const TRUNK: Look = { top: '#6b4423', front: '#4a2f17', side: '#3a2412', edge: 'rgba(0,0,0,0.25)' }
const TIERS = [
  { front: '#1f7a3f', side: '#145a2d' },
  { front: '#27924a', side: '#1a6e36' },
  { front: '#34b05a', side: '#228545' },
]

/** A wood is a stand of low-poly pines: a trunk and three stacked pyramids per tree. */
function Wood({ t, s }: { t: Terrain; s: number }) {
  const b = boxOf(t)
  const rand = seeded(t.id)
  return (
    <>
      {treeSpots(b).map(({ x, y }, i) => {
        const k = 0.85 + rand() * 0.3 // each tree a little different
        const cx = (b.x + x) * s, cy = (b.y + y) * s
        const trunk = 0.18 * s, th = 0.3 * s * k // low trees: ~1.3″ in all, a model is ~1″ tall
        const tiers = [{ w: 0.9, z: 0.3, h: 0.5 }, { w: 0.66, z: 0.58, h: 0.45 }, { w: 0.4, z: 0.84, h: 0.4 }]
        return (
          <Fragment key={i}>
            <div style={{ position: 'absolute', left: cx - 0.4 * s, top: cy - 0.3 * s, width: 0.9 * s, height: 0.9 * s, borderRadius: '50%', background: 'rgba(0,0,0,0.3)', transform: 'translateZ(0.5px)' }} />
            <Block x={cx - trunk / 2} y={cy - trunk / 2} w={trunk} d={trunk} h={th + 0.15 * s} look={TRUNK} shadow={false} />
            {tiers.map((c, j) => {
              const w = c.w * s * k
              return <Cone key={j} x={cx - w / 2} y={cy - w / 2} w={w} d={w} h={c.h * s * k} z={c.z * s * k} front={TIERS[j].front} side={TIERS[j].side} />
            })}
          </Fragment>
        )
      })}
    </>
  )
}

/** The 3D layer: positioned like the Konva stage (its x/y/scale come from the viewport). `layerRef` lets the board move it
 * while the stage is dragged, without re-rendering. */
export function TerrainBoxes({ terrain, view, layerRef }: { terrain: Terrain[]; view: Viewport; layerRef: Ref<HTMLDivElement> }) {
  return (
    <div ref={layerRef} className="pointer-events-none absolute left-0 top-0" style={{ transformStyle: 'preserve-3d' }} aria-hidden>
      <div style={{ position: 'absolute', left: view.x, top: view.y, transformStyle: 'preserve-3d' }}>
        {terrain.map((t) => <Piece key={t.id} t={t} s={view.scale} />)}
      </div>
    </div>
  )
}
