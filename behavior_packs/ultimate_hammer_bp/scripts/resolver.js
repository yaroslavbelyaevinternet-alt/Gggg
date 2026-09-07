/**
 * Ultimate Hammer — Direction Resolver.
 * HammerInput → HammerDecision. ЧИСТАЯ математика: никакого @minecraft/server,
 * никакого изменения мира.
 *
 * ПРАВИЛО v1.2.0 (по требованию владельца проекта): строго по ГРАНИ.
 *   North/South → вертикальная плоскость X/Y.
 *   West/East   → вертикальная плоскость Z/Y.
 *   Up/Down     → горизонтальная плоскость X/Z (яма/потолок). ВСЕГДА.
 *
 * Направление взгляда НЕ участвует в решении (touch-игрок может смотреть в
 * одну сторону, а тапать по блоку в другой; взгляд — только в debug-логе).
 * faceLocation используется для зон диагностики (центр/переход/периферия),
 * но не меняет плоскость: у грани ровно одна плоскость — неоднозначности нет,
 * дрожание и «лотерея» невозможны архитектурно.
 */

import { planeForFace } from "./area.js";

const SIDE_FACES = new Set(["North", "South", "West", "East"]);

export function toLocal(faceLocation) {
  if (!faceLocation || typeof faceLocation.x !== "number" || typeof faceLocation.z !== "number") return null;
  return { x: clamp(faceLocation.x - 0.5, -0.5, 0.5), z: clamp(faceLocation.z - 0.5, -0.5, 0.5) };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Смещение игрока (центр тела) от центра блока. Только для debug-лога. */
export function playerDelta(input) {
  const b = input.blockLocation, p = input.playerLocation;
  if (!b || !p) return null;
  return { x: p.x - (b.x + 0.5), z: p.z - (b.z + 0.5), y: p.y - b.y };
}

/**
 * @param input HammerInput (см. adapter.js)
 * @param cfg CONFIG.direction (пороги зон — только для диагностики)
 * @param memory {last?: {plane}} — память игрока (гистерезис оставлен для совместимости;
 *        при детерминации по грани плоскость однозначна, смена всегда уверенная)
 */
export function resolveDirection(input, cfg, memory) {
  const reasons = [];
  const face = input.face;

  if (SIDE_FACES.has(face)) {
    reasons.push(`face=${face} → боковая грань: вертикальная плоскость ${planeLabel(planeForFace(face))}`);
    return {
      plane: planeForFace(face), confidence: 1.0, zone: "side",
      local: toLocal(input.faceLocation), delta: playerDelta(input),
      reasons, source: "face",
    };
  }

  if (face !== "Up" && face !== "Down") {
    reasons.push(`face=${face} не распознан → безопасный выбор X/Z`);
    return { plane: "xz", confidence: 0.1, zone: "fallback", local: null, delta: playerDelta(input), reasons, source: "fallback" };
  }

  // Up/Down → ВСЕГДА горизонтальная плоскость X/Z.
  const local = toLocal(input.faceLocation);
  const edge = local ? Math.max(Math.abs(local.x), Math.abs(local.z)) : null;
  const zone = edge == null ? "no_point"
    : edge <= cfg.coreRadius ? "core"
    : edge < cfg.peripheryRadius ? "transition" : "periphery";

  reasons.push(`face=${face} → горизонтальная плоскость X/Z (строго по грани)`);
  if (local) reasons.push(`точка=${input.faceLocationSource ?? "none"} local(${local.x.toFixed(2)}, ${local.z.toFixed(2)}), зона=${zone} (диагностика, на плоскость не влияет)`);

  return { plane: "xz", confidence: 1.0, zone, local, delta: playerDelta(input), reasons, source: "face" };
}

export function planeLabel(plane) {
  return plane === "xz" ? "X/Z" : plane === "xy" ? "X/Y" : plane === "zy" ? "Z/Y" : String(plane);
}
