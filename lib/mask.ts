// Masking disabled per user request — return inputs as-is.
export function maskText(text: string): string {
  return text ?? '';
}

export function maskEmail(email: string): string {
  return email ?? '';
}
