/**
 * MongoDB aggregation pipeline ขนาดเล็ก รันใน browser
 * รองรับ: $match $group $sort $limit $skip $project $count
 * ตั้งใจให้พฤติกรรมตรงกับ MongoDB ในกรณีทั่วไป (ไม่ได้ครอบคลุมทุก operator)
 */
export type Doc = Record<string, unknown>;
export type Stage = Record<string, unknown>;

export class PipelineError extends Error {
  constructor(
    public stage: number,
    message: string,
  ) {
    super(`stage ${stage + 1}: ${message}`);
  }
}

export const SUPPORTED = ["$match", "$group", "$sort", "$limit", "$skip", "$project", "$count"] as const;

function get(doc: Doc, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Doc)[k] : undefined), doc);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matchValue(value: unknown, cond: unknown, stage: number): boolean {
  if (!isObj(cond)) return value === cond || (Array.isArray(value) && value.includes(cond));
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case "$eq": return value === arg;
      case "$ne": return value !== arg;
      case "$gt": return value !== undefined && compare(value, arg) > 0;
      case "$gte": return value !== undefined && compare(value, arg) >= 0;
      case "$lt": return value !== undefined && compare(value, arg) < 0;
      case "$lte": return value !== undefined && compare(value, arg) <= 0;
      case "$in":
        if (!Array.isArray(arg)) throw new PipelineError(stage, "$in ต้องเป็น array / $in needs an array");
        return arg.includes(value);
      case "$nin":
        if (!Array.isArray(arg)) throw new PipelineError(stage, "$nin ต้องเป็น array / $nin needs an array");
        return !arg.includes(value);
      case "$exists": return (value !== undefined) === Boolean(arg);
      default: throw new PipelineError(stage, `ไม่รองรับ operator ${op} / unsupported operator ${op}`);
    }
  });
}

function matches(doc: Doc, query: Record<string, unknown>, stage: number): boolean {
  return Object.entries(query).every(([key, cond]) => {
    if (key === "$or" || key === "$and") {
      if (!Array.isArray(cond)) throw new PipelineError(stage, `${key} ต้องเป็น array / ${key} needs an array`);
      const results = cond.map((q) => matches(doc, q as Record<string, unknown>, stage));
      return key === "$or" ? results.some(Boolean) : results.every(Boolean);
    }
    return matchValue(get(doc, key), cond, stage);
  });
}

/** ค่าของ expression: "$field" → ค่าในเอกสาร, อย่างอื่น → ค่าคงที่ */
function evalExpr(doc: Doc, expr: unknown): unknown {
  return typeof expr === "string" && expr.startsWith("$") ? get(doc, expr.slice(1)) : expr;
}

function group(docs: Doc[], spec: Record<string, unknown>, stage: number): Doc[] {
  if (!("_id" in spec)) throw new PipelineError(stage, "$group ต้องมี _id / $group needs an _id");
  const buckets = new Map<string, { id: unknown; docs: Doc[] }>();
  for (const d of docs) {
    const id = isObj(spec._id)
      ? Object.fromEntries(Object.entries(spec._id).map(([k, e]) => [k, evalExpr(d, e) ?? null]))
      : (evalExpr(d, spec._id) ?? null);
    const key = JSON.stringify(id);
    if (!buckets.has(key)) buckets.set(key, { id, docs: [] });
    buckets.get(key)!.docs.push(d);
  }
  return [...buckets.values()].map(({ id, docs: members }) => {
    const out: Doc = { _id: id };
    for (const [field, acc] of Object.entries(spec)) {
      if (field === "_id") continue;
      if (!isObj(acc) || Object.keys(acc).length !== 1)
        throw new PipelineError(stage, `${field} ต้องเป็น accumulator เช่น { $sum: 1 } / ${field} must be an accumulator`);
      const [op, expr] = Object.entries(acc)[0]!;
      const values = members.map((m) => evalExpr(m, expr));
      const nums = values.filter((v): v is number => typeof v === "number");
      switch (op) {
        case "$sum": out[field] = nums.reduce((s, n) => s + n, 0); break;
        case "$avg": out[field] = nums.length ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100 : null; break;
        case "$min": out[field] = nums.length ? Math.min(...nums) : null; break;
        case "$max": out[field] = nums.length ? Math.max(...nums) : null; break;
        case "$count": out[field] = members.length; break;
        case "$first": out[field] = values[0] ?? null; break;
        case "$last": out[field] = values.at(-1) ?? null; break;
        case "$push": out[field] = values; break;
        case "$addToSet": out[field] = [...new Set(values.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v)); break;
        default: throw new PipelineError(stage, `ไม่รองรับ accumulator ${op} / unsupported accumulator ${op}`);
      }
    }
    return out;
  });
}

