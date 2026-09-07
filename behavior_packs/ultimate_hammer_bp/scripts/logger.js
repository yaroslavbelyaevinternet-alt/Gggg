/**
 * Ultimate Hammer — Debug Logger (ТЗ 08: диагностика ДО финализации формулы).
 * Кольцевой буфер решений + actionbar + чат + консоль.
 * Консольный формат [UHD]{json} парсится MCP-сервером отладки (tools/).
 */

import { CONFIG } from "./config.js";

const ring = [];
let listeners = [];

function push(entry) {
  ring.push(entry);
  while (ring.length > CONFIG.debug.ringBuffer) ring.shift();
  for (const fn of listeners) {
    try { fn(entry); } catch { }
  }
}

export function onDecision(fn) { listeners.push(fn); }
export function clearListeners() { listeners = []; }

function fmt(n) {
  return typeof n === "number" ? (Math.round(n * 100) / 100).toString() : String(n ?? "?");
}

export function logDecision(entry) {
  if (!CONFIG.debug.enabled) return;
  push(entry);
  const line = "[UHD]" + JSON.stringify(entry);
  if (CONFIG.debug.console) console.warn(line);
  if (CONFIG.debug.chat && entry.player) {
    try { entry.player.sendMessage(line); } catch { }
  }
}

export function dump(n = 20) {
  return ring.slice(-n);
}

export function clear() {
  ring.length = 0;
}

/** Краткая сводка на actionbar при каждом массовом ударе. */
export function actionbar(player, decision, zoneResult, faceLocationSource) {
  if (!CONFIG.debug.enabled || !CONFIG.debug.actionbar || !player) return;
  const plane = decision.plane === "xz" ? "X/Z" : decision.plane === "xy" ? "X/Y" : "Z/Y";
  const { destroyed, skipped, trimmed, sizeLabel } = zoneResult;
  const parts = [
    `§e[${sizeLabel} ${plane}]§r`,
    `zone:${decision.zone}`,
    `conf:${fmt(decision.confidence)}`,
    `hit:${faceLocationSource ?? "none"}`,
  ];
  if (trimmed) parts.push(`§6budget✂§r`);
  parts.push(`§a✓${destroyed}§r`);
  if (skipped > 0) parts.push(`§7✗${skipped}§r`);
  try { player.onScreenDisplay.setActionBar(parts.join(" §8|§r ")); } catch { }
}

export function chat(player, text) {
  try { (player ?? undefined)?.sendMessage(text); } catch { }
}

export function warn(text) {
  console.warn("[UH] " + text);
}

export function info(text) {
  console.warn("[UH] " + text);
}
