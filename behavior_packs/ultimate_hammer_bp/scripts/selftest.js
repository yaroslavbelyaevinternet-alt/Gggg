/**
 * Ultimate Hammer — встроенная самопроверка чистой математики.
 * Запускается и в Node (tests/), и в игре: /scriptevent uh:selftest
 */

import { generatePlane, planeForFace } from "./area.js";
import { resolveDirection, toLocal } from "./resolver.js";
import { evaluateBlock } from "./filter.js";
import { pickRadius, identifyHammer, HAMMERS } from "./detector.js";
import { calcCost, budgetFor } from "./durability.js";
import { CONFIG } from "./config.js";

const CENTER = { x: 100, y: 64, z: -200 };

function mkInput(over = {}) {
  return {
    face: "Up",
    faceLocation: { x: 0.5, y: 1, z: 0.5 },
    faceLocationSource: "ray_hit",
    playerLocation: { x: 100.5, y: 65, z: -199.5 },
    eyeLocation: { x: 100.5, y: 66.62, z: -199.5 },
    viewDirection: { x: 0, y: -0.95, z: 0 }, // по умолчанию смотрим вниз (яма)
    blockLocation: { ...CENTER },
    isSneaking: false,
    ...over,
  };
}

const mockBlock = (over = {}) => ({
  typeId: "minecraft:stone",
  isAir: false,
  isLiquid: false,
  getComponent: () => undefined,
  ...over,
});

