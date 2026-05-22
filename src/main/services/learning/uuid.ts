import { randomUUID } from 'crypto'

/** Generate a random UUID v4 */
export function uuid(): string {
  return randomUUID()
}
