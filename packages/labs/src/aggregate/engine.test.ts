import { describe, expect, it } from "vitest";
import { PipelineError, PLAYS, PRESETS, runPipeline } from "./index";

const docs = [
  { _id: 1, game: "Azul", minutes: 40, rating: 4 },
  { _id: 2, game: "Catan", minutes: 80, rating: 5 },
  { _id: 3, game: "Azul", minutes: 30, rating: 3 },
];

const last = (p: unknown[]) => runPipeline(docs, p).at(-1);

describe("aggregation engine", () => {
  it("$match supports equality and comparison operators", () => {
    expect(last([{ $match: { game: "Azul" } }])).toHaveLength(2);
    expect(last([{ $match: { minutes: { $gte: 40, $lt: 80 } } }])).toEqual([docs[0]]);
    expect(last([{ $match: { game: { $in: ["Catan"] } } }])).toEqual([docs[1]]);
    expect(last([{ $match: { $or: [{ minutes: 30 }, { rating: 5 }] } }])).toHaveLength(2);
  });

  it("$group with accumulators", () => {
    const out = last([{ $group: { _id: "$game", n: { $sum: 1 }, avg: { $avg: "$rating" }, max: { $max: "$minutes" } } }, { $sort: { _id: 1 } }]);
    expect(out).toEqual([
      { _id: "Azul", n: 2, avg: 3.5, max: 40 },
      { _id: "Catan", n: 1, avg: 5, max: 80 },
    ]);
  });

  it("$group with _id null aggregates everything", () => {
    expect(last([{ $group: { _id: null, total: { $sum: "$minutes" } } }])).toEqual([{ _id: null, total: 150 }]);
  });

  it("$sort, $skip, $limit, $count", () => {
    expect(last([{ $sort: { minutes: -1 } }, { $limit: 1 }])).toEqual([docs[1]]);
    expect(last([{ $sort: { minutes: 1 } }, { $skip: 2 }])).toEqual([docs[1]]);
    expect(last([{ $count: "n" }])).toEqual([{ n: 3 }]);
  });

  it("$project include / exclude / rename", () => {
    expect(last([{ $project: { _id: 0, game: 1 } }])?.[0]).toEqual({ game: "Azul" });
    expect(last([{ $project: { rating: 0 } }])?.[0]).toEqual({ _id: 1, game: "Azul", minutes: 40 });
    expect(last([{ $project: { name: "$game" } }])?.[0]).toEqual({ _id: 1, name: "Azul" });
  });

  it("returns the output after every stage", () => {
    expect(runPipeline(docs, [{ $match: { game: "Azul" } }, { $limit: 1 }]).map((o) => o.length)).toEqual([2, 1]);
  });

  it("does not mutate the input", () => {
    const copy = JSON.stringify(docs);
    runPipeline(docs, [{ $sort: { minutes: 1 } }, { $project: { rating: 0 } }]);
    expect(JSON.stringify(docs)).toBe(copy);
  });

  it("reports which stage is wrong", () => {
    expect(() => runPipeline(docs, [{ $limit: 1 }, { $lookup: {} }])).toThrow(PipelineError);
    expect(() => runPipeline(docs, [{ $limit: 1 }, { $lookup: {} }])).toThrow(/stage 2/);
    expect(() => runPipeline(docs, [{ $sort: { a: 2 } }])).toThrow(/1 or -1/);
    expect(() => runPipeline(docs, {})).toThrow(/array/);
  });

  it("every preset runs on the sample data", () => {
    expect(PLAYS).toHaveLength(40);
    for (const p of PRESETS) expect(runPipeline(PLAYS, p.pipeline).at(-1)!.length).toBeGreaterThan(0);
  });
});
