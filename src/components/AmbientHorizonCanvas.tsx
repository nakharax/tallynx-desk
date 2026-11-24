import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { deskText, type DeskLanguage } from '../utils/deskI18n';

export type BackgroundStyle = 'aurora_fluid' | 'minimal_grid' | 'clean_off';

interface AmbientHorizonCanvasProps {
  activePort?: string;
  lang?: DeskLanguage;
}

export const AmbientHorizonCanvas: React.FC<AmbientHorizonCanvasProps> = ({ activePort, lang = 'en' }) => {
  const t = (en: string, th: string) => deskText(lang, en, th);
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Read saved preference or default to clean 'aurora_fluid'
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>(() => {
    try {
      const saved = localStorage.getItem('nx_ghr_bg_style');
      if (saved === 'aurora_fluid' || saved === 'minimal_grid' || saved === 'clean_off') {
        return saved as BackgroundStyle;
      }
    } catch {}
    return 'aurora_fluid';
  });

  const [opacityPercent, setOpacityPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nx_ghr_bg_opacity');
      if (saved) return Math.min(100, Math.max(10, Number(saved)));
    } catch {}
    return 65;
  });

  const [dockCollapsed, setDockCollapsed] = useState<boolean>(true);

  // Sync preference to localStorage
  const handleStyleChange = (style: BackgroundStyle) => {
    setBgStyle(style);
    try {
      localStorage.setItem('nx_ghr_bg_style', style);
    } catch {}
  };

  const handleOpacityChange = (val: number) => {
    setOpacityPercent(val);
    try {
      localStorage.setItem('nx_ghr_bg_opacity', String(val));
    } catch {}
  };

  const styleRef = useRef(bgStyle);
  const opacityRef = useRef(opacityPercent);
  const activePortRef = useRef(activePort);

  useEffect(() => {
    styleRef.current = bgStyle;
  }, [bgStyle]);

  useEffect(() => {
    opacityRef.current = opacityPercent;
  }, [opacityPercent]);

  useEffect(() => {
    activePortRef.current = activePort;
  }, [activePort]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'default',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / Math.max(window.innerHeight, 1),
      1,
      250
    );
    camera.position.set(0, 18, 70);
    camera.lookAt(0, -6, 0);

    // 1. Soft Disc Particle Texture
    const particleTex = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.7)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    })();

    // 2. Soft Aurora Nebula Sprites (Subtle glowing light pools in the horizon)
    const nebulaTex = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.45)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    })();

    const nebulaGroup = new THREE.Group();
    const nebulaConfigs = [
      { x: -32, y: 12, z: -40, scale: 65, color: 0x92400e },
      { x: 30, y: 16, z: -35, scale: 75, color: 0x737373 },
      { x: 0, y: -2, z: -25, scale: 55, color: 0x881337 },
    ];
    const nebulaSprites = nebulaConfigs.map((cfg) => {
      const mat = new THREE.SpriteMaterial({
        map: nebulaTex,
        color: cfg.color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(cfg.x, cfg.y, cfg.z);
      sp.scale.set(cfg.scale, cfg.scale * 0.55, 1);
      nebulaGroup.add(sp);
      return { sp, cfg, mat };
    });
    scene.add(nebulaGroup);

    // 3. Calm Topographical Mesh (Gentle fluid wave)
    const gridCols = 36;
    const gridRows = 20;
    const totalPts = gridCols * gridRows;
    const waveGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(totalPts * 3);
    const colors = new Float32Array(totalPts * 3);

    let pIdx = 0;
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        positions[pIdx * 3] = (c - (gridCols - 1) / 2) * 4.6;
        positions[pIdx * 3 + 1] = -14;
        positions[pIdx * 3 + 2] = (r - (gridRows - 1) / 2) * 4.2;
        colors[pIdx * 3] = 0.45;
        colors[pIdx * 3 + 1] = 0.45;
        colors[pIdx * 3 + 2] = 0.45;
        pIdx++;
      }
    }
    waveGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    waveGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const waveIndices: number[] = [];
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const curr = r * gridCols + c;
        if (c + 1 < gridCols) waveIndices.push(curr, curr + 1);
        if (r + 1 < gridRows) waveIndices.push(curr, curr + gridCols);
      }
    }
    waveGeo.setIndex(waveIndices);

    const waveLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const waveWireframe = new THREE.LineSegments(waveGeo, waveLineMat);
    scene.add(waveWireframe);

    const wavePointsMat = new THREE.PointsMaterial({
      size: 2.2,
      map: particleTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.38,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const wavePoints = new THREE.Points(waveGeo, wavePointsMat);
    scene.add(wavePoints);

    // 4. Subtle Floating Bokeh Dust (Soft orderflow particles)
    const dustCount = 45;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    const dustMeta: Array<{ speedY: number; driftX: number; offset: number }> = [];

    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 150;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 70 - 10;
      dustMeta.push({
        speedY: 0.015 + Math.random() * 0.025,
        driftX: 0.2 + Math.random() * 0.5,
        offset: Math.random() * Math.PI * 2,
      });
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 2.8,
      map: particleTex,
      color: 0x92400e,
      transparent: true,
      opacity: 0.22,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // Mouse Parallax & Scroll Glide
    let mouseNormX = 0;
    let mouseNormY = 0;
    let smoothMouseX = 0;
    let smoothMouseY = 0;
    let scrollOffset = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseNormX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseNormY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const onScroll = () => {
      scrollOffset = window.pageYOffset || document.documentElement.scrollTop || 0;
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const colorLow = new THREE.Color(0x881337);
    const colorHigh = new THREE.Color(0x92400e);
    const colorTemp = new THREE.Color();

    let disposed = false;
    let rafId = 0;
    let t = 0;

    const tick = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      const currentStyle = styleRef.current;
      const opacityFactor = opacityRef.current / 100;

      // If user selected 'clean_off', clear the canvas and skip rendering
      if (currentStyle === 'clean_off') {
        renderer.clear();
        return;
      }

      t += 0.009;

      const isFunded = activePortRef.current === 'funded';
      colorLow.setHex(isFunded ? 0x065f46 : 0x881337);
      colorHigh.setHex(isFunded ? 0x86c4ad : 0x92400e);

      const isDark = document.body.classList.contains('dark-mode');

      // Visibility and style-specific rendering
      if (currentStyle === 'minimal_grid') {
        // Flat, still architectural grid without distracting waves or sprites
        nebulaGroup.visible = false;
        dustPoints.visible = false;
        wavePoints.visible = false;
        waveWireframe.visible = true;

        waveLineMat.opacity = 0.08 * opacityFactor;
        const posArr = waveGeo.attributes.position.array as Float32Array;
        const colArr = waveGeo.attributes.color.array as Float32Array;
        for (let i = 0; i < totalPts; i++) {
          posArr[i * 3 + 1] = -14;
          colArr[i * 3] = isDark ? 0.35 : 0.45;
          colArr[i * 3 + 1] = isDark ? 0.38 : 0.48;
          colArr[i * 3 + 2] = isDark ? 0.45 : 0.55;
        }
        waveGeo.attributes.position.needsUpdate = true;
        waveGeo.attributes.color.needsUpdate = true;
      } else {
        // 'aurora_fluid': Soft, calming fluid wave + gentle glowing nebulas
        nebulaGroup.visible = true;
        dustPoints.visible = true;
        wavePoints.visible = true;
        waveWireframe.visible = true;

        waveLineMat.opacity = (isDark ? 0.16 : 0.11) * opacityFactor;
        wavePointsMat.opacity = (isDark ? 0.42 : 0.28) * opacityFactor;
        dustMat.opacity = (isDark ? 0.32 : 0.2) * opacityFactor;
        dustMat.color.copy(colorLow);

        // Animate gentle nebulas
        nebulaSprites.forEach(({ sp, cfg, mat }, idx) => {
          mat.color.setHex(isFunded ? 0x065f46 : cfg.color);
          mat.opacity = (isDark ? 0.22 : 0.14) * opacityFactor;
          sp.position.set(
            cfg.x + Math.sin(t * 0.35 + idx * 1.5) * 3.5,
            cfg.y + Math.cos(t * 0.25 + idx) * 2.0,
            cfg.z
          );
        });

        // Animate soft wave elevation
        const posArr = waveGeo.attributes.position.array as Float32Array;
        const colArr = waveGeo.attributes.color.array as Float32Array;
        const cursorWorldX = smoothMouseX * 45;
        const cursorWorldZ = smoothMouseY * 25;

        let idx = 0;
        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            const x = posArr[idx * 3];
            const z = posArr[idx * 3 + 2];

            const dx = x - cursorWorldX;
            const dz = z - cursorWorldZ;
            const distSq = dx * dx + dz * dz;
            const ripple =
              Math.exp(-distSq / 300) * Math.cos(Math.sqrt(distSq) * 0.3 - t * 2.2) * 1.6;

            const elevation =
              Math.sin(x * 0.065 + t) * 1.8 +
              Math.cos(z * 0.085 + t * 0.7) * 1.4 +
              Math.sin((x + z) * 0.04 - t * 0.5) * 0.9 +
              ripple;

            posArr[idx * 3 + 1] = elevation - 14;

            const normH = Math.max(0, Math.min(1, (elevation + 4) / 8));
            colorTemp.copy(colorLow).lerp(colorHigh, normH);
            colArr[idx * 3] = colorTemp.r;
            colArr[idx * 3 + 1] = colorTemp.g;
            colArr[idx * 3 + 2] = colorTemp.b;
            idx++;
          }
        }
        waveGeo.attributes.position.needsUpdate = true;
        waveGeo.attributes.color.needsUpdate = true;

        // Floating dust drift
        const dArr = dustGeo.attributes.position.array as Float32Array;
        for (let d = 0; d < dustCount; d++) {
          const meta = dustMeta[d];
          let ny = dArr[d * 3 + 1] + meta.speedY;
          if (ny > 28) ny = -24;
          dArr[d * 3 + 1] = ny;
          dArr[d * 3] += Math.sin(t * meta.driftX + meta.offset) * 0.015;
        }
        dustGeo.attributes.position.needsUpdate = true;
      }

      // Smooth Camera Parallax
      smoothMouseX += (mouseNormX - smoothMouseX) * 0.04;
      smoothMouseY += (mouseNormY - smoothMouseY) * 0.04;

      const targetCamX = smoothMouseX * 5.2;
      const targetCamY = 18 - smoothMouseY * 3.0 - Math.min(6, scrollOffset * 0.0035);
      camera.position.set(targetCamX, targetCamY, 70);
      camera.lookAt(0, -6, 0);

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);

      particleTex.dispose();
      nebulaTex.dispose();
      waveGeo.dispose();
      waveLineMat.dispose();
      wavePointsMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      nebulaSprites.forEach((n) => n.mat.dispose());
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <div id="bg-3d-canvas" ref={mountRef} aria-hidden="true" />

      {/* Discrete bottom dock to control background style & opacity */}
      <aside className={`bg3d-control-dock ${dockCollapsed ? 'is-collapsed' : ''}`}>
        {dockCollapsed ? (
          <div className="bg3d-dock-compact-bar">
            <button
              type="button"
              className="bg3d-dock-expand-btn"
              onClick={() => setDockCollapsed(false)}
              title={t('Background Settings', 'ตั้งค่าพื้นหลัง')}
            >
              <span className="bg3d-live-indicator" />
              <span>
                {bgStyle === 'clean_off'
                  ? t('Background: Off', 'พื้นหลัง: ปิด')
                  : bgStyle === 'minimal_grid'
                  ? t('Background: Grid', 'พื้นหลัง: ตาราง')
                  : t('Background: Soft Aurora', 'พื้นหลัง: แสงออโรรา')}
              </span>
              <span style={{ opacity: 0.6, fontSize: 10 }}>({opacityPercent}%)</span>
            </button>
          </div>
        ) : (
          <div className="bg3d-dock-panel">
            <div className="bg3d-dock-group">
              <span className="bg3d-dock-label">{t('Background Style', 'รูปแบบพื้นหลัง')}</span>
              <div className="bg3d-seg-group" role="group" aria-label={t('Background Style', 'รูปแบบพื้นหลัง')}>
                <button
                  type="button"
                  className={`bg3d-seg-btn ${bgStyle === 'aurora_fluid' ? 'active' : ''}`}
                  onClick={() => handleStyleChange('aurora_fluid')}
                >
                  {t('Soft Aurora', 'แสงออโรรา')}
                </button>
                <button
                  type="button"
                  className={`bg3d-seg-btn ${bgStyle === 'minimal_grid' ? 'active' : ''}`}
                  onClick={() => handleStyleChange('minimal_grid')}
                >
                  {t('Minimal Grid', 'ตารางแบบเรียบ')}
                </button>
                <button
                  type="button"
                  className={`bg3d-seg-btn ${bgStyle === 'clean_off' ? 'active' : ''}`}
                  onClick={() => handleStyleChange('clean_off')}
                >
                  {t('Turn Off 3D', 'ปิดพื้นหลัง 3 มิติ')}
                </button>
              </div>
            </div>

            <div className="bg3d-dock-divider" />

            <div className="bg3d-dock-group">
              <span className="bg3d-dock-label">{t('Opacity', 'ความเข้ม')}</span>
              <div className="bg3d-seg-group" role="group" aria-label={t('Background Opacity', 'ความเข้มพื้นหลัง')}>
                {[30, 65, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={`bg3d-seg-btn mono ${opacityPercent === pct ? 'active' : ''}`}
                    onClick={() => handleOpacityChange(pct)}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="bg3d-dock-divider" />

            <div className="bg3d-dock-actions">
              <button
                type="button"
                className="bg3d-collapse-btn"
                onClick={() => setDockCollapsed(true)}
                title={t('Collapse Background Controls', 'ย่อแผงควบคุมพื้นหลัง')}
              >
                ▾ {t('Hide', 'ซ่อน')}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
