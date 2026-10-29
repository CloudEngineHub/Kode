// socat parses its own address syntax even when an address is passed as argv.
// Escape its separators and grouping characters before any shell quoting.
export function escapeSocatPath(value: string): string {
  return value.replace(/[\\,:!'"()[\]{}]/g, '\\$&')
}
