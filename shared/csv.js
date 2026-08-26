function protectCsvFormula(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

export function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const protectedValue = protectCsvFormula(String(value))
  return `"${protectedValue.replaceAll('"', '""')}"`
}

export function buildCsv(headers, rows) {
  const lines = [
    headers.map(({ label }) => escapeCsvValue(label)).join(','),
    ...rows.map((row) =>
      headers.map(({ key }) => escapeCsvValue(row[key])).join(','),
    ),
  ]

  return `\uFEFF${lines.join('\r\n')}`
}
