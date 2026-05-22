export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d >  Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
