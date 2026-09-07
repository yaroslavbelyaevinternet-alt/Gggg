/**
 * Ultimate Hammer — Break Executor.
 * Единственный модуль, изменяющий мир. Направление ему прилетает уже решённым.
 *
 * Модель срыва: pending-запись создаётся на playerStartBreakingBlock;
 * зона сносится в момент, когда центральный блок реально разрушен
 * (afterEvents.playerBreakBlock — выживание; контроль тиков ловит creative/крайние случаи).
 * Это даёт честную ванильную скорость+энчанты на центре и нулевые дюпы.
 */

import { system } from "@minecraft/server";
import { HAMMERS } from "./detector.js";
import { generatePlane } from "./area.js";
import { evaluateBlock } from "./filter.js";
import { budgetFor, applyCost, remainingDurability } from "./durability.js";
import { collectDrop } from "./drop.js";
import * as logger from "./logger.js";
import { CONFIG } from "./config.js";

/** playerId → pending */
const pending = new Map();
/** playerId → последний старт (для восстановления зоны при гонках) */
const recentStarts = new Map();
const stats = { swings: 0, blocks: 0, byZone: {}, byPlane: {}, started: 0 };

export function pendingCount() { return pending.size; }

function keyOf(loc) { return `${loc.x}|${loc.y}|${loc.z}`; }

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Вызывается из main.js на playerStartBreakingBlock. */
export function startBreak(input, decision, descriptor, radius) {
  const player = input.player;
  stats.started++;
  if (radius === 0) {
    // 1×1: работает чистый ваниль — ломается только центр. Логируем решение для данных.
    logger.logDecision(buildLogEntry(input, decision, radius, { destroyed: 1, skipped: 0, cost: 0, trimmed: false, ids: [input.blockLocation] }));
    logger.actionbar(player, decision, { destroyed: 1, skipped: 0, trimmed: false, sizeLabel: "1×1" }, input.faceLocationSource);
    return;
  }

  pending.set(player.id, {
    playerId: player.id,
    player, // ссылка живая, проверяем isValid()
    dimension: input.dimension,
    center: { ...input.blockLocation },
    plane: decision.plane,
    radius,
    startedTick: system.currentTick,
    cancelledTick: 0,
    executed: false,
    descriptor,
    input, decision,
  });
  // Помним последний старт: если pending потерян гонкой — восстановим зону по нему.
  recentStarts.set(player.id, { input, decision, descriptor, radius, tick: system.currentTick });
}

/** Центральный блок разрушен игроком → сносим зону. */
export function onBreak(ev) {
  const p = pending.get(ev.player.id);
  if (p && !p.executed) {
    if (keyOf(ev.block.location) !== keyOf(p.center)) {
      // Игрок сломал ДРУГОЙ блок (цепочка копания) — наш pending не трогаем:
      // он исполнится по своему break или снятся watcher'ом. Раньше здесь был
      // баг: pending удалялся и зона терялась («молот сломал только 1 блок»).
      return;
    }
    executeZone(p);
    return;
  }
  // pending нет (гонка cancel-перед-break, повторный start и т.п.) —
  // восстанавливаем решение по последнему старту этого игрока.
  const rs = recentStarts.get(ev.player.id);
  if (rs && system.currentTick - rs.tick <= 60 && keyOf(rs.input.blockLocation) === keyOf(ev.block.location)) {
    executeZone({
      playerId: ev.player.id,
      player: ev.player,
      dimension: rs.input.dimension,
      center: { ...rs.input.blockLocation },
      plane: rs.decision.plane,
      radius: rs.radius,
      startedTick: rs.tick,
      cancelledTick: 0,
      executed: false,
      descriptor: rs.descriptor,
      input: rs.input,
      decision: rs.decision,
    });
  }
}

/** Игрок отпустил ЛКМ / сменил цель. НЕ удаляем сразу: в Bedrock cancel может
 *  прилететь непосредственно ПЕРЕД фактическим break — grace 10 тиков. */
export function onCancel(ev) {
  const p = pending.get(ev.player.id);
  if (p && !p.executed) p.cancelledTick = system.currentTick;
}

/** Тиковый контроль: creative-снос центра, grace отмены, забытые pending. */
export function startWatcher() {
  system.runInterval(() => {
    const tick = system.currentTick;
    for (const [id, p] of pending) {
      if (p.executed) { pending.delete(id); continue; }
      const age = tick - p.startedTick;
      if (age > 1200) { pending.delete(id); continue; } // минута без прогресса
      // Grace отмены: 10 тиков после cancel break уже не придёт
      if (p.cancelledTick && tick - p.cancelledTick > 10) { pending.delete(id); continue; }
      if (age < CONFIG.breaking.minBreakTicks) continue;
      let ok = false;
      try {
        ok = p.player.isValid === undefined || p.player.isValid === true;
      } catch { ok = false; }
      if (!ok) { pending.delete(id); continue; }
      // Центр уже исчез (creative / внешний cause), молот всё ещё в руке, дистанция в норме?
      let centerGone = false, holdingHammer = false, inReach = true;
      try {
        const block = p.dimension.getBlock(p.center);
        centerGone = !block || block.isAir;
        const inv = p.player.getComponent("minecraft:inventory");
        const slot = typeof p.player.selectedSlotIndex === "number" ? p.player.selectedSlotIndex : 0;
        const held = inv.container.getSlot(slot).getItem();
        holdingHammer = held != null && held.typeId in HAMMERS;
        inReach = dist(p.player.location, { x: p.center.x + 0.5, y: p.center.y + 0.5, z: p.center.z + 0.5 }) <= CONFIG.breaking.reachDistance;
      } catch { /* измерить не удалось — не выполняем */ }
      if (centerGone && holdingHammer && inReach) executeZone(p);
    }
    // чистка истории стартов
    for (const [id, rs] of recentStarts) {
      if (tick - rs.tick > 100) recentStarts.delete(id);
    }
  }, 1);
}


