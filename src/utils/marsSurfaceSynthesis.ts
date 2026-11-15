import * as Cesium from 'cesium';
import { MARS_EQUATORIAL_RADIUS_M } from './coordinates';

// Precomputed 256-entry Martian Regolith Color Ramp matching the Viking/Orbital Mars Globe palette:
// deep crater shadows (#1d100d) -> basaltic umber (#5b352b) -> rusty regolith (#8e5847) -> sunlit dust (#c99c8a) -> bright rim (#e5cfc4)
const MARS_LUT_R = new Uint8Array(256);
const MARS_LUT_G = new Uint8Array(256);
const MARS_LUT_B = new Uint8Array(256);

(function buildMarsPaletteLut() {
  const stops: Array<[number, number, number, number]> = [
    [0, 26, 15, 13],
    [42, 54, 31, 26],
    [88, 94, 56, 46],
    [136, 136, 84, 68],
    [182, 174, 118, 99],
    [220, 208, 166, 150],
    [255, 236, 216, 206],
  ];

  for (let i = 0; i < 256; i++) {
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (i >= stops[k][0] && i <= stops[k + 1][0]) {
        s0 = stops[k];
        s1 = stops[k + 1];
        break;
      }
    }
    const span = Math.max(1, s1[0] - s0[0]);
    const t = (i - s0[0]) / span;
    MARS_LUT_R[i] = Math.round(s0[1] + (s1[1] - s0[1]) * t);
    MARS_LUT_G[i] = Math.round(s0[2] + (s1[2] - s0[2]) * t);
    MARS_LUT_B[i] = Math.round(s0[3] + (s1[3] - s0[3]) * t);
  }
})();

// Fast deterministic integer hash returning [0, 1)
function hash2D(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// Fast smooth 2D value noise in [-1, 1]
function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const v00 = hash2D(ix, iy, seed);
  const v10 = hash2D(ix + 1, iy, seed);
  const v01 = hash2D(ix, iy + 1, seed);
  const v11 = hash2D(ix + 1, iy + 1, seed);

  const a = v00 + (v10 - v00) * ux;
  const b = v01 + (v11 - v01) * ux;
  return (a + (b - a) * uy) * 2 - 1;
}

// O(1) cell-bounded impact crater height contribution (returns delta in [-1, +0.35])
// Because each crater is strictly contained inside its cell [0,1]^2, zero neighbor checks are needed and tiles are 100% seamless.
function sampleCellCrater(
  xMeters: number,
  yMeters: number,
  cellSizeM: number,
  densityProb: number,
  seed: number
): { dh: number; bowlMask: number; rimMask: number } {
  const gx = xMeters / cellSizeM;
  const gy = yMeters / cellSizeM;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);

  const spawn = hash2D(ix, iy, seed);
  if (spawn > densityProb) {
    return { dh: 0, bowlMask: 0, rimMask: 0 };
  }

  const cx = 0.28 + hash2D(ix, iy, seed + 17) * 0.44;
  const cy = 0.28 + hash2D(ix, iy, seed + 53) * 0.44;
  const maxR = 0.11 + hash2D(ix, iy, seed + 97) * 0.15; // <= 0.26 -> strictly inside cell

  const dx = gx - ix - cx;
  const dy = gy - iy - cy;
  const rNorm = Math.sqrt(dx * dx + dy * dy) / maxR;

  if (rNorm >= 1.35) {
    return { dh: 0, bowlMask: 0, rimMask: 0 };
  }

  // Subtle natural rim irregularity
  const ang = Math.atan2(dy, dx);
  const wobble = 1 + 0.06 * Math.sin(ang * 3 + spawn * 19) + 0.04 * Math.cos(ang * 5 - spawn * 11);
  const r = rNorm * wobble;

  if (r < 0.78) {
    // Smooth parabolic/flat-floored crater bowl
    const u = r / 0.78;
    const bowl = -(1 - u * u);
    const rimRise = Math.pow(u, 4) * 0.22;
    return { dh: bowl + rimRise, bowlMask: Math.max(0, 1 - u * u), rimMask: 0 };
  } else if (r < 1.32) {
    // Raised crater ejecta rim tapering back to surrounding regolith
    const u = (r - 0.78) / 0.54;
    const rim = (1 - u) * (1 - u) * (1 + u * 0.6) * 0.34;
    return { dh: rim, bowlMask: 0, rimMask: Math.max(0, 1 - u) };
  }

  return { dh: 0, bowlMask: 0, rimMask: 0 };
}

