const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function padToWeekStartMonday(date) {
  const next = startOfDay(date)
  const day = next.getDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  next.setDate(next.getDate() - daysSinceMonday)
  return next
}

export function padToWeekEndSunday(date) {
  const next = startOfDay(date)
  const day = next.getDay()
  const daysUntilSunday = day === 0 ? 0 : 7 - day
  next.setDate(next.getDate() + daysUntilSunday)
  return next
}

export function eachCalendarDay(start, end) {
  const days = []
  const current = startOfDay(start)
  const last = startOfDay(end)

  if (!Number.isFinite(current.getTime()) || !Number.isFinite(last.getTime()) || current > last) {
    return days
  }

  while (current <= last) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  return days
}

/** Rolling 12 calendar months ending on the latest relevant day (today or last tx). */
export function getHeatmapRange(txCounts) {
  const sortedDates = Object.keys(txCounts).sort()
  if (sortedDates.length === 0) {
    return null
  }

  const today = startOfDay(new Date())
  const dataMax = startOfDay(parseDateStr(sortedDates[sortedDates.length - 1]))
  const displayEnd = dataMax > today ? today : dataMax
  const displayStart = startOfDay(new Date(displayEnd.getFullYear(), displayEnd.getMonth() - 11, 1))

  return {
    displayStart,
    displayEnd,
    displayStartStr: toDateStr(displayStart),
    displayEndStr: toDateStr(displayEnd),
  }
}

export function listMonthsInRange(displayStart, displayEnd) {
  const months = []
  let cursor = new Date(displayStart.getFullYear(), displayStart.getMonth(), 1)
  const last = new Date(displayEnd.getFullYear(), displayEnd.getMonth(), 1)

  while (cursor <= last) {
    const monthStart = startOfDay(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
    const monthEnd = startOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
    const visibleStart = monthStart < displayStart ? displayStart : monthStart
    const visibleEnd = monthEnd > displayEnd ? displayEnd : monthEnd

    months.push({
      month: cursor.getMonth(),
      year: cursor.getFullYear(),
      label: MONTHS[cursor.getMonth()],
      visibleStart,
      visibleEnd,
    })

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  return months
}

export function buildMonthBlock(txCounts, monthInfo) {
  const { visibleStart, visibleEnd, month, year, label } = monthInfo
  const paddedStart = padToWeekStartMonday(visibleStart)
  const paddedEnd = padToWeekEndSunday(visibleEnd)
  const days = eachCalendarDay(paddedStart, paddedEnd)

  if (days.length === 0) {
    return { month, year, label, numWeeks: 0, cells: [] }
  }

  const numWeeks = Math.ceil(days.length / 7)
  const visibleStartDay = startOfDay(visibleStart)
  const visibleEndDay = startOfDay(visibleEnd)
  const cells = []

  days.forEach((day, dayIndex) => {
    const weekIndex = Math.floor(dayIndex / 7)
    const row = dayIndex % 7
    const dateStr = toDateStr(day)
    const dayStart = startOfDay(day)
    const inMonth = day.getMonth() === month && day.getFullYear() === year
    const inVisibleRange = dayStart >= visibleStartDay && dayStart <= visibleEndDay
    const isActive = inMonth && inVisibleRange

    cells.push({
      date: dateStr,
      count: isActive ? (txCounts[dateStr] || 0) : 0,
      isActive,
      weekIndex,
      row,
      month,
    })
  })

  return { month, year, label, numWeeks, cells }
}

export function buildHeatmapMonthBlocks(txCounts, range) {
  if (!range) {
    return []
  }

  return listMonthsInRange(range.displayStart, range.displayEnd)
    .map((monthInfo) => buildMonthBlock(txCounts, monthInfo))
    .filter((block) => block.numWeeks > 0)
}

/** @deprecated use getHeatmapRange */
export function getDisplayRange(txCounts, heatmapPeriod = '1y') {
  if (heatmapPeriod === 'all') {
    const sortedDates = Object.keys(txCounts).sort()
    if (sortedDates.length === 0) return null
    const displayStart = startOfDay(parseDateStr(sortedDates[0]))
    const displayEnd = startOfDay(parseDateStr(sortedDates[sortedDates.length - 1]))
    return {
      displayStart,
      displayEnd,
      displayStartStr: toDateStr(displayStart),
      displayEndStr: toDateStr(displayEnd),
      paddedStart: padToWeekStartMonday(displayStart),
      paddedEnd: padToWeekEndSunday(displayEnd),
    }
  }
  return getHeatmapRange(txCounts)
}

/** @deprecated use buildHeatmapMonthBlocks */
export function buildHeatmapMatrix(txCounts, range) {
  const blocks = buildHeatmapMonthBlocks(txCounts, range)
  if (blocks.length === 0) {
    return { matrix: [], numWeeks: 0 }
  }

  const block = blocks[0]
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: block.numWeeks }, () => null))

  block.cells.forEach((cell) => {
    matrix[cell.row][cell.weekIndex] = {
      date: cell.date,
      count: cell.count,
      inDisplayRange: cell.isActive,
      month: cell.month,
      dayOfMonth: parseDateStr(cell.date).getDate(),
    }
  })

  return { matrix, numWeeks: block.numWeeks }
}
