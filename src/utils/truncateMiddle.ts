/** Keep both ends, fitting the actual font width rather than a character limit. */
export function truncateMiddle(text: string, width: number, measure: (value: string) => number): string {
  if (width <= 0) return "";
  if (measure(text) <= width) return text;
  if (measure("…") > width) return "";
  const characters = Array.from(text);
  const candidate = (count: number) => characters.slice(0, Math.ceil(count / 2)).join("") + "…"
    + (count > 1 ? characters.slice(-Math.floor(count / 2)).join("") : "");
  let low = 0, high = characters.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(candidate(middle)) <= width) low = middle;
    else high = middle - 1;
  }
  return candidate(low);
}
