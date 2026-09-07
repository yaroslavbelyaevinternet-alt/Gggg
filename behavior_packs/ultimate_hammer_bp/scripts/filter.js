/**
 * Ultimate Hammer — Block Filter.
 * Каждый кандидат зоны проходит индивидуальную проверку.
 * Массовое разрушение не должно обходить защиту карты и создавать дюпы.
 *
 * evaluateBlock работает с «утиной» моделью блока (block.isAir / isLiquid / typeId /
 * getComponent), поэтому тестируется в Node на моках.
 */

/** Абсолютный запрет: технические и незыбаемые блоки. */
export const PROTECTED_BLOCK_IDS = new Set([
  "minecraft:bedrock",
  "minecraft:barrier",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:structure_void",
  "minecraft:jigsaw",
  "minecraft:allow",
  "minecraft:deny",
  "minecraft:border_block",
  "minecraft:moving_block",
  "minecraft:piston_arm_collision",
  "minecraft:sticky_piston_arm_collision",
  "minecraft:end_portal",
  "minecraft:end_portal_frame",
  "minecraft:end_gateway",
  "minecraft:nether_portal",
  "minecraft:portal",
  "minecraft:light_block",
  "minecraft:info_update",
  "minecraft:info_update2",
  "minecraft:virtual_fire",
  "minecraft:water",
  "minecraft:flowing_water",
  "minecraft:lava",
  "minecraft:flowing_lava",
]);

/**
 * Блоки, исключаемые из ЗОНЫ (центр остаётся ванильным!):
 * контейнеры (риск потери/дюпа содержимого) и блоки с нестандартным поведением.
 */
export const SPECIAL_BLOCK_IDS = new Set([
  // контейнеры
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel",
  "minecraft:shulker_box", "minecraft:undyed_shulker_box",
  "minecraft:white_shulker_box", "minecraft:orange_shulker_box", "minecraft:magenta_shulker_box",
  "minecraft:light_blue_shulker_box", "minecraft:yellow_shulker_box", "minecraft:lime_shulker_box",
  "minecraft:pink_shulker_box", "minecraft:gray_shulker_box", "minecraft:light_gray_shulker_box",
  "minecraft:cyan_shulker_box", "minecraft:purple_shulker_box", "minecraft:blue_shulker_box",
  "minecraft:brown_shulker_box", "minecraft:green_shulker_box", "minecraft:red_shulker_box",
  "minecraft:black_shulker_box",
  "minecraft:furnace", "minecraft:blast_furnace", "minecraft:smoker",
  "minecraft:dispenser", "minecraft:dropper", "minecraft:hopper",
  "minecraft:brewing_stand", "minecraft:lectern", "minecraft:jukebox",
  "minecraft:decorated_pot",
  // специальные
  "minecraft:beacon", "minecraft:conduit", "minecraft:end_gateway",
  "minecraft:ender_chest", "minecraft:mob_spawner",
  "minecraft:beehive", "minecraft:bee_nest",
  "minecraft:dragon_egg",
  "minecraft:suspicious_sand", "minecraft:suspicious_gravel",
  "minecraft:player_head", "minecraft:player_wall_head",
  "minecraft:skeleton_skull", "minecraft:wither_skeleton_skull",
  "minecraft:zombie_head", "minecraft:creeper_head", "minecraft:dragon_head",
  "minecraft:cake", "minecraft:cake_with_*",
]);

/** true, если typeId защищён от массового разрушения. */
export function isProtectedTypeId(typeId) {
  if (!typeId) return true;
  if (PROTECTED_BLOCK_IDS.has(typeId)) return true;
  // Служебные блоки проекта: всё, что не из ванильного namespace,
  // по умолчанию неприкосновенно (карты/аддоны со своими блоками).
  if (!typeId.startsWith("minecraft:")) return true;
  return false;
}