// O(1) cell-bounded angular basalt boulder/rock outcrop for close-up rover & low-flight detail
function sampleCellRock(
  xMeters: number,
  yMeters: number,
  cellSizeM: number,
  densityProb: number,
  seed: number
): { dh: number; rockMask: number } {
  const gx = xMeters / cellSizeM;
  const gy = yMeters / cellSizeM;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);

  const spawn = hash2D(ix, iy, seed);
  if (spawn > densityProb) {
    return { dh: 0, rockMask: 0 };
  }

  const cx = 0.26 + hash2D(ix, iy, seed + 31) * 0.48;
  const cy = 0.26 + hash2D(ix, iy, seed + 71) * 0.48;
  const radius = 0.08 + hash2D(ix, iy, seed + 113) * 0.14;

  const dx = gx - ix - cx;
  const dy = gy - iy - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= radius * 1.35) {
    return { dh: 0, rockMask: 0 };
  }

  const ang = Math.atan2(dy, dx);
  const facets = 1 + 0.16 * Math.cos(ang * 3 + spawn * 23) + 0.11 * Math.sin(ang * 4 - spawn * 13);
  const rn = (dist / radius) * facets;
  if (rn >= 1.0) {
    return { dh: 0, rockMask: 0 };
  }
  const h = Math.sqrt(Math.max(0, 1 - rn * rn));
  return { dh: h, rockMask: Math.min(1, (1 - rn) * 1.8) };
}

/**
 * Deterministic multi-scale Martian micro-relief in meters used identically by:
 * 1. Cesium's 3D terrain heightmap provider (so crater bowls, ridges & crests exist in 3D geometry)
 * 2. Rover 6-wheel rocker-bogie suspension probing (so wheels ride on the actual visible crests)
 */
export function sampleProceduralMarsReliefM(
  latDeg: number,
  lonDeg: number,
  macroSlopeDeg = 0,
  includeMacroCraters = true
): number {
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const northM = latRad * MARS_EQUATORIAL_RADIUS_M;
  const eastM = lonRad * MARS_EQUATORIAL_RADIUS_M * Math.max(0.2, Math.cos(latRad));

  let reliefM = 0;

  if (includeMacroCraters) {
    // Macro craterlets (140 m grid -> 20–70 m craters, ~3.5 m deep) & eroded ridges
    const cMacro = sampleCellCrater(eastM, northM, 145, 0.34, 101);
    reliefM += cMacro.dh * 3.4;

    const cMed = sampleCellCrater(eastM + 41, northM - 29, 38, 0.3, 203);
    reliefM += cMed.dh * 1.25;

    // Gentle bedrock ridge undulation (~45 m & 18 m wavelengths)
    reliefM += valueNoise2D(eastM * 0.022, northM * 0.022, 307) * 1.35;
    reliefM += valueNoise2D(eastM * 0.065, northM * 0.065, 409) * 0.45;
  }

  // Rover-scale regolith hummocks, dune ripples & rocks (4–12 m scale)
  const crestWave =
    valueNoise2D(eastM * 0.19, northM * 0.19, 503) * 0.26 +
    valueNoise2D(eastM * 0.48, northM * 0.48, 607) * 0.11;
  const ripple = Math.sin(eastM * 1.15 + northM * 0.65 + valueNoise2D(eastM * 0.25, northM * 0.25, 709) * 1.4) * 0.045;
  const slopeBoost = 1 + Math.min(0.75, macroSlopeDeg / 20);

  reliefM += (crestWave + ripple) * slopeBoost;

  return reliefM;
}

/**
 * Colorizes grayscale NASA HiRISE & CTX mosaics to match the rich rusty-brown,
 * shadowed crater & sunlit-rim Mars Globe aesthetic (instead of washed-out gray),
 * while boosting micro-contrast and preserving mosaic alpha transparency.
 */
