import { en, type MessageKey } from "./en";

export function locale(
  overrides: Partial<Record<MessageKey, string>>,
): Record<MessageKey, string> {
  return { ...en, ...overrides };
}
