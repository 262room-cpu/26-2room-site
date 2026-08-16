function parseDate(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch.map(Number)
      const date = new Date(year, month - 1, day)

      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null
      }

      return date
    }
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function calculateAgeOnDate(birthDate, targetDate) {
  const birth = parseDate(birthDate)
  const target = parseDate(targetDate)

  if (!birth || !target || birth > target) {
    return null
  }

  let age = target.getFullYear() - birth.getFullYear()
  const birthdayHasPassed =
    target.getMonth() > birth.getMonth() ||
    (target.getMonth() === birth.getMonth() && target.getDate() >= birth.getDate())

  if (!birthdayHasPassed) {
    age -= 1
  }

  return age
}