export function wrapWithMarsRegolithColorizer(
  baseProvider: Cesium.UrlTemplateImageryProvider
): Cesium.ImageryProvider {
  const origRequestImage = baseProvider.requestImage.bind(baseProvider);
  const proxyProvider = baseProvider as unknown as Cesium.ImageryProvider;

  proxyProvider.requestImage = (
    x: number,
    y: number,
    level: number,
    request?: Cesium.Request
  ) => {
    const promise = origRequestImage(x, y, level, request);
    if (!promise) return undefined;
    return promise.then((img) => {
      if (!img) return img;
      const w = (img as HTMLImageElement).width;
      const h = (img as HTMLImageElement).height;
      if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
        return img;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return img;

      ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      // Fast luminance extraction for 3x3 unsharp micro-contrast
      const lum = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        lum[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      }

      for (let row = 0; row < h; row++) {
        const rUp = row > 0 ? row - 1 : 0;
        const rDn = row < h - 1 ? row + 1 : h - 1;
        for (let col = 0; col < w; col++) {
          const p = row * w + col;
          const idx = p * 4;
          if (data[idx + 3] === 0) continue;

          const cLt = col > 0 ? col - 1 : 0;
          const cRt = col < w - 1 ? col + 1 : w - 1;

          const center = lum[p];
          const avgNeighbor =
            (lum[rUp * w + col] +
              lum[rDn * w + col] +
              lum[row * w + cLt] +
              lum[row * w + cRt]) >>
            2;

          // Subtle crisp local contrast + stretch midtones so HiRISE craters & dunes pop
          const sharpened = center + ((center - avgNeighbor) * 0.42);
          const contrasted = (sharpened - 128) * 1.18 + 124;
          const lutIdx = contrasted < 0 ? 0 : contrasted > 255 ? 255 : contrasted | 0;

          data[idx] = MARS_LUT_R[lutIdx];
          data[idx + 1] = MARS_LUT_G[lutIdx];
          data[idx + 2] = MARS_LUT_B[lutIdx];
        }
      }

      ctx.putImageData(imageData, 0, 0);
      return canvas;
    });
  };

  return proxyProvider;
}

/**
 * Procedural Multi-Scale Mars Surface Micro-Texture ImageryProvider (Levels 11 -> 21).
 *
 * Bridges the resolution gap between orbital NASA mosaics (232m Viking / 6m CTX / 25cm HiRISE)
 * and low-altitude Flight Simulator (30-150m AGL) / Rover Simulator (2.4-4.6m AGL).
 * Renders seamless, world-locked Martian craters, sunlit crater rims, dark shadow bowls,
 * angular basalt rocks, wind-blown sand ripples, and regolith grit matching the Mars globe.
 */