function project(docs: Doc[], spec: Record<string, unknown>, stage: number): Doc[] {
  const entries = Object.entries(spec);
  const includeId = spec._id !== 0 && spec._id !== false;
  const fields = entries.filter(([k]) => k !== "_id");
  const inclusive = fields.some(([, v]) => v === 1 || v === true || (typeof v === "string" && v.startsWith("$")));
  const exclusive = fields.some(([, v]) => v === 0 || v === false);
  if (inclusive && exclusive) throw new PipelineError(stage, "$project ห้ามผสม 1 กับ 0 / cannot mix inclusion and exclusion");
  return docs.map((d) => {
    if (exclusive || (!inclusive && !includeId)) {
      const out = { ...d };
      for (const [k] of fields) delete out[k];
      if (!includeId) delete out._id;
      return out;
    }
    const out: Doc = {};
    if (includeId && "_id" in d) out._id = d._id;
    for (const [k, v] of fields) out[k] = typeof v === "string" ? evalExpr(d, v) : get(d, k);
    return out;
  });
}

function runStage(docs: Doc[], stage: Stage, i: number): Doc[] {
  if (!isObj(stage) || Object.keys(stage).length !== 1)
    throw new PipelineError(i, "แต่ละ stage ต้องมี operator เดียว เช่น { $match: {...} } / each stage needs exactly one operator");
  const [op, arg] = Object.entries(stage)[0]!;
  switch (op) {
    case "$match":
      if (!isObj(arg)) throw new PipelineError(i, "$match ต้องเป็น object / $match needs an object");
      return docs.filter((d) => matches(d, arg, i));
    case "$group":
      if (!isObj(arg)) throw new PipelineError(i, "$group ต้องเป็น object / $group needs an object");
      return group(docs, arg, i);
    case "$sort": {
      if (!isObj(arg)) throw new PipelineError(i, "$sort ต้องเป็น object / $sort needs an object");
      const keys = Object.entries(arg);
      if (keys.some(([, dir]) => dir !== 1 && dir !== -1)) throw new PipelineError(i, "$sort ใช้ได้แค่ 1 หรือ -1 / $sort values must be 1 or -1");
      return [...docs].sort((a, b) => {
        for (const [k, dir] of keys) {
          const c = compare(get(a, k), get(b, k));
          if (c !== 0) return c * (dir as number);
        }
        return 0;
      });
    }
    case "$limit":
    case "$skip":
      if (typeof arg !== "number" || arg < 0 || !Number.isInteger(arg))
        throw new PipelineError(i, `${op} ต้องเป็นจำนวนเต็มบวก / ${op} needs a non-negative integer`);
      return op === "$limit" ? docs.slice(0, arg) : docs.slice(arg);
    case "$project":
      if (!isObj(arg)) throw new PipelineError(i, "$project ต้องเป็น object / $project needs an object");
      return project(docs, arg, i);
    case "$count":
      if (typeof arg !== "string" || !arg) throw new PipelineError(i, "$count ต้องเป็นชื่อ field / $count needs a field name");
      return [{ [arg]: docs.length }];
    default:
      throw new PipelineError(i, `ไม่รองรับ ${op} (รองรับ: ${SUPPORTED.join(", ")}) / unsupported stage ${op}`);
  }
}

/** รัน pipeline แล้วคืนผลลัพธ์ "หลังแต่ละ stage" เพื่อให้ UI แสดงทีละขั้นได้ */
export function runPipeline(docs: Doc[], pipeline: unknown): Doc[][] {
  if (!Array.isArray(pipeline)) throw new PipelineError(-1, "pipeline ต้องเป็น array / the pipeline must be an array");
  const outputs: Doc[][] = [];
  let current = docs;
  pipeline.forEach((stage, i) => {
    current = runStage(current, stage as Stage, i);
    outputs.push(current);
  });
  return outputs;
}
