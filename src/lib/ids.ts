import { randomUUID } from "node:crypto";

export function nid(): string {
  return randomUUID();
}
