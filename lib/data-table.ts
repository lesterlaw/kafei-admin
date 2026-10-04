import type { ColumnDef } from '@tanstack/react-table'

export const DATA_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const

export type DataTablePageSize =
  | (typeof DATA_TABLE_PAGE_SIZE_OPTIONS)[number]
  | 'all'

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function resolvePageSize(
  pageSize: DataTablePageSize,
  total: number
): number {
  if (pageSize === 'all') return Math.max(total, 1)
  return pageSize
}

export function columnHeaderLabel<TData, TValue>(
  column: ColumnDef<TData, TValue>
): string {
  if (typeof column.header === 'string' && column.header.trim()) {
    return column.header
  }
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return String(column.accessorKey)
  }
  return column.id || ''
}

export function isActionsColumn<TData, TValue>(
  column: ColumnDef<TData, TValue>
): boolean {
  return column.id === 'actions'
}

function getAccessorFn<TData, TValue>(
  column: ColumnDef<TData, TValue>
): ((originalRow: TData, index: number) => TValue) | undefined {
  if (!('accessorFn' in column)) return undefined
  const accessorFn = (
    column as { accessorFn?: (originalRow: TData, index: number) => TValue }
  ).accessorFn
  return typeof accessorFn === 'function' ? accessorFn : undefined
}

function getByPath(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, row)
}

function formatCsvValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function buildCsvFromColumnDefs<TData, TValue>(
  rows: TData[],
  columns: ColumnDef<TData, TValue>[]
): string {
  const exportCols = columns.filter(
    (column) =>
      !isActionsColumn(column) &&
      (typeof column.header === 'string' ||
        ('accessorKey' in column && typeof column.accessorKey === 'string') ||
        Boolean(getAccessorFn(column)))
  )
  const headers = exportCols.map((column) =>
    csvEscape(columnHeaderLabel(column) || 'Column')
  )
  const lines = rows.map((row) =>
    exportCols
      .map((column) => {
        if ('accessorKey' in column && typeof column.accessorKey === 'string') {
          return csvEscape(
            formatCsvValue(getByPath(row, String(column.accessorKey)))
          )
        }
        const accessorFn = getAccessorFn(column)
        if (accessorFn) {
          return csvEscape(formatCsvValue(accessorFn(row, 0)))
        }
        return ''
      })
      .join(',')
  )
  return [headers.join(','), ...lines].join('\n')
}