/** true, если блок исключён из зоны, но ванильно ломается как центр. */
export function isSpecialTypeId(typeId) {
  if (!typeId) return true;
  if (SPECIAL_BLOCK_IDS.has(typeId)) return true;
  for (const pattern of SPECIAL_BLOCK_IDS) {
    if (pattern.endsWith("*") && typeId.startsWith(pattern.slice(0, -1))) return true;
  }
  return false;
}

/**
 * Категория инструмента (v1.2.0): молот ломает ТОЛЬКО блоки «кирочной»
 * категории, как ванильная кирка. Дерево, доски, горшки, лестницы, земля,
 * листья и т.п. в зоне не трогаются.
 */
export const PICKAXE_TAGS = new Set([
  "stone", "metal", "diamond_pick_diggable",
]);
/** Блоки без тегов, но объективно кирочные. */
export const PICKAXE_EXTRA_IDS = new Set([
  "minecraft:mob_spawner", "minecraft:beacon",
  "minecraft:ice", "minecraft:packed_ice", "minecraft:blue_ice", "minecraft:frosted_ice",
  "minecraft:obsidian", "minecraft:crying_obsidian", "minecraft:ancient_debris",
  "minecraft:reinforced_deepslate", "minecraft:glowstone",
  "minecraft:rail", "minecraft:golden_rail", "minecraft:detector_rail", "minecraft:activator_rail",
  "minecraft:iron_door", "minecraft:iron_trapdoor", "minecraft:ender_chest",
  "minecraft:coal_ore", "minecraft:iron_ore", "minecraft:copper_ore", "minecraft:gold_ore",
  "minecraft:diamond_ore", "minecraft:lapis_ore", "minecraft:redstone_ore",
  "minecraft:emerald_ore", "minecraft:nether_quartz_ore", "minecraft:nether_gold_ore",
  "minecraft:ancient_debris", "minecraft:monster_egg",
]);

/** Является ли блок кирочной категории. tags — массив тегов блока или null. */
export function isPickaxeCategory(typeId, tags) {
  if (PICKAXE_EXTRA_IDS.has(typeId)) return true;
  if (!tags) return true; // теги недоступны (старый API/мок без тегов) — не блокируем
  return tags.some((t) => PICKAXE_TAGS.has(t));
}

/**
 * Проверка кандидата зоны.
 * @param block живой Block (или мок): isAir(), isLiquid(), typeId, getComponent(), getTags()
 * @returns {{allowed:boolean, reason:string, typeId:string}}
 */
export function evaluateBlock(block) {
  if (!block) return { allowed: false, reason: "unloaded", typeId: "?" };
  const typeId = block.typeId ?? "?";

  let isAir = false, isLiquid = false;
  try {
    isAir = block.isAir === true || (typeof block.isAir === "function" ? block.isAir() === true : false);
    isLiquid = block.isLiquid === true || (typeof block.isLiquid === "function" ? block.isLiquid() === true : false);
  } catch { /* блок мог выгрузиться */ }

  if (isAir) return { allowed: false, reason: "air", typeId };
  if (isLiquid) return { allowed: false, reason: "liquid", typeId };
  if (isProtectedTypeId(typeId)) return { allowed: false, reason: "protected", typeId };
  if (isSpecialTypeId(typeId)) return { allowed: false, reason: "special", typeId };

  // Категория инструмента: только «кирочные» блоки (камень/металл/руды…).
  let tags = null;
  try {
    tags = typeof block.getTags === "function" ? block.getTags() : null;
  } catch { /* tags недоступны */ }
  if (!isPickaxeCategory(typeId, tags)) return { allowed: false, reason: "wrong_tool", typeId };

  // Контейнер по компоненту (кастомные контейнеры других аддонов).
  try {
    const inv = block.getComponent && block.getComponent("minecraft:inventory");
    if (inv && typeof inv.container !== "undefined" && inv.container) {
      return { allowed: false, reason: "container_component", typeId };
    }
  } catch { /* нет компонента — ок */ }

  return { allowed: true, reason: "ok", typeId };
}
