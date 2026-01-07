interface HabitEntry {
  ingredient: string;
  timestamp: string;
}

const store = new Map<string, HabitEntry[]>();

export async function getDailyHabits(sessionId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = store.get(sessionId) ?? [];

  const counts: Record<string, number> = {};

  for (const e of entries) {
    if (e.timestamp.startsWith(today)) {
      counts[e.ingredient] = (counts[e.ingredient] ?? 0) + 1;
    }
  }

  return Object.entries(counts).map(([ingredient, count]) => ({
    ingredient,
    count,
  }));
}

export async function recordHabit(sessionId: string, ingredient: string) {
  const entries = store.get(sessionId) ?? [];
  entries.push({ ingredient, timestamp: new Date().toISOString() });
  store.set(sessionId, entries);
}
