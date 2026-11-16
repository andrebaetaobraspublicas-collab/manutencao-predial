/** Normalize decimal entry for the API without performing financial arithmetic. */
export function decimalInput(value: string): string {
  const compact = value.trim().replace(/\s/g, '').replace(/^R\$/, '');
  return compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
}
