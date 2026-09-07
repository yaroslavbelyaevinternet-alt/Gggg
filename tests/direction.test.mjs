/**
 * Ultimate Hammer — юнит-тесты чистой математики (node --test tests/).
 * Дублирует и расширяет игровую самопроверку /scriptevent uh:selftest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { generatePlane, planeForFace, PLANES } from "../behavior_packs/ultimate_hammer_bp/scripts/area.js";
import { resolveDirection, toLocal, clamp } from "../behavior_packs/ultimate_hammer_bp/scripts/resolver.js";
import { evaluateBlock, isProtectedTypeId, isSpecialTypeId } from "../behavior_packs/ultimate_hammer_bp/scripts/filter.js";
import { pickRadius, identifyHammer, HAMMERS, radiusToSize } from "../behavior_packs/ultimate_hammer_bp/scripts/detector.js";
import { calcCost, budgetFor } from "../behavior_packs/ultimate_hammer_bp/scripts/durability.js";
import { CONFIG, mergeConfig } from "../behavior_packs/ultimate_hammer_bp/scripts/config.js";
import { selfTest } from "../behavior_packs/ultimate_hammer_bp/scripts/selftest.js";

const CENTER = { x: 0, y: 64, z: 0 };
const cfg = CONFIG.direction;

function mkInput(over = {}) {
  return {
    face: "Up",
    faceLocation: { x: 0.5, y: 1, z: 0.5 },
    faceLocationSource: "ray_hit",
    playerLocation: { x: 0.5, y: 65, z: 0.5 },
    eyeLocation: { x: 0.5, y: 66.6, z: 0.5 },
    viewDirection: { x: 0, y: -0.95, z: 0 },
    blockLocation: { ...CENTER },
    isSneaking: false,
    ...over,
  };
}

test("встроенная самопроверка целиком зелёная", () => {
  const r = selfTest();
  assert.equal(r.fail, 0, "фейлы: " + r.lines.filter((l) => l.includes("✘")).join("\n"));
});

// ── Зона (HM-001..003, HM-022) ────────────────────────────────────────────
test("generatePlane: размеры 1/9/25 и плоскость всегда плоская", () => {
  assert.equal(generatePlane(CENTER, "xz", 0).length, 1);
  assert.equal(generatePlane(CENTER, "xz", 1).length, 9);
  assert.equal(generatePlane(CENTER, "xy", 2).length, 25);
  for (const [plane, spec] of Object.entries(PLANES)) {
    const pts = generatePlane(CENTER, plane, 2);
    for (const p of pts) assert.equal(p[spec.normalAxis], CENTER[spec.normalAxis], plane + " должна быть плоской");
  }
});

test("generatePlane: радиус ограничен 2 и центр первый", () => {
  assert.equal(generatePlane(CENTER, "xz", 5).length, 25);
  assert.deepEqual(generatePlane(CENTER, "xz", 1)[0], CENTER);
});

test("никаких 3×3×3: у каждой плоскости ровно 2 оси", () => {
  for (const spec of Object.values(PLANES)) assert.equal(spec.axes.length, 2);
});

// ── Боковые грани (HM-004..007) ───────────────────────────────────────────
test("боковые грани → вертикальные плоскости", () => {
  assert.equal(planeForFace("North"), "xy");
  assert.equal(planeForFace("South"), "xy");
  assert.equal(planeForFace("West"), "zy");
  assert.equal(planeForFace("East"), "zy");
  for (const f of ["North", "South", "West", "East"]) {
    const d = resolveDirection(mkInput({ face: f }), cfg, {});
    assert.equal(d.plane, planeForFace(f));
    assert.equal(d.confidence, 1);
  }
});

// ── Up/Down (HM-008..013) ─────────────────────────────────────────────────
test("Up/Down центр → X/Z core", () => {
  const up = resolveDirection(mkInput(), cfg, {});
  assert.equal(up.plane, "xz");
  assert.equal(up.zone, "core");
  const down = resolveDirection(mkInput({ face: "Down", viewDirection: { x: 0, y: 0.95, z: 0 } }), cfg, {});
  assert.equal(down.plane, "xz");
  assert.equal(down.zone, "core");
});

test("Up/Down СТРОГО по грани: всегда X/Z при любом взгляде и позиции", () => {
  const cases = [
    { faceLocation: { x: 0.95, y: 1, z: 0.5 }, playerLocation: { x: 2.2, y: 63.6, z: 0.5 }, viewDirection: { x: -0.98, y: -0.15, z: 0 } },
    { faceLocation: { x: 0.5, y: 1, z: 0.06 }, playerLocation: { x: 0.5, y: 65, z: 2.4 }, viewDirection: { x: 0, y: -0.35, z: -0.94 } },
    { faceLocation: { x: 0.92, y: 1, z: 0.3 }, playerLocation: { x: 1.8, y: 65, z: 2.2 }, viewDirection: { x: -0.25, y: -0.3, z: -0.92 } },
    { faceLocation: { x: 0.95, y: 1, z: 0.5 }, playerLocation: { x: 0.9, y: 66, z: 0.5 }, viewDirection: { x: 0.1, y: -0.95, z: 0 } },
  ];
  for (const c of cases) {
    const d = resolveDirection(mkInput(c), cfg, {});
    assert.equal(d.plane, "xz", JSON.stringify(c));
    assert.equal(d.confidence, 1);
  }
  const down = resolveDirection(mkInput({ face: "Down", viewDirection: { x: 0, y: 0.15, z: -0.99 }, faceLocation: { x: 0.5, y: 0, z: 0.05 } }), cfg, {});
  assert.equal(down.plane, "xz");
});

test("гистерезис: детерминированная смена стороны принимается", () => {
  const mem = { last: { plane: "zy" } };
  const b = resolveDirection(mkInput({ face: "Up" }), cfg, mem);
  assert.equal(b.plane, "xz");
});

test("без faceLocation резолвер деградирует мягко", () => {
  const d = resolveDirection(mkInput({ faceLocation: null, faceLocationSource: "none" }), cfg, {});
  assert.equal(d.plane, "xz"); // игрок над центром → xz
});

// ── toLocal ───────────────────────────────────────────────────────────────
test("toLocal: СЗ-угол → центр блока", () => {
  assert.deepEqual(toLocal({ x: 0.5, y: 1, z: 0.5 }), { x: 0, z: 0 });
  assert.deepEqual(toLocal({ x: 1, z: 1 }), { x: 0.5, z: 0.5 });
  assert.equal(toLocal(null), null);
  assert.equal(clamp(2, 0, 1), 1);
});

// ── Фильтр (HM-017/018) ───────────────────────────────────────────────────
const mockBlock = (over = {}) => ({
  typeId: "minecraft:stone", isAir: false, isLiquid: false, getComponent: () => undefined, ...over,
});

test("фильтр: защищённые и специальные блоки", () => {
  assert.equal(isProtectedTypeId("minecraft:bedrock"), true);
  assert.equal(isProtectedTypeId("mymap:control_block"), true);
  assert.equal(isProtectedTypeId("minecraft:stone"), false);
  assert.equal(isSpecialTypeId("minecraft:chest"), true);
  assert.equal(isSpecialTypeId("minecraft:cake_with_candle"), true);
  assert.equal(isSpecialTypeId("minecraft:stone"), false);
  assert.equal(evaluateBlock(mockBlock({ typeId: "minecraft:bedrock" })).allowed, false);
  assert.equal(evaluateBlock(mockBlock({ isAir: true })).allowed, false);
  assert.equal(evaluateBlock(mockBlock({ isLiquid: true })).allowed, false);
  assert.equal(evaluateBlock(mockBlock({ typeId: "minecraft:hopper" })).allowed, false);
  assert.equal(evaluateBlock(mockBlock({ getComponent: () => ({ container: {} }) })).reason, "container_component");
  assert.equal(evaluateBlock(mockBlock()).allowed, true);
  assert.equal(evaluateBlock(null).allowed, false);
});

test("фильтр: только кирочная категория блоков", () => {
  const wrong = (id, tags) => evaluateBlock(mockBlock({ typeId: id, getTags: () => tags })).reason === "wrong_tool";
  assert.equal(wrong("minecraft:planks", ["wood", "planks"]), true);
  assert.equal(wrong("minecraft:flower_pot", ["plant", "pot"]), true);
  assert.equal(wrong("minecraft:oak_stairs", ["wood", "stairs"]), true);
  assert.equal(wrong("minecraft:dirt", ["dirt"]), true);
  assert.equal(wrong("minecraft:crafting_table", ["wood", "crafting_table"]), true);
  assert.equal(evaluateBlock(mockBlock({ typeId: "minecraft:deepslate", getTags: () => ["stone"] })).allowed, true);
  assert.equal(evaluateBlock(mockBlock({ typeId: "minecraft:iron_ore", getTags: () => ["metal", "iron_ore"] })).allowed, true);
  assert.equal(evaluateBlock(mockBlock({ getTags: () => [] })).reason, "wrong_tool");
});

// ── Радиусы (HM-001/002/003) ──────────────────────────────────────────────
test("радиусы: присед/обычный/override/5×5", () => {
  assert.equal(pickRadius(true, undefined, CONFIG), 0);
  assert.equal(pickRadius(false, undefined, CONFIG), 1);
  assert.equal(pickRadius(true, 2, CONFIG), 0); // присед сильнее override
  assert.equal(pickRadius(false, 2, CONFIG), 2);
  assert.equal(radiusToSize(2), "5×5");
});

// ── Молот ─────────────────────────────────────────────────────────────────
test("детектор молотов", () => {
  assert.equal(identifyHammer({ typeId: "ultimate_hammer:netherite_hammer" }).speed, 12);
  assert.equal(identifyHammer({ typeId: "minecraft:netherite_pickaxe" }), null);
  assert.equal(Object.keys(HAMMERS).length, 6);
  // деревянный молот = скорость КАМЕННОЙ кирки (уровень выше деревянной)
  assert.equal(HAMMERS["ultimate_hammer:wooden_hammer"].speed, 4);
});

test("таблица скоростей: молот N = кирка N+1 (HM-021)", () => {
  const pickaxeSpeeds = { wooden: 2, stone: 4, iron: 6, golden: 12, diamond: 8, netherite: 9 };
  const next = { wooden: "stone", stone: "iron", iron: "diamond", golden: null, diamond: "netherite", netherite: null };
  for (const [id, d] of Object.entries(HAMMERS)) {
    const mat = d.material;
    const expect = next[mat] ? pickaxeSpeeds[next[mat]] : (mat === "netherite" ? 12 : 13);
    assert.equal(d.speed, expect, `${id}: скорость ${d.speed}, ожидалась кирка уровня выше (${expect})`);
  }
});

// ── Прочность (HM-020) ────────────────────────────────────────────────────
test("прочность: модели расходов", () => {
  assert.equal(calcCost(9, "per_block", 1), 9);
  assert.equal(calcCost(9, "per_swing", 1), 1);
  assert.equal(calcCost(9, "hybrid", 1), 9);
  assert.equal(calcCost(9, "hybrid", 3), 11);
  assert.equal(calcCost(0, "per_block", 1), 0);
  const fragile = { getComponent: () => ({ maxDurability: 10, damage: 7 }) };
  assert.deepEqual(budgetFor(9, fragile, CONFIG), { budget: 3, cost: 3, trimmed: true });
  const fresh = { getComponent: () => ({ maxDurability: 250, damage: 0 }) };
  assert.equal(budgetFor(9, fresh, CONFIG).trimmed, false);
  assert.equal(budgetFor(5, null, CONFIG).budget, 5); // без стека — без ограничений
});

// ── Config ────────────────────────────────────────────────────────────────
test("config: согласованность порогов", () => {
  assert.ok(CONFIG.direction.coreRadius < CONFIG.direction.peripheryRadius);
  assert.ok(CONFIG.sneakRadius <= CONFIG.upgradeRadius);
  assert.ok(CONFIG.breaking.maxZonePerTick >= 25);
  const merged = mergeConfig(CONFIG, { direction: { coreRadius: 0.25 }, debug: { chat: true } });
  assert.equal(merged.direction.coreRadius, 0.25);
  assert.equal(merged.direction.peripheryRadius, CONFIG.direction.peripheryRadius);
  assert.equal(merged.debug.chat, true);
  assert.notEqual(merged, CONFIG); // не мутируем
});
