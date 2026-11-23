export function createId(): string {
  return crypto.randomUUID().slice(0, 8);
}
