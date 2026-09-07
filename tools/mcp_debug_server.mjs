#!/usr/bin/env node
/**
 * Ultimate Hammer — MCP debug server (stdio, zero dependencies).
 *
 * Возможности (tools):
 *  - uh_simulate   : прогнать резолвер направления на тестовом входе с патчем
 *                    конфига — калибровка порогов БЕЗ запуска игры;
 *  - uh_parse_log  : разобрать [UHD]-строки из лога игры/BDS и собрать сводку;
 *  - uh_checklist  : протокол тестирования из ТЗ (08/09) — чек-лист HM-001..022;
 *  - uh_config     : текущие пороги и баланс из config.js;
 *  - uh_selftest   : самопроверка чистой математики (те же тесты, что в игре).
 *
 * Запуск: node tools/mcp_debug_server.mjs   (см. .mcp.json)
 */
import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BP = resolve(HERE, "../behavior_packs/ultimate_hammer_bp/scripts");

const { CONFIG } = await import(`file://${BP}/config.js`);
const { resolveDirection } = await import(`file://${BP}/resolver.js`);
const { generatePlane } = await import(`file://${BP}/area.js`);
const { selfTest } = await import(`file://${BP}/selftest.js`);
const { HAMMERS } = await import(`file://${BP}/detector.js`);

// ── MCP stdio: newline-delimited JSON-RPC 2.0 ─────────────────────────────
const rl = createInterface({ input: process.stdin });
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyErr = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const text = (t) => [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 2) }];

