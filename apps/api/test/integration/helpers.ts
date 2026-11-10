/**
 * Test helpers shared by the integration suites.
 */

/**
 * Returns the first row of an insert result, failing the test when the insert
 * produced no rows. Replaces the non-null assertions the linter rejects while
 * keeping the failure message useful.
 */
export function expectRow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Expected at least one ${label} row`);
  }
  return row;
}

/**
 * Returns a matched row, failing the test when nothing matched.
 */
export function expectFound<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected to find ${label}`);
  }
  return value;
}
