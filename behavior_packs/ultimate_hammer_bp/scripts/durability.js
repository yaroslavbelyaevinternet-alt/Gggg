/**
 * Ultimate Hammer — Durability Manager.
 * Первая экспериментальная модель (ТЗ): один реально разрушенный блок = 1 прочности.
 * Альтернативы для тестов: "per_swing" (1 удар = 1) и "hybrid" (1 + блоки сверх первого).
 * Работает с живым ItemStack; для тестов логика calcCost чистая.
 */

/** Стоимость по числу разрушенных блоков. */
export function calcCost(brokenCount, mode, hybridSwingCost) {
  const n = Math.max(0, Math.floor(brokenCount));
  if (n === 0) return 0;
  switch (mode) {
    case "per_swing": return 1;
    case "hybrid": return hybridSwingCost + Math.max(0, n - 1);
    case "per_block":
    default: return n;
  }
}

/** Остаток прочности ItemStack или Infinity. */
export function remainingDurability(itemStack) {
  if (!itemStack) return Infinity;
  try {
    const comp = itemStack.getComponent("minecraft:durability");
    if (!comp) return Infinity;
    return Math.max(0, comp.maxDurability - comp.damage);
  } catch {
    return Infinity;
  }
}

/**
 * Сколько блоков можно себе позволить и сколько прочности списать.
 * @returns {{budget:number, cost:number, trimmed:boolean}}
 */
export function budgetFor(brokenCount, itemStack, cfg) {
  const want = Math.max(0, Math.floor(brokenCount));
  const rem = remainingDurability(itemStack);
  if (rem === Infinity) return { budget: want, cost: 0, trimmed: false };
  const costAll = calcCost(want, cfg.durabilityMode, cfg.hybridSwingCost);
  if (costAll <= rem) return { budget: want, cost: costAll, trimmed: false };
  // Обрезаем зону по карману (per_block/hybrid считаются линейно).
  let afford = want;
  while (afford > 0 && calcCost(afford, cfg.durabilityMode, cfg.hybridSwingCost) > rem) afford--;
  return { budget: afford, cost: calcCost(afford, cfg.durabilityMode, cfg.hybridSwingCost), trimmed: true };
}

/** Применить стоимость к живому стеку в руке игрока; true — предмет сломался. */
export function applyCost(player, cost, logger) {
  if (cost <= 0) return false;
  try {
    const inventory = player.getComponent("minecraft:inventory");
    const slot = typeof player.selectedSlotIndex === "number" ? player.selectedSlotIndex : 0;
    const item = inventory.container.getSlot(slot);
    const itemStack = item?.getItem();
    if (!itemStack) return false;
    const comp = itemStack.getComponent("minecraft:durability");
    if (!comp) return false;
    comp.damage += cost;
    if (comp.damage >= comp.maxDurability) {
      inventory.container.setItem(slot, undefined);
      try { player.playSound("random.break"); } catch { }
      logger?.chat?.(player, "§cМолот сломался!");
      return true;
    }
    item.setItem(itemStack);
    return false;
  } catch (e) {
    logger?.warn?.("applyCost: " + e);
    return false;
  }
}
