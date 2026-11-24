import React, { useEffect, useRef, useState } from 'react';
import { TradeRecord } from '../types/ghr';
import { fmtUSD } from '../utils/ghrRules';
import { deskText, type DeskLanguage } from '../utils/deskI18n';

interface KineticNodesCanvasProps {
  lang?: DeskLanguage;
  activePort: string;
  trades: TradeRecord[];
}

interface BaseNodeCoord {
  x: number;
  y: number;
  z: number;
  scale: number;
}

interface ProjectedNode {
  idx: number;
  sx: number;
  sy: number;
  depth: number;
  radius: number;
  color: string;
  glow: string;
}

const TOTAL_FRAMES = 300;
const PARTICLE_COUNT = 36;
const LINK_DIST_SQ = 1.35 * 1.35;
const CAMERA_Z = 9.4;

const BASE_COORDS: readonly BaseNodeCoord[] = (() => {
  const raw: BaseNodeCoord[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    raw.push({
      x: ((i % 9) - 4) * 0.82,
      y: (Math.floor(i / 9) - 1.5) * 0.72,
      z: Math.sin(i * 0.7) * 1.1,
      scale: 0.88 + (i % 5) * 0.06,
    });
  }
  raw.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
  return raw;
})();

export const KineticNodesCanvas: React.FC<KineticNodesCanvasProps> = React.memo(
  ({ activePort, trades, lang = 'en' }) => {
    const t = (en: string, th: string) => deskText(lang, en, th);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const frameReadoutRef = useRef<HTMLSpanElement | null>(null);

    const [isPlaying, setIsPlaying] = useState(true);
    const [focusedIdx, setFocusedIdx] = useState(0);

    const isPlayingRef = useRef(true);
    const focusedIdxRef = useRef(0);
    const activePortRef = useRef(activePort);
    const tradesRef = useRef<TradeRecord[]>(trades);
    const renderOnceRef = useRef<(() => void) | null>(null);

    useEffect(() => {
      isPlayingRef.current = isPlaying;
      renderOnceRef.current?.();
    }, [isPlaying]);

    useEffect(() => {
      focusedIdxRef.current = focusedIdx;
      renderOnceRef.current?.();
    }, [focusedIdx]);

    useEffect(() => {
      activePortRef.current = activePort;
      tradesRef.current = trades;
      if (trades.length > 0 && focusedIdx >= trades.length) {
        setFocusedIdx(0);
      } else {
        renderOnceRef.current?.();
      }
    }, [activePort, trades, focusedIdx]);

    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      let width = container.clientWidth || 300;
      let height = container.clientHeight || 160;
      let dpr = Math.min(window.devicePixelRatio || 1, 2);

      const syncSize = () => {
        width = container.clientWidth || 300;
        height = container.clientHeight || 160;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      syncSize();

      const worldX = new Float32Array(PARTICLE_COUNT);
      const worldY = new Float32Array(PARTICLE_COUNT);
      const worldZ = new Float32Array(PARTICLE_COUNT);
      const rotX = new Float32Array(PARTICLE_COUNT);
      const rotY = new Float32Array(PARTICLE_COUNT);
      const rotZ = new Float32Array(PARTICLE_COUNT);
      const projX = new Float32Array(PARTICLE_COUNT);
      const projY = new Float32Array(PARTICLE_COUNT);
      const projScale = new Float32Array(PARTICLE_COUNT);

      let frame = 0;
      let beaconX = BASE_COORDS[0].x;
      let beaconY = BASE_COORDS[0].y;
      let beaconZ = BASE_COORDS[0].z;
      let outerAngle = 0;
      let innerAngle = 0;
      let crystalAngle = 0;
      let lastTime = performance.now();
      let rafId = 0;
      let disposed = false;
      let inViewport = true;

      const projected: ProjectedNode[] = Array.from({ length: PARTICLE_COUNT }, (_, idx) => ({
        idx,
        sx: 0,
        sy: 0,
        depth: 0,
        radius: 3,
        color: '#0752E8',
        glow: 'rgba(7, 82, 232, 0.25)',
      }));

      const projectPoint = (
        x: number,
        y: number,
        z: number,
        cosY: number,
        sinY: number,
        cosX: number,
        sinX: number,
        focal: number,
        cx: number,
        cy: number
      ) => {
        const rx = x * cosY + z * sinY;
        const rz1 = -x * sinY + z * cosY;
        const ry = y * cosX - rz1 * sinX;
        const rz = y * sinX + rz1 * cosX;
        const invZ = focal / Math.max(1.8, CAMERA_Z - rz);
        return {
          sx: cx + rx * invZ,
          sy: cy - ry * invZ,
          scale: invZ,
          rz,
        };
      };

      const drawFrame = (advance: boolean) => {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.08);
        lastTime = now;

        if (advance && isPlayingRef.current && !reducedMotion) {
          frame = (frame + 1) % TOTAL_FRAMES;
          outerAngle += dt * 1.4;
          innerAngle -= dt * 1.8;
          crystalAngle += dt * 2.2;
        }

        const phase = (frame / TOTAL_FRAMES) * Math.PI * 2;
        if (frameReadoutRef.current && (frame % 3 === 0 || !advance)) {
          frameReadoutRef.current.textContent = `${String(frame).padStart(3, '0')}f / ${TOTAL_FRAMES}f`;
        }

        const isDark = document.documentElement.dataset.theme === 'obsidian';
        const isFunded = activePortRef.current === 'funded';
        const currentTrades = tradesRef.current;

        const winColor = isDark ? '#34D399' : '#059669';
        const winGlow = isDark ? 'rgba(52, 211, 153, 0.32)' : 'rgba(5, 150, 105, 0.22)';
        const lossColor = isDark ? '#FB7185' : '#BE123C';
        const lossGlow = isDark ? 'rgba(251, 113, 133, 0.32)' : 'rgba(190, 18, 60, 0.22)';
        const neutralColor = isFunded ? winColor : isDark ? '#94A3B8' : '#64748B';
        const neutralGlow = isFunded ? winGlow : 'rgba(7, 82, 232, 0.18)';
        const linkStroke = isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(7, 82, 232, 0.16)';
        const outerRingColor = isDark ? '#60A5FA' : '#0752E8';
        const innerRingColor = isDark ? '#CBD5E1' : '#18181B';

        const rotAngleY = Math.cos(phase * 0.5) * 0.18;
        const rotAngleX = Math.sin(phase * 0.5) * 0.1;
        const cosY = Math.cos(rotAngleY);
        const sinY = Math.sin(rotAngleY);
        const cosX = Math.cos(rotAngleX);
        const sinX = Math.sin(rotAngleX);

        const cx = width * 0.5;
        const cy = height * 0.48;
        const focal = Math.min(width * 0.92, height * 2.15);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const base = BASE_COORDS[i];
          const tr = currentTrades[i];
          const tradeBias = tr
            ? Math.max(-1.2, Math.min(1.2, (Number(tr.pnlUsd) || 0) / 120))
            : 0;
          const nx = base.x + Math.cos(phase + i * 0.4) * 0.18;
          const ny = base.y + tradeBias * 0.45 + Math.sin(phase + i * 0.5) * 0.18;
          const nz = base.z + Math.sin(phase * 0.5 + i) * 0.22;

          worldX[i] = nx;
          worldY[i] = ny;
          worldZ[i] = nz;

          const rx = nx * cosY + nz * sinY;
          const rz1 = -nx * sinY + nz * cosY;
          const ry = ny * cosX - rz1 * sinX;
          const rz = ny * sinX + rz1 * cosX;

          rotX[i] = rx;
          rotY[i] = ry;
          rotZ[i] = rz;

          const invZ = focal / Math.max(1.8, CAMERA_Z - rz);
          projX[i] = cx + rx * invZ;
          projY[i] = cy - ry * invZ;
          projScale[i] = invZ;

          const p = projected[i];
          p.idx = i;
          p.sx = projX[i];
          p.sy = projY[i];
          p.depth = rz;
          p.radius = Math.max(2.1, base.scale * invZ * 0.115);

          if (tr) {
            const isWin = Number(tr.pnlUsd) >= 0;
            p.color = isWin ? winColor : lossColor;
            p.glow = isWin ? winGlow : lossGlow;
          } else {
            p.color = neutralColor;
            p.glow = neutralGlow;
          }
        }

        const fIdx = Math.min(PARTICLE_COUNT - 1, Math.max(0, focusedIdxRef.current));
        const damp = advance ? 1 - Math.exp(-8 * dt) : 1;
        beaconX += (worldX[fIdx] - beaconX) * damp;
        beaconY += (worldY[fIdx] - beaconY) * damp;
        beaconZ += (worldZ[fIdx] - beaconZ) * damp;

        ctx.clearRect(0, 0, width, height);

        // Subtle proximity mesh lines
        ctx.lineWidth = 1;
        ctx.strokeStyle = linkStroke;
        ctx.beginPath();
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const xi = worldX[i];
          const yi = worldY[i];
          const zi = worldZ[i];
          for (let j = i + 1; j < PARTICLE_COUNT; j++) {
            const dx = xi - worldX[j];
            const dy = yi - worldY[j];
            const dz = zi - worldZ[j];
            if (dx * dx + dy * dy + dz * dz < LINK_DIST_SQ) {
              ctx.moveTo(projX[i], projY[i]);
              ctx.lineTo(projX[j], projY[j]);
            }
          }
        }
        ctx.stroke();

        // Depth-sort nodes (back to front)
        projected.sort((a, b) => a.depth - b.depth);

        for (let k = 0; k < PARTICLE_COUNT; k++) {
          const node = projected[k];
          const depthAlpha = Math.max(0.42, Math.min(1, 0.72 + node.depth * 0.14));

          // Soft halo
          ctx.fillStyle = node.glow;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, node.radius * 2.1, 0, Math.PI * 2);
          ctx.fill();

          // Core sphere
          ctx.globalAlpha = depthAlpha;
          ctx.fillStyle = node.color;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, node.radius, 0, Math.PI * 2);
          ctx.fill();

          // Specular dot
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.beginPath();
          ctx.arc(
            node.sx - node.radius * 0.28,
            node.sy - node.radius * 0.28,
            Math.max(0.8, node.radius * 0.32),
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Focused Trade Gyroscope Beacon
        const bp = projectPoint(
          beaconX,
          beaconY,
          beaconZ,
          cosY,
          sinY,
          cosX,
          sinX,
          focal,
          cx,
          cy
        );
        const unitR = Math.max(12, bp.scale * 0.44);
        const focusedTrade = currentTrades[fIdx];
        const beaconCoreColor =
          focusedTrade && Number(focusedTrade.pnlUsd) < 0 ? lossColor : winColor;

        // Soft radial anchor glow
        const halo = ctx.createRadialGradient(bp.sx, bp.sy, 2, bp.sx, bp.sy, unitR * 1.45);
        halo.addColorStop(0, isDark ? 'rgba(37, 99, 235, 0.34)' : 'rgba(7, 82, 232, 0.22)');
        halo.addColorStop(1, 'rgba(7, 82, 232, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(bp.sx, bp.sy, unitR * 1.45, 0, Math.PI * 2);
        ctx.fill();

        // Outer gimbal ring
        ctx.save();
        ctx.translate(bp.sx, bp.sy);
        ctx.rotate(outerAngle * 0.45);
        ctx.strokeStyle = outerRingColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 0, unitR, Math.max(3, unitR * (0.34 + 0.24 * Math.abs(Math.cos(outerAngle)))), 0, 0, Math.PI * 2);
        ctx.stroke();

        // Inner orthogonal gimbal ring
        ctx.rotate(-outerAngle * 0.45 + innerAngle * 0.65 + Math.PI / 3);
        ctx.strokeStyle = innerRingColor;
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(0, 0, unitR * 0.72, Math.max(2.5, unitR * 0.28), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Central octahedral crystal core
        ctx.rotate(crystalAngle * 0.5);
        const cR = unitR * 0.36;
        ctx.fillStyle = beaconCoreColor;
        ctx.beginPath();
        ctx.moveTo(0, -cR);
        ctx.lineTo(cR * 0.82, 0);
        ctx.lineTo(0, cR);
        ctx.lineTo(-cR * 0.82, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      };

      const scheduleNext = () => {
        if (disposed || reducedMotion || !inViewport || document.visibilityState === 'hidden') {
          rafId = 0;
          return;
        }
        rafId = window.requestAnimationFrame(tick);
      };

      const tick = () => {
        rafId = 0;
        if (disposed || !inViewport || document.visibilityState === 'hidden') return;
        drawFrame(true);
        if (isPlayingRef.current && !reducedMotion) {
          scheduleNext();
        }
      };

      const kickLoop = () => {
        if (disposed) return;
        if (isPlayingRef.current && !reducedMotion && inViewport && document.visibilityState === 'visible') {
          if (!rafId) {
            lastTime = performance.now();
            scheduleNext();
          }
        } else {
          drawFrame(false);
        }
      };

      renderOnceRef.current = kickLoop;
      drawFrame(false);
      kickLoop();

      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          kickLoop();
        } else if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          syncSize();
          drawFrame(false);
        });
        resizeObserver.observe(container);
      }
      const onResize = () => {
        syncSize();
        drawFrame(false);
      };
      window.addEventListener('resize', onResize);

      let intersectionObserver: IntersectionObserver | null = null;
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(
          (entries) => {
            inViewport = entries.some((entry) => entry.isIntersecting);
            if (inViewport) {
              kickLoop();
            } else if (rafId) {
              window.cancelAnimationFrame(rafId);
              rafId = 0;
            }
          },
          { threshold: 0.05 }
        );
        intersectionObserver.observe(container);
      }

      return () => {
        disposed = true;
        renderOnceRef.current = null;
        if (rafId) window.cancelAnimationFrame(rafId);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('resize', onResize);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
      };
    }, []);

    const stepFocusedNode = (delta: number) => {
      const count = Math.max(1, Math.min(PARTICLE_COUNT, trades.length || PARTICLE_COUNT));
      setFocusedIdx((prev) => (prev + delta + count) % count);
    };

    const badgeText =
      trades.length > 0 && trades[focusedIdx]
        ? `${trades.length} ${t('Nodes', 'โหนด')} · ${trades[focusedIdx].id} (${fmtUSD(trades[focusedIdx].pnlUsd, true)})`
        : t('3D Kinetic Nodes (55mm)', 'โหนดเคลื่อนไหว 3 มิติ (55 มม.)');

    return (
      <div className="three-canvas-container" id="three-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        <span className="three-badge" id="three-node-status">
          {badgeText}
        </span>
        <div className="three-hud-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              className="three-ctl-btn"
              onClick={() => setIsPlaying((p) => !p)}
              id="btn-three-play"
            >
              {isPlaying ? t('Pause', 'พัก') : t('Play', 'เล่น')}
            </button>
            <button
              type="button"
              className="three-ctl-btn"
              onClick={() => stepFocusedNode(-1)}
              title={t('Focus Previous Trade', 'ดูรายการเทรดก่อนหน้า')}
            >
              {t('Prev', 'ก่อนหน้า')}
            </button>
            <button
              type="button"
              className="three-ctl-btn"
              onClick={() => stepFocusedNode(1)}
              title={t('Focus Next Trade', 'ดูรายการเทรดถัดไป')}
            >
              {t('Next', 'ถัดไป')}
            </button>
          </div>
          <span className="mono" ref={frameReadoutRef} style={{ color: 'var(--text-secondary)' }}>
            000f / 300f
          </span>
        </div>
      </div>
    );
  }
);

KineticNodesCanvas.displayName = 'KineticNodesCanvas';
