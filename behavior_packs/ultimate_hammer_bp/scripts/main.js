/**
 * Ultimate Hammer — main (entry point).
 * Pipeline (ТЗ 02): захват → проверка молота → face/faceLocation → анализ игрока →
 * выбор направления → радиус → генерация плоскости → фильтр → разрушение → дроп →
 * прочность → debug.
 */

import { world, system } from "@minecraft/server";
import { CONFIG, mergeConfig } from "./config.js";
import { identifyHammer, pickRadius, radiusToSize, HAMMER_IDS } from "./detector.js";
import { initAdapter, buildInput, trackPlayerLifecycle, dumpRawEventOnce } from "./adapter.js";
import { resolveDirection } from "./resolver.js";
import * as executor from "./executor.js";
import * as logger from "./logger.js";
import { selfTest } from "./selftest.js";

// Память направления для гистерезиса: playerId → {last:{plane}}
const memory = new Map();

initAdapter();
trackPlayerLifecycle();
executor.startWatcher();

world.afterEvents.playerStartBreakingBlock.subscribe((ev) => {
  dumpRawEventOnce(ev);
  const descriptor = identifyHammer(ev.heldItemStack);
  if (!descriptor) return;

  const player = ev.player;
  const input = buildInput(ev);

  let override = undefined;
  try { override = player.getDynamicProperty("uh:radius"); } catch { }
  const radius = pickRadius(input.isSneaking, override, CONFIG);

  const mem = memory.get(player.id) ?? {};
  const decision = resolveDirection(input, CONFIG.direction, mem);
  mem.last = { plane: decision.plane };
  memory.set(player.id, mem);

  executor.startBreak(input, decision, descriptor, radius);
});

world.afterEvents.playerBreakBlock.subscribe((ev) => executor.onBreak(ev));
world.afterEvents.playerCancelBreakingBlock.subscribe((ev) => executor.onCancel(ev));

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  logger.chat(p, "§6🔨 Ultimate Hammer §7v" + CONFIG.addonVersion);
  logger.chat(p, "§7  3×3 обычно · 1×1 в приседе · скорость кирки уровнем выше");
  logger.chat(p, "§7  /scriptevent uh:help — команды и отладка");
  logger.chat(p, "§7  Если иконки молотов — чёрно-фиолетовая сетка, добавь в мир §fUltimate Hammer [RP]§7 (ресурспак)");
});

// ── Команды: /scriptevent uh:<cmd> [args] ─────────────────────────────────
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const player = ev.sourceEntity;
  const [cmd, ...args] = ev.message.trim().split(/\s+/);

  const reply = (t) => logger.chat(player, t);
  switch (cmd) {
    case "help":
      reply("§6Ultimate Hammer — команды");
      reply("§e/scriptevent uh:radius 0|1|2§7 — своя зона (0=1×1, 1=3×3, §o2=5×5 эксперимент§r§7)");
      reply("§e/scriptevent uh:radius default§7 — сбросить на серверную");
      reply("§e/scriptevent uh:debug on|off|chat§7 — отладка (actionbar/консоль/чат)");
      reply("§e/scriptevent uh:dump [n]§7 — последние решения в чат");
      reply("§e/scriptevent uh:stats§7 — статистика ударов");
      reply("§e/scriptevent uh:config§7 — текущие пороги");
      reply("§e/scriptevent uh:selftest§7 — самопроверка математики в игре");
      break;

    case "radius": {
      const v = args[0];
      if (v === undefined) {
        reply("§7текущий радиус: " + (((player?.getDynamicProperty("uh:radius")) ?? CONFIG.defaultRadius)));
      } else if (v === "default") {
        try { player.setDynamicProperty("uh:radius", undefined); } catch { }
        reply("§aрадиус сброшен на серверный (" + radiusToSize(CONFIG.defaultRadius) + ")");
      } else if (["0", "1", "2"].includes(v)) {
        try { player.setDynamicProperty("uh:radius", Number(v)); } catch { }
        reply("§aличная зона: " + radiusToSize(Number(v)) + (Number(v) === 2 ? " §o(эксперимент 5×5)" : ""));
      } else reply("§c0, 1, 2 или default");
      break;
    }

    case "debug": {
      const v = args[0] ?? "on";
      if (v === "on") { CONFIG.debug.enabled = true; CONFIG.debug.actionbar = true; reply("§aотладка включена"); }
      else if (v === "off") { CONFIG.debug.enabled = false; reply("§cотладка выключена"); }
      else if (v === "chat") { CONFIG.debug.enabled = true; CONFIG.debug.chat = !CONFIG.debug.chat; reply("§achat-лог: " + (CONFIG.debug.chat ? "вкл" : "выкл")); }
      else reply("§con|off|chat");
      break;
    }

    case "dump": {
      const n = Math.min(Number(args[0]) || 10, 50);
      const entries = logger.dump(n);
      if (entries.length === 0) reply("§7пока пусто — ударь молотом по блоку");
      for (const e of entries) reply("§8[UHD]§r " + JSON.stringify(e));
      break;
    }

    case "stats": {
      const s = executor.getStats();
      reply(`§6статистика§7: ударов ${s.swings}, блоков ${s.blocks}, начато ${s.started}, pending ${s.pending}`);
      reply(`§7зоны: ${JSON.stringify(s.byZone)} · плоскости: ${JSON.stringify(s.byPlane)}`);
      break;
    }

    case "config":
      reply("§6config.direction§r " + JSON.stringify(CONFIG.direction));
      reply("§6config.breaking§r " + JSON.stringify(CONFIG.breaking));
      reply("§6durability§r " + CONFIG.durabilityMode + " · §6drops.manual§r " + CONFIG.drops.manualDrops);
      break;

    case "selftest": {
      const r = selfTest();
      for (const line of r.lines) reply(line);
      reply(r.ok ? "§a✔ Самопроверка пройдена" : "§c✘ Есть ошибки!");
      break;
    }

    default:
      if (cmd) reply("§cнеизвестная команда: " + cmd + " (см. uh:help)");
  }
});

logger.info("Ultimate Hammer v" + CONFIG.addonVersion + " загружен (" + CONFIG.targetModule + ", цель " + CONFIG.targetGame + ")");