// ── tools ─────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "uh_simulate",
    description: "Прогнать Direction Resolver на синтетическом HammerInput. Возвращает плоскость, зону, уверенность и полную трассировку причин. Позволяет калибровать пороги (configPatch) без запуска Minecraft.",
    inputSchema: {
      type: "object",
      properties: {
        face: { type: "string", enum: ["Up", "Down", "North", "South", "West", "East"], description: "Грань из события разрушения" },
        faceLocation: { type: "object", description: "Точка на грани относительно СЗ-угла блока (0..1)", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } },
        playerLocation: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } },
        eyeLocation: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } },
        blockLocation: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } },
        radius: { type: "integer", minimum: 0, maximum: 2, description: "0=1×1, 1=3×3, 2=5×5" },
        configPatch: { type: "object", description: "Патч поверх CONFIG.direction для эксперимента (coreRadius и т.п.)" },
        lastPlane: { type: "string", enum: ["xz", "xy", "zy"], description: "Предыдущее решение игрока — для проверки гистерезиса" },
      },
      required: ["face"],
    },
  },
  {
    name: "uh_parse_log",
    description: "Разобрать [UHD]{json} строки из лога Minecraft/BDS (вставьте текст лога). Возвращает последние решения и агрегаты по зонам/плоскостям/источникам точки.",
    inputSchema: {
      type: "object",
      properties: {
        logText: { type: "string", description: "Текст лога (можно частично)" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: ["logText"],
    },
  },
  {
    name: "uh_checklist",
    description: "Протокол тестирования из ТЗ: сценарии 08_DEBUG_TEST_PROTOCOL и чек-лист приёмки HM-001..HM-022 с местом для записи результатов.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "uh_config",
    description: "Текущая конфигурация аддона: пороги направления, прочность, дроп, отладка + таблица молотов (скорость/прочность).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "uh_selftest",
    description: "Прогнать встроенную самопроверку математики (та же, что /scriptevent uh:selftest в игре).",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── handlers ──────────────────────────────────────────────────────────────
function merge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base?.[k] && typeof base[k] === "object"
      ? merge(base[k], v) : v;
  }
  return out;
}

function handleSimulate(args) {
  const blockLocation = args.blockLocation ?? { x: 0, y: 64, z: 0 };
  const input = {
    face: args.face,
    faceLocation: args.faceLocation ?? null,
    faceLocationSource: args.faceLocation ? "ray_hit" : "none",
    playerLocation: args.playerLocation ?? null,
    eyeLocation: args.eyeLocation ?? null,
    blockLocation,
    isSneaking: false,
  };
  const dirCfg = merge(CONFIG.direction, args.configPatch ?? {});
  const memory = args.lastPlane ? { last: { plane: args.lastPlane } } : {};
  const decision = resolveDirection(input, dirCfg, memory);
  const radius = args.radius ?? 1;
  const candidates = generatePlane(blockLocation, decision.plane, radius);
  return {
    decision: {
      plane: decision.plane, zone: decision.zone, confidence: decision.confidence,
      source: decision.source, local: decision.local, delta: decision.delta,
    },
    reasons: decision.reasons,
    zone_preview: {
      radius, size: (radius * 2 + 1) + "×" + (radius * 2 + 1),
      blocks: candidates.map((c) => `${c.x} ${c.y} ${c.z}`),
    },
    thresholds_used: dirCfg,
    hint: "Плоскости: xz=горизонтальная (яма/потолок), xy=вертикальная стена вдоль X, zy=вертикальная стена вдоль Z.",
  };
}

function handleParseLog(args) {
  const entries = [];
  for (const line of String(args.logText).split(/\r?\n/)) {
    const i = line.indexOf("[UHD]");
    if (i === -1) continue;
    try {
      entries.push(JSON.parse(line.slice(i + 5).trim()));
    } catch { /* мусорные строки пропускаем */ }
  }
  const agg = { zones: {}, planes: {}, faceSources: {}, blocks: 0, cost: 0 };
  for (const e of entries) {
    agg.zones[e.decision?.zone] = (agg.zones[e.decision?.zone] ?? 0) + 1;
    agg.planes[e.decision?.plane] = (agg.planes[e.decision?.plane] ?? 0) + 1;
    agg.faceSources[e.input?.faceLocationSource] = (agg.faceSources[e.input?.faceLocationSource] ?? 0) + 1;
    agg.blocks += e.result?.destroyed ?? 0;
    agg.cost += e.result?.cost ?? 0;
  }
  const last = entries.slice(-(args.limit ?? 20)).map((e) => ({
    player: e.player, face: e.input?.face, hit: e.input?.hitFace,
    faceLoc: e.input?.faceLocation, src: e.input?.faceLocationSource,
    dist: e.input?.distance, plane: e.decision?.plane, zone: e.decision?.zone,
    conf: e.decision?.confidence, size: e.size, destroyed: e.result?.destroyed,
    skipped: e.result?.skipped,
  }));
  return { parsed: entries.length, aggregates: agg, last_decisions: last };
}

function handleChecklist() {
  return {
    protocol: [
      "PC: центр грани, края, углы, диагонали, резкие движения камеры, вплотную к стороне",
      "Touch: те же тесты + тапы в разных частях экрана (палец не должен менять плоскость)",
      "Up/Down: строго над/под центром; смещение 25/50/75%; почти сбоку; вплотную к стороне; углы; разные высоты и направления взгляда",
      "Фиксация каждого теста: ожидалось → получено → правильно? → проблема → изменение → повтор",
    ],
    cases: [
      "HM-001 присед → 1×1", "HM-002 обычный удар → 3×3", "HM-003 уровень 5×5 → плоская 5×5 (/scriptevent uh:radius 2)",
      "HM-004 North → X/Y", "HM-005 South → X/Y", "HM-006 West → Z/Y", "HM-007 East → Z/Y",
      "HM-008 Up center", "HM-009 Up edge", "HM-010 Up corner", "HM-011 Down center", "HM-012 Down edge", "HM-013 Down near side",
      "HM-014 Up/Down touch", "HM-015 Up/Down PC", "HM-016 порог туда-сюда → нет дрожания",
      "HM-017 защищённый блок не ломается", "HM-018 смешанная зона: каждый блок через фильтр",
      "HM-019 дроп без дюпов", "HM-020 прочность по модели", "HM-021 скорость по таблице", "HM-022 5×5 производительность",
    ],
    how_to_collect: "В игре: /scriptevent uh:debug chat (полный лог в чат) или смотреть консоль/лог: строки [UHD]{...}. Вставьте лог в uh_parse_log.",
  };
}

function handleConfig() {
  return {
    direction: CONFIG.direction,
    breaking: CONFIG.breaking,
    durabilityMode: CONFIG.durabilityMode,
    drops: CONFIG.drops,
    hammers: HAMMERS,
    speed_rule: "молот материала N = кирка материала N+1 (wood→4, stone→6, iron→8, diamond→9); netherite — балансное 12; golden — 13 (выше золотой кирки)",
  };
}

async function handleToolCall(name, args) {
  switch (name) {
    case "uh_simulate": return handleSimulate(args ?? {});
    case "uh_parse_log": return handleParseLog(args ?? {});
    case "uh_checklist": return handleChecklist();
    case "uh_config": return handleConfig();
    case "uh_selftest": {
      const r = selfTest();
      return { ok: r.ok, pass: r.pass, fail: r.fail, lines: r.lines.map((l) => l.replace(/§[0-9a-z]/g, "")) };
    }
    default:
      throw new Error("unknown tool: " + name);
  }
}

// ── dispatch ──────────────────────────────────────────────────────────────
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;

  if (method === "initialize") {
    reply(id, {
      protocolVersion: params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "ultimate-hammer-debug", version: "1.0.1" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;

  if (method === "ping") { reply(id, {}); return; }

  if (method === "tools/list") {
    reply(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    handleToolCall(params?.name, params?.arguments)
      .then((r) => reply(id, { content: text(r) }))
      .catch((e) => reply(id, { content: text("Ошибка: " + e.message), isError: true }));
    return;
  }

  if (id !== undefined) replyErr(id, -32601, "method not found: " + method);
});

process.stderr.write("[uh-mcp] ready: tools uh_simulate, uh_parse_log, uh_checklist, uh_config, uh_selftest\n");