function gameModeIs(player, mode) {
  try { return String(player.getGameMode()) === mode; } catch { return false; }
}

function executeZone(p) {
  p.executed = true;
  pending.delete(p.playerId);
  const { player, dimension, center, plane, radius, input, decision } = p;

  const candidates = generatePlane(center, plane, Math.min(radius, 2)).slice(0, CONFIG.breaking.maxZonePerTick);
  const allowedLocs = [];
  const skipped = {};
  const typeIds = [];
  for (const loc of candidates) {
    if (keyOf(loc) === keyOf(center)) continue; // центр уже разрушен ванильно
    let block = null;
    try { block = dimension.getBlock(loc); } catch { }
    const verdict = evaluateBlock(block);
    if (verdict.allowed) { allowedLocs.push({ loc, block, typeId: verdict.typeId }); typeIds.push(verdict.typeId); }
    else skipped[verdict.reason] = (skipped[verdict.reason] ?? 0) + 1;
  }

  const creative = gameModeIs(player, "creative");
  let budget = { budget: allowedLocs.length, cost: 0, trimmed: false };
  if (!creative) budget = budgetFor(allowedLocs.length, input.heldItem, CONFIG);
  const zone = allowedLocs.slice(0, budget.budget);

  let destroyed = 0;
  const destroyedIds = [];
  for (const { loc, block, typeId } of zone) {
    try {
      if (CONFIG.drops.manualDrops) {
        const drops = collectDrop(block, input.heldItem, CONFIG);
        if (drops !== null) {
          for (const stack of drops) dimension.spawnItem(stack, { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 });
        }
      }
      block.setType("minecraft:air");
      destroyed++;
      destroyedIds.push(typeId ?? "?");
      if (CONFIG.debug.particles && CONFIG.debug.enabled) {
        try { dimension.spawnParticle("minecraft:critical_hit_emitter", { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 }); } catch { }
      }
    } catch (e) {
      logger.warn("zone break failed @" + keyOf(loc) + ": " + e);
    }
  }

  if (!creative && budget.cost > 0) applyCost(player, budget.cost, logger);

  try { player.playSound("dig.stone", { volume: 0.6, pitch: 0.9 }); } catch { }

  stats.swings++;
  stats.blocks += destroyed;
  const sizeLabel = (radius * 2 + 1) + "×" + (radius * 2 + 1);
  stats.byZone[sizeLabel] = (stats.byZone[sizeLabel] ?? 0) + 1;
  stats.byPlane[decision.plane] = (stats.byPlane[decision.plane] ?? 0) + 1;

  const zoneResult = { destroyed: destroyed + 1, skipped: Object.values(skipped).reduce((a, b) => a + b, 0), trimmed: budget.trimmed, sizeLabel };
  logger.actionbar(player, decision, zoneResult, input.faceLocationSource);
  logger.logDecision(buildLogEntry(input, decision, radius, {
    destroyed: destroyed + 1, skipped: zoneResult.skipped, cost: budget.cost, trimmed: budget.trimmed,
    ids: destroyedIds, skippedDetail: skipped,
  }, candidates.length));

  if (!creative) {
    // предупреждение читаем по фактическому предмету в руке (после списания)
    try {
      const inv = player.getComponent("minecraft:inventory");
      const slot = typeof player.selectedSlotIndex === "number" ? player.selectedSlotIndex : 0;
      const held = inv.container.getSlot(slot).getItem();
      const rem = remainingDurability(held);
      const max = p.descriptor?.durability ?? Infinity;
      if (held && max !== Infinity && rem <= max * CONFIG.durabilityWarningAt) {
        logger.chat(player, `§e[${sizeLabel}] Прочность молота: §c${rem}§e/§f${max}§e — скоро сломается!`);
      }
    } catch { }
  }
}

function buildLogEntry(input, decision, radius, result, candidateCount) {
  const eye = input.eyeLocation, c = input.blockLocation;
  return {
    v: CONFIG.addonVersion, ts: Date.now(),
    player: input.player?.name ?? "?",
    input: {
      block: c, face: input.face, hitFace: input.hitFace,
      faceLocation: input.faceLocation, faceLocationSource: input.faceLocationSource,
      playerLoc: input.playerLocation, eyeLoc: eye, isSneaking: input.isSneaking,
      distance: eye && c ? +dist(eye, { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }).toFixed(2) : null,
    },
    decision: {
      plane: decision.plane, zone: decision.zone, confidence: +decision.confidence.toFixed(2),
      source: decision.source, local: decision.local, delta: decision.delta,
      reasons: decision.reasons,
    },
    radius, size: radius * 2 + 1, candidates: candidateCount ?? (radius * 2 + 1) ** 2,
    result: {
      destroyed: result.destroyed, skipped: result.skipped, cost: result.cost,
      trimmed: result.trimmed, ids: result.ids,
    },
  };
}

export function getStats() { return { ...stats, pending: pending.size }; }
