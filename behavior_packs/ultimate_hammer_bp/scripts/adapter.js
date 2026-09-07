/**
 * Ultimate Hammer — API Adapter (Minecraft → HammerInput).
 * Единственный модуль, знающий про @minecraft/server.
 * Вся математика ниже по конвейеру от имён событий не зависит (ТЗ 07_API).
 *
 * Источники точки взаимодействия (faceLocation в 2.10.0-beta НЕТ в
 * PlayerStartBreakingBlockAfterEvent — проверено по официальному .d.ts):
 *   1) BlockRaycastHit.faceLocation от player.getBlockFromViewDirection()
 *      — точные движковые данные луча прицела (PC и touch);
 *   2) playerInteractWithBlock (before) — последний точный тап (touch).
 */

import { world } from "@minecraft/server";

const lastInteract = new Map(); // player.id → {blockLocation, face, faceLocation, first, ts}

let rawEventDumped = false;

/**
 * Рантайм-верификация API (ТЗ 07: «нельзя переносить свойство без проверки»).
 * При ПЕРВОМ событии разрушения пишет в лог фактический состав объекта события:
 * если движок 1.26.44 реально передаёт faceLocation (вопреки .d.ts) — это будет видно.
 */
export function dumpRawEventOnce(ev) {
  if (rawEventDumped) return;
  rawEventDumped = true;
  try {
    const keys = Object.keys(ev).sort().join(",");
    const hasFaceLocation = "faceLocation" in ev;
    console.warn(`[UHD]{"rawEvent":"playerStartBreakingBlock","keys":"${keys}","runtimeHasFaceLocation":${hasFaceLocation}}`);
  } catch (e) {
    console.warn("[UH] raw event dump failed: " + e);
  }
}

export function initAdapter() {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    lastInteract.set(ev.player.id, {
      blockLocation: { ...ev.block.location },
      face: String(ev.blockFace),
      faceLocation: { x: ev.faceLocation.x, y: ev.faceLocation.y, z: ev.faceLocation.z },
      first: ev.isFirstEvent === true,
      ts: Date.now(),
    });
  });
}

function sameBlock(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * @param {import("@minecraft/server").PlayerStartBreakingBlockAfterEvent} ev
 * @returns {HammerInput}
 */
export function buildInput(ev) {
  const player = ev.player;
  const block = ev.block;
  const blockLocation = { ...block.location };

  // 1) Точка взаимодействия из луча прицела (основной источник).
  let rayHit = null;
  try {
    const hit = player.getBlockFromViewDirection({ includeLiquidBlocks: false, includePassableBlocks: false });
    if (hit && sameBlock(hit.block.location, blockLocation)) {
      rayHit = { face: String(hit.face), faceLocation: { x: hit.faceLocation.x, y: hit.faceLocation.y, z: hit.faceLocation.z } };
    }
  } catch { /* луч не построился — есть fallback */ }

  // 2) Последний точный тап по этому же блоку (touch).
  let interactHit = null;
  const inter = lastInteract.get(player.id);
  if (inter && sameBlock(inter.blockLocation, blockLocation)) {
    interactHit = inter;
  }

  const useRay = rayHit !== null;
  const useInteract = !useRay && interactHit !== null;
  const faceLocation = useRay ? rayHit.faceLocation : useInteract ? interactHit.faceLocation : null;
  const faceLocationSource = useRay ? "ray_hit" : useInteract ? "interact" : "none";
  // ray_hit согласован с прицелом по определению; interact — тап, требующий проверки свежести.
  const faceLocationAgeMs = useInteract ? Date.now() - interactHit.ts : 0;

  let eyeLocation = null, viewDirection = null, playerLocation = null, isSneaking = false;
  try {
    eyeLocation = { ...player.getHeadLocation() };
    viewDirection = { ...player.getViewDirection() };
    playerLocation = { ...player.location };
    isSneaking = player.isSneaking === true;
  } catch { /* игрок невалиден — дальше пайплайн сам отбросит */ }

  return {
    player, // живая ссылка нужна исполнителю; в чистых тестах не участвует
    dimension: ev.dimension,
    blockLocation,
    face: String(ev.face),
    hitFace: rayHit ? rayHit.face : interactHit ? interactHit.face : null,
    faceLocation,
    faceLocationSource,
    faceLocationAgeMs,
    playerLocation,
    eyeLocation,
    viewDirection,
    isSneaking,
    heldItem: ev.heldItemStack ?? null,
    ts: Date.now(),
  };
}

/** Очистка карт при выходе игрока. */
export function trackPlayerLifecycle() {
  world.afterEvents.playerLeave.subscribe((ev) => {
    lastInteract.delete(ev.playerId);
  });
}