export function createMarsSurfaceDetailImageryProvider(
  tilingScheme: Cesium.GeographicTilingScheme
): Cesium.ImageryProvider {
  const tileWidth = 256;
  const tileHeight = 256;
  const errorEvent = new Cesium.Event();
  const credit = new Cesium.Credit('Mars Regolith Micro-Relief Detail');

  // Sun coming from WNW/upper-left matching the orbital Mars Globe shading in reference imagery
  const sunX = -0.68;
  const sunY = 0.56;
  const sunZ = 0.48;

  const requestImage = (x: number, y: number, level: number): Promise<HTMLCanvasElement> => {
    if (level < 11) {
      const tiny = document.createElement('canvas');
      tiny.width = 1;
      tiny.height = 1;
      return Promise.resolve(tiny);
    }
    const rect = tilingScheme.tileXYToRectangle(x, y, level);
    const westRad = rect.west;
    const eastRad = rect.east;
    const southRad = rect.south;
    const northRad = rect.north;

    const dLonRad = (eastRad - westRad) / tileWidth;
    const dLatRad = (northRad - southRad) / tileHeight;

    const midLatRad = (northRad + southRad) * 0.5;
    const tileWidthM = Math.max(
      0.5,
      (eastRad - westRad) * MARS_EQUATORIAL_RADIUS_M * Math.max(0.2, Math.cos(midLatRad))
    );
    const pixelScaleM = tileWidthM / tileWidth;

    const canvas = document.createElement('canvas');
    canvas.width = tileWidth;
    canvas.height = tileHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(canvas);

    const imgData = ctx.createImageData(tileWidth, tileHeight);
    const out = imgData.data;

    // Progressive detail fade-in:
    // - Level 11..13: subtle macro craters & roughness blending cleanly over NASA CTX/Viking
    // - Level 14..16 (Flight Sim): crisp craters, rims, rocky ridges & dust streaks
    // - Level 17..21 (Rover Sim): sharp 1cm-20cm pebbles, rocks, aeolian sand ripples & gritty regolith
    const levelAlphaBase =
      level <= 11
        ? 0.26
        : level === 12
        ? 0.36
        : level === 13
        ? 0.48
        : level === 14
        ? 0.58
        : level === 15
        ? 0.68
        : level === 16
        ? 0.76
        : level === 17
        ? 0.82
        : 0.88;

    const useMacroCrater = pixelScaleM < 25;
    const useMedCrater = pixelScaleM < 8;
    const useSmallCraterAndRocks = pixelScaleM < 1.6;
    const usePebblesAndRipples = pixelScaleM < 0.38;

    // Precompute heightfield on (tileWidth + 2) x (tileHeight + 2) for seamless central-difference normals
    const gw = tileWidth + 2;
    const gh = tileHeight + 2;
    const hGrid = new Float32Array(gw * gh);
    const rMaskGrid = new Float32Array(gw * gh);
    const cBowlGrid = new Float32Array(gw * gh);
    const cRimGrid = new Float32Array(gw * gh);

    for (let gy = 0; gy < gh; gy++) {
      const row = gy - 1;
      const latRad = northRad - (row + 0.5) * dLatRad;
      const northM = latRad * MARS_EQUATORIAL_RADIUS_M;
      const eastScale = MARS_EQUATORIAL_RADIUS_M * Math.max(0.2, Math.cos(latRad));

      for (let gx = 0; gx < gw; gx++) {
        const col = gx - 1;
        const lonRad = westRad + (col + 0.5) * dLonRad;
        const eastM = lonRad * eastScale;

        // Multi-scale fractional Brownian motion regolith roughness
        let h =
          valueNoise2D(eastM * 0.018, northM * 0.018, 11) * 1.45 +
          valueNoise2D(eastM * 0.065, northM * 0.065, 23) * 0.72 +
          valueNoise2D(eastM * 0.24, northM * 0.24, 37) * 0.34;

        let bowl = 0;
        let rim = 0;
        let rock = 0;

        if (useMacroCrater) {
          const cm = sampleCellCrater(eastM, northM, 145, 0.36, 101);
          h += cm.dh * 3.1;
          bowl = Math.max(bowl, cm.bowlMask);
          rim = Math.max(rim, cm.rimMask);
        }

        if (useMedCrater) {
          const cd = sampleCellCrater(eastM + 41, northM - 29, 38, 0.34, 203);
          h += cd.dh * 1.35;
          bowl = Math.max(bowl, cd.bowlMask * 0.9);
          rim = Math.max(rim, cd.rimMask * 0.9);
        }

        if (useSmallCraterAndRocks) {
          h += valueNoise2D(eastM * 0.95, northM * 0.95, 59) * 0.18;
          const cs = sampleCellCrater(eastM - 13, northM + 19, 9.5, 0.28, 311);
          h += cs.dh * 0.52;
          bowl = Math.max(bowl, cs.bowlMask * 0.7);
          rim = Math.max(rim, cs.rimMask * 0.8);

          const rk1 = sampleCellRock(eastM, northM, 4.2, 0.42, 419);
          h += rk1.dh * 0.42;
          rock = Math.max(rock, rk1.rockMask);
        }

        if (usePebblesAndRipples) {
          // Wind-sculpted aeolian Martian sand ripples + scattered gravel/pebbles + regolith grain
          const warp = valueNoise2D(eastM * 0.55, northM * 0.55, 521) * 1.6;
          const ripplePhase = eastM * 2.9 + northM * 1.6 + warp;
          const ripple = Math.sin(ripplePhase) * 0.085 + Math.sin(ripplePhase * 2) * 0.02;
          h += ripple;

          const rk2 = sampleCellRock(eastM + 1.3, northM - 0.7, 1.15, 0.48, 613);
          h += rk2.dh * 0.22;
          rock = Math.max(rock, rk2.rockMask * 0.92);

          // Fine centimeter-scale regolith grit
          h += valueNoise2D(eastM * 6.5, northM * 6.5, 733) * 0.055;
          h += valueNoise2D(eastM * 18.0, northM * 18.0, 827) * 0.025;
        }

        const idx = gy * gw + gx;
        hGrid[idx] = h;
        rMaskGrid[idx] = rock;
        cBowlGrid[idx] = bowl;
        cRimGrid[idx] = rim;
      }
    }

    const slopeScale = Math.max(0.08, pixelScaleM * 2.0);

    for (let row = 0; row < tileHeight; row++) {
      const gy = row + 1;
      for (let col = 0; col < tileWidth; col++) {
        const gx = col + 1;
        const gIdx = gy * gw + gx;

        const dzdx = (hGrid[gIdx + 1] - hGrid[gIdx - 1]) / slopeScale;
        const dzdy = (hGrid[(gy - 1) * gw + gx] - hGrid[(gy + 1) * gw + gx]) / slopeScale;

        // Surface normal (nx, ny, nz)
        const invLen = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const nx = -dzdx * invLen;
        const ny = -dzdy * invLen;
        const nz = invLen;

        const ndotl = nx * sunX + ny * sunY + nz * sunZ;
        const shade = Math.max(0.18, Math.min(1.55, 0.58 + ndotl * 1.08));

        const bowl = cBowlGrid[gIdx];
        const rim = cRimGrid[gIdx];
        const rock = rMaskGrid[gIdx];

        // Rich Martian regolith tone anchored to Mars Globe palette:
        // Dark basaltic crater floors, rusty sienna regolith, warm ochre dust, bright sun-facing rims
        let lum = 118 * shade - bowl * 36 + rim * 42 + rock * 14;

        // Subtle regional dusty vs dark-basalt mottling
        const mottle = hGrid[gIdx] * 7.5;
        lum += mottle;

        const lutIdx = lum < 0 ? 0 : lum > 255 ? 255 : lum | 0;
        let r = MARS_LUT_R[lutIdx];
        let g = MARS_LUT_G[lutIdx];
        let b = MARS_LUT_B[lutIdx];

        // Exposed angular basalt rocks have slightly cooler dark-gray/umber slate tone
        if (rock > 0.15) {
          const rockMix = Math.min(0.42, rock * 0.42);
          const rockLum = Math.max(24, Math.min(220, 92 * shade));
          r = Math.round(r * (1 - rockMix) + rockLum * 1.05 * rockMix);
          g = Math.round(g * (1 - rockMix) + rockLum * 0.88 * rockMix);
          b = Math.round(b * (1 - rockMix) + rockLum * 0.82 * rockMix);
        }

        // Alpha is strongest where relief/shadow/rim/rock detail is prominent so underlying NASA craters shine through
        const detailStrength = Math.min(1, Math.abs(ndotl - 0.35) * 0.9 + bowl * 0.45 + rim * 0.5 + rock * 0.65);
        const alphaFloat = Math.min(0.95, levelAlphaBase * (0.62 + 0.38 * detailStrength));

        const pIdx = (row * tileWidth + col) * 4;
        out[pIdx] = r;
        out[pIdx + 1] = g;
        out[pIdx + 2] = b;
        out[pIdx + 3] = Math.round(alphaFloat * 255);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return Promise.resolve(canvas);
  };

  return {
    proxy: new Cesium.DefaultProxy(''),
    tileWidth,
    tileHeight,
    maximumLevel: 21,
    minimumLevel: 0,
    tilingScheme,
    rectangle: Cesium.Rectangle.MAX_VALUE,
    tileDiscardPolicy: undefined as unknown as Cesium.TileDiscardPolicy,
    errorEvent,
    credit,
    hasAlphaChannel: true,
    getTileCredits: () => [],
    requestImage,
    pickFeatures: () => undefined,
  } as unknown as Cesium.ImageryProvider;
}
