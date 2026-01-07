export interface DailyHabit {
  ingredient: string;
  count: number;
}

export function generateDailyInsight(habits: DailyHabit[]) {
  if (!habits.length) {
    return {
      summary: "No food scans today",
      suggestion: "Scan meals to get personalized insights",
    };
  }

  const top = habits.sort((a, b) => b.count - a.count)[0];

  return {
    summary: `You consumed ${top.ingredient} most often today.`,
    suggestion:
      top.count > 3
        ? `Consider reducing ${top.ingredient} for better balance.`
        : `Your intake looks balanced today.`,
  };
}
