/**
 * Ultimate Hammer — Config (единственная точка настройки баланса).
 * Все пороги подобраны как стартовые гипотезы и ДОЛЖНЫ калиброваться
 * по реальным debug-данным (см. tools/mcp_debug_server.mjs, /scriptevent uh:debug).
 */

export const CONFIG = Object.freeze({
  addonVersion: "1.2.0",
  targetGame: "1.26.44",
  targetModule: "@minecraft/server 2.10.0-beta",

  // ── Зона ────────────────────────────────────────────────────────────────
  defaultRadius: 1, // 3×3 (обычный режим)
  sneakRadius: 0,   // 1×1 (присед)
  upgradeRadius: 2, // 5×5 (заложено архитектурно; включается динамическим свойством игрока uh:radius=2)

  // ── Прочность ───────────────────────────────────────────────────────────
  durabilityMode: "per_block", // "per_block" | "per_swing" | "hybrid"
  hybridSwingCost: 1,          // для "hybrid": 1 за удар + 1 за каждый блок сверх первого
  durabilityWarningAt: 0.1,    // предупреждение при <10% прочности

  // ── Разрушение ──────────────────────────────────────────────────────────
  breaking: {
    minBreakTicks: 0,     // минимальная задержка до массового сноса (анти-мгновенный «дам-дам»)
    maxZonePerTick: 25,   // предохранитель производительности (5×5 = 25)
    reachDistance: 8.0,   // макс. дистанция игрок→центр зоны в момент сноса
    settleDelayTicks: 2,  // пауза между разрушением центра и проверкой зоны
  },

  // ── Классификатор направления Up/Down ───────────────────────────────────
  // Локальные координаты точки на грани: -0.5..+0.5 от центра по X и Z.
  direction: {
    coreRadius: 0.30,        // |local| ≤ 0.30 → центральная зона (стабильное X/Z)
    peripheryRadius: 0.46,   // |local| ≥ 0.46 → периферийная зона (край грани)
    // переходная зона между ними — комбинированное решение

    // (v1.2.0) Направление строго по грани — пороги взгляда/геометрии не нужны;
    // coreRadius/peripheryRadius остаются только для диагностических зон лога.

    hysteresis: 0.06,        // запас смены решения (к порогу уверенности) против дрожания
    maxFaceLocationAgeMs: 1200, // свежесть точки взаимодействия (touch)
  },

  // ── Дроп ────────────────────────────────────────────────────────────────
  drops: {
    manualDrops: false,       // false = дроп только ванильного центра (0% дюпов, остальное не дропается);
                              // true  = безопасный ручной дроп для «простых» блоков зоны (см. drop.js)
  },

  // ── Debug ───────────────────────────────────────────────────────────────
  debug: {
    enabled: true,        // экспериментальная стадия: включён по умолчанию
    actionbar: true,      // краткая сводка каждому удару
    chat: false,          // полный лог в чат (шумно)
    console: true,        // [UH] … в консоль/лог (парсится MCP-сервером)
    ringBuffer: 200,      // глубина кольцевого буфера для /scriptevent uh:dump
    particles: false,     // частицы при разрушении зоны (выключено по запросу)
  },
});

/** Глубокое слияние переопределений (для /scriptevent uh:config и MCP). */
export function mergeConfig(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (patch === null || patch === undefined) return out;
  for (const [k, v] of Object.entries(patch)) {
    const b = out[k];
    out[k] = b !== null && typeof b === "object" && v !== null && typeof v === "object" && !Array.isArray(b) && !Array.isArray(v)
      ? mergeConfig(b, v)
      : v;
  }
  return out;
}
