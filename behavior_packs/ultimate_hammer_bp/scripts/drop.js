/**
 * Ultimate Hammer — Drop Manager.
 * Приоритет №1: отсутствие дюпов. Нельзя получить ванильный и ручной дроп одновременно.
 *
 * Режим по умолчанию (CONFIG.drops.manualDrops=false):
 *   дроп существует ТОЛЬКО у центрального блока — ванильный движок сам его выдаёт
 *   в момент завершения разрушения. Спутники через setType(air) ничего не дропают —
 *   дюп невозможен архитектурно.
 *
 * Экспериментальный режим (manualDrops=true):
 *   для «простых» блоков зоны дроп собирается block.getLoot(tool) и выдаётся вручную;
 *   контейнеры/спецблоки в зону всё равно не попадают (filter.js).
 */

const PLAIN_OK = (typeId) => typeId.startsWith("minecraft:");

/**
 * @param block живой Block (обязательно ещё НЕ разрушен)
 * @param tool ItemStack молота (для Fortune/Silk Touch в getLoot)
 * @param cfg CONFIG
 * @returns {Array<object>|null} ItemStack[] для спавна, [] — ничего, null — не трогать
 */
export function collectDrop(block, tool, cfg) {
  if (!cfg.drops.manualDrops) return null; // ванильный режим: центр уже дропнулся сам
  const typeId = block.typeId ?? "";
  if (!PLAIN_OK(typeId)) return [];
  let loot = [];
  try {
    loot = block.getLoot(tool ?? undefined) ?? [];
  } catch {
    return []; // не смогли посчитать безопасно — не дропаем вообще
  }
  return loot;
}
