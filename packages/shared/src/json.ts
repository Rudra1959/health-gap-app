export function cleanJson(input: string): string {
  const first = input.indexOf("{");
  const last = input.lastIndexOf("}");
  if (first === -1 || last === -1) return input;
  return input.slice(first, last + 1);
}
