/**
 * Ultimate Hammer — Area Generator.
 * generatePlane(center, plane, radius) — плоская область в выбранной плоскости.
 * Третья координата всегда фиксирована на уровне центрального блока (никаких 3×3×3).
 * Чистая функция — тестируется в Node.
 */

export const PLANES = Object.freeze({
  xz: { axes: ["x", "z"], normalAxis: "y", label: "X/Z" }, // Up / Down
  xy: { axes: ["x", "y"], normalAxis: "z", label: "X/Y" }, // North / South
  zy: { axes: ["z", "y"], normalAxis: "x", label: "Z/Y" }, // West / East
});

/** Плоскость по боковой грани: North/South → X/Y, West/East → Z/Y. */
export function planeForFace(face) {
  switch (face) {
    case "North":
    case "South":
      return "xy";
    case "West":
    case "East":
      return "zy";
    case "Up":
    case "Down":
      return "xz";
    default:
      return null;
  }
}

/**
 * @param {{x:number,y:number,z:number}} center блок-центр (int-координаты)
 * @param {"xz"|"xy"|"zy"} plane
 * @param {number} radius 0 | 1 | 2
 * @returns {Array<{x:number,y:number,z:number}>} кандидаты; центр — первым,
 *   далее по возрастанию чебышёвской дистанции от центра (детерминированно).
 */
export function generatePlane(center, plane, radius) {
  const spec = PLANES[plane];
  if (!spec) throw new Error("unknown plane: " + plane);
  const r = Math.max(0, Math.min(2, Math.floor(radius)));
  const [a, b] = spec.axes;
  const out = [];
  for (let da = -r; da <= r; da++) {
    for (let db = -r; db <= r; db++) {
      const p = { x: center.x, y: center.y, z: center.z };
      p[a] += da;
      p[b] += db;
      out.push(p);
    }
  }
  out.sort((p, q) => {
    const dp = Math.max(Math.abs(p[a] - center[a]), Math.abs(p[b] - center[b]));
    const dq = Math.max(Math.abs(q[a] - center[a]), Math.abs(q[b] - center[b]));
    return dp - dq;
  });
  return out;
}
