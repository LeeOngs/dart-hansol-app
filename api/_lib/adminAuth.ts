export function isValidAdminPassword(password: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return typeof password === 'string' && typeof expected === 'string' && expected.length > 0 && password === expected;
}