export function selfTest() {
  const lines = [];
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; lines.push(`§a  ✔ ${name}`); }
    else { fail++; lines.push(`§c  ✘ ${name}`); }
  };

  // Зона
  check("radius 0 → 1 блок (1×1)", generatePlane(CENTER, "xz", 0).length === 1);
  check("radius 1 → 9 блоков (3×3)", generatePlane(CENTER, "xz", 1).length === 9);
  check("radius 2 → 25 блоков (5×5)", generatePlane(CENTER, "xz", 2).length === 25);
  check("xz-плоскость плоская по Y", generatePlane(CENTER, "xz", 1).every((p) => p.y === 64));
  check("xy-плоскость плоская по Z", generatePlane(CENTER, "xy", 2).every((p) => p.z === -200));
  check("zy-плоскость плоская по X", generatePlane(CENTER, "zy", 1).every((p) => p.x === 100));
  check("центр всегда первый", JSON.stringify(generatePlane(CENTER, "xz", 1)[0]) === JSON.stringify(CENTER));

  // Боковые грани (HM-004..007)
  check("North → X/Y", planeForFace("North") === "xy");
  check("South → X/Y", planeForFace("South") === "xy");
  check("West → Z/Y", planeForFace("West") === "zy");
  check("East → Z/Y", planeForFace("East") === "zy");
  for (const f of ["North", "South", "West", "East"]) {
    const d = resolveDirection(mkInput({ face: f }), CONFIG.direction, {});
    check(`${f}: решено ${d.plane} (confidence 1)`, d.plane === planeForFace(f) && d.confidence === 1);
  }

  // Up/Down (HM-008..013)
  const upCenter = resolveDirection(mkInput(), CONFIG.direction, {});
  check("Up центр → X/Z core", upCenter.plane === "xz" && upCenter.zone === "core");
  const downCenter = resolveDirection(mkInput({ face: "Down", viewDirection: { x: 0, y: 0.95, z: 0 } }), CONFIG.direction, {});
  check("Down центр → X/Z core", downCenter.plane === "xz" && downCenter.zone === "core");

  // Up/Down: СТРОГО по грани — всегда X/Z, независимо от взгляда/позиции
  const aside = resolveDirection(mkInput({
    faceLocation: { x: 0.95, y: 1, z: 0.5 },
    playerLocation: { x: 102.2, y: 63.6, z: -199.5 },
    eyeLocation: { x: 102.2, y: 65.2, z: -199.5 },
    viewDirection: { x: -0.98, y: -0.15, z: 0 },
  }), CONFIG.direction, {});
  check("Up у края + взгляд сбоку → ВСЁ РАВНО X/Z (строго по грани)", aside.plane === "xz" && aside.confidence === 1);

  const forward = resolveDirection(mkInput({
    faceLocation: { x: 0.5, y: 1, z: 0.06 },
    playerLocation: { x: 100.5, y: 65, z: -197.6 },
    eyeLocation: { x: 100.5, y: 66.6, z: -197.6 },
    viewDirection: { x: 0, y: -0.35, z: -0.94 },
  }), CONFIG.direction, {});
  check("Up + взгляд вперёд → X/Z (взгляд не влияет)", forward.plane === "xz");

  const lottery = resolveDirection(mkInput({
    faceLocation: { x: 0.92, y: 1, z: 0.3 },
    playerLocation: { x: 101.8, y: 65, z: -197.8 },
    eyeLocation: { x: 101.8, y: 66.5, z: -197.8 },
    viewDirection: { x: -0.25, y: -0.3, z: -0.92 },
  }), CONFIG.direction, {});
  check("Up + любое смещение/взгляд → X/Z (никакой лотереи)", lottery.plane === "xz");

  const downAside = resolveDirection(mkInput({
    face: "Down",
    faceLocation: { x: 0.5, y: 0, z: 0.05 },
    playerLocation: { x: 100.5, y: 62.5, z: -200.6 },
    eyeLocation: { x: 100.5, y: 64.1, z: -200.6 },
    viewDirection: { x: 0, y: 0.15, z: -0.99 },
  }), CONFIG.direction, {});
  check("Down у края → X/Z (строго по грани)", downAside.plane === "xz");

  // Гистерезис (HM-016): смена стороны (side↔Up) всегда уверенная — дрожания нет
  const mem = { last: { plane: "zy" } };
  const flip = resolveDirection(mkInput({ face: "Up" }), CONFIG.direction, mem);
  check("гистерезис: детерминированная смена zy→xz принята", flip.plane === "xz");

  // Фильтр (HM-017/018)
  check("bedrock не проходит", evaluateBlock(mockBlock({ typeId: "minecraft:bedrock" })).allowed === false);
  check("воздух не проходит", evaluateBlock(mockBlock({ isAir: true })).allowed === false);
  check("кастомный блок карты не проходит", evaluateBlock(mockBlock({ typeId: "somemap:secret" })).allowed === false);
  check("сундук исключён из зоны", evaluateBlock(mockBlock({ typeId: "minecraft:chest" })).allowed === false);
  check("камень проходит", evaluateBlock(mockBlock()).allowed === true);
  check("доски НЕ ломаются зоной (не категория кирки)", evaluateBlock(mockBlock({ typeId: "minecraft:planks", getTags: () => ["wood", "planks"] })).reason === "wrong_tool");
  check("горшок НЕ ломается зоной", evaluateBlock(mockBlock({ typeId: "minecraft:flower_pot", getTags: () => ["plant", "pot"] })).reason === "wrong_tool");
  check("деревянная лестница НЕ ломается зоной", evaluateBlock(mockBlock({ typeId: "minecraft:oak_stairs", getTags: () => ["wood", "stairs"] })).reason === "wrong_tool");
  check("глубинный сланец ломается (stone)", evaluateBlock(mockBlock({ typeId: "minecraft:deepslate", getTags: () => ["stone"] })).allowed === true);

  // Радиусы (HM-001/002)
  check("присед → radius 0", pickRadius(true, 1, CONFIG) === 0);
  check("обычный → radius 1", pickRadius(false, undefined, CONFIG) === 1);
  check("override 2 → radius 2 (5×5)", pickRadius(false, 2, CONFIG) === 2);

  // Дескриптор
  check("молот распознаётся", identifyHammer({ typeId: "ultimate_hammer:iron_hammer" })?.speed === 8);
  check("незапрещённый предмет не молот", identifyHammer({ typeId: "minecraft:stick" }) === null);
  check("в линейке 6 молотов", Object.keys(HAMMERS).length === 6);

  // Прочность (HM-020)
  check("per_block: 5 блоков = 5", calcCost(5, "per_block", 1) === 5);
  check("per_swing: 5 блоков = 1", calcCost(5, "per_swing", 1) === 1);
  check("hybrid: 5 блоков = 5", calcCost(5, "hybrid", 1) === 5);
  const tool = { getComponent: () => ({ maxDurability: 10, damage: 8 }) };
  check("бюджет режет зону по прочности", budgetFor(5, tool, CONFIG).budget === 2);
  const rich = { getComponent: () => ({ maxDurability: 2000, damage: 0 }) };
  check("бюджет не режет целую зону", budgetFor(9, rich, CONFIG).budget === 9);

  // toLocal
  check("toLocal центр грани → (0,0)", JSON.stringify(toLocal({ x: 0.5, z: 0.5 })) === JSON.stringify({ x: 0, z: 0 }));

  lines.unshift(`§6Самопроверка: §f${pass} ✔ / ${fail} ✘`);
  return { ok: fail === 0, pass, fail, lines };
}
