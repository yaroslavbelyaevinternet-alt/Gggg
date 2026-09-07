/**
 * Ultimate Hammer — Detector.
 * Определение предмета-молота, его материала и радиуса зоны для игрока.
 * Зависимости от API нет — чистые данные и логика (тестируется в Node).
 */

export const HAMMERS = Object.freeze({
  "ultimate_hammer:wooden_hammer":    { material: "wooden",    tier: 0, speed: 4,  durability: 60   },
  "ultimate_hammer:stone_hammer":     { material: "stone",     tier: 1, speed: 6,  durability: 132  },
  "ultimate_hammer:iron_hammer":      { material: "iron",      tier: 2, speed: 8,  durability: 251  },
  "ultimate_hammer:golden_hammer":    { material: "golden",    tier: 3, speed: 13, durability: 33   },
  "ultimate_hammer:diamond_hammer":   { material: "diamond",   tier: 4, speed: 9,  durability: 1562 },
  "ultimate_hammer:netherite_hammer": { material: "netherite", tier: 5, speed: 12, durability: 2032 },
});

export const HAMMER_IDS = Object.freeze(Object.keys(HAMMERS));

/** itemStack → дескриптор молота или null. itemStack — любой объект с typeId. */
export function identifyHammer(itemStack) {
  if (!itemStack || !itemStack.typeId) return null;
  return HAMMERS[itemStack.typeId] ?? null;
}

/**
 * Радиус зоны: 0 → 1×1, 1 → 3×3, 2 → 5×5.
 * Приоритет: присед > персональная настройка игрока > defaultRadius.
 * playerOverride — значение uh:radius игрока (null/undefined = не задано).
 */
export function pickRadius(isSneaking, playerOverride, cfg) {
  if (isSneaking) return cfg.sneakRadius;
  if (playerOverride === 0 || playerOverride === 1 || playerOverride === 2) return playerOverride;
  return cfg.defaultRadius;
}

export function radiusToSize(radius) {
  return (radius * 2 + 1) + "×" + (radius * 2 + 1);
}
