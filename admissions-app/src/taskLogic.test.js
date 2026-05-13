import { describe, it, expect, vi, afterEach } from "vitest";
import { getActiveTasks, mergeTaskState } from "./taskLogic.js";

describe("taskLogic", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mergeTaskState merges saved overrides", () => {
    const defs = [{ id: "hp", key: "hp", label: "H & P", dueDate: 100, cycle: 0 }];
    const saved = {
      hp: {
        status: "completed",
        assignedAt: 1,
        completedAt: 2,
        completedBy: "physician.one",
        note: "Signed",
        apiTaskId: 42,
      },
    };
    const merged = mergeTaskState(defs, saved)[0];
    expect(merged.status).toBe("completed");
    expect(merged.completedBy).toBe("physician.one");
    expect(merged.apiTaskId).toBe(42);
    expect(merged.note).toBe("Signed");
  });

  it("getActiveTasks includes H&P immediately after admit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));
    const admitTs = new Date("2026-01-01T08:00:00Z").getTime();
    const tasks = getActiveTasks(admitTs);
    expect(tasks.find((t) => t.id === "hp")).toBeTruthy();
    expect(tasks.some((t) => t.id === "30day")).toBe(false);
  });

  it("getActiveTasks exposes 30-day task after admission day 21", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-28T12:00:00Z"));
    const admitTs = new Date("2026-01-01T08:00:00Z").getTime();
    const tasks = getActiveTasks(admitTs);
    expect(tasks.some((t) => t.id === "30day")).toBe(true);
  });
});
