'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Search,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  buildCsvFromColumnDefs,
  columnHeaderLabel,
  DATA_TABLE_PAGE_SIZE_OPTIONS,
  downloadCsv,
  isActionsColumn,
  resolvePageSize,
  type DataTablePageSize,
} from '@/lib/data-table'

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, option, [role="dialog"], [role="combobox"], [role="listbox"], [role="option"], [role="button"], [data-slot="select-content"], [data-no-row-nav], [data-row-nav-ignore]'

const FILTERABLE_IDS = new Set([
  'status',
  'is_blocked',
  'is_active',
  'is_hidden',
  'is_redeemed',
  'is_system',
  'has_device_token',
  'type',
  'kind',
  'temperature',
  'payment_method',
  'source',
])

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  exportFilename?: string
  /** Serializable path prefix, e.g. /dashboard/users → /dashboard/users/{id} */
  rowHrefBase?: string
  rowHrefIdKey?: string
}

function rowHref(row: unknown, rowHrefBase?: string, idKey = 'id') {
  if (!rowHrefBase) return undefined
  const id = (row as Record<string, unknown>)?.[idKey]
  if (typeof id !== 'string' || !id) return undefined
  return `${rowHrefBase.replace(/\/$/, '')}/${id}`
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </label>
  )
}

function booleanFilterLabel(columnId: string, value: boolean): string {
  if (columnId === 'is_blocked') return value ? 'Blocked' : 'Active'
  if (columnId === 'is_redeemed') return value ? 'Redeemed' : 'Active'
  if (columnId === 'is_active') return value ? 'Active' : 'Inactive'
  if (columnId === 'is_hidden') return value ? 'Hidden' : 'Visible'
  if (columnId === 'is_system') return value ? 'System' : 'Custom'
  if (columnId === 'has_device_token') return value ? 'Paired' : 'No token'
  return value ? 'Yes' : 'No'
}

function filterOptionLabel(columnId: string, value: unknown): string {
  if (typeof value === 'boolean') return booleanFilterLabel(columnId, value)
  if (value == null || value === '') return '—'
  return String(value).replaceAll('_', ' ')
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  exportFilename = 'export',
  rowHrefBase,
  rowHrefIdKey = 'id',
}: DataTableProps<TData, TValue>) {
  const router = useRouter()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState<DataTablePageSize>(10)

  const filterableColumns = React.useMemo(() => {
    return columns
      .map((column) => {
        const id =
          column.id ||
          ('accessorKey' in column ? String(column.accessorKey) : '')
        if (!id || isActionsColumn(column) || !FILTERABLE_IDS.has(id)) {
          return null
        }
        const unique = new Map<string, string>()
        for (const row of data) {
        const accessorFn =
          'accessorFn' in column
            ? (column as { accessorFn?: (row: TData, index: number) => unknown })
                .accessorFn
            : undefined
        const raw =
          typeof accessorFn === 'function'
            ? accessorFn(row, 0)
            : 'accessorKey' in column && typeof column.accessorKey === 'string'
              ? (row as Record<string, unknown>)[column.accessorKey as string]
              : (row as Record<string, unknown>)[id]
          if (raw == null || raw === '') continue
          unique.set(String(raw), filterOptionLabel(id, raw))
        }
        if (unique.size < 2 || unique.size > 20) return null
        return {
          id,
          label: columnHeaderLabel(column) || id,
          options: [...unique.entries()].map(([value, label]) => ({
            value,
            label,
          })),
        }
      })
      .filter((column): column is NonNullable<typeof column> => Boolean(column))
  }, [columns, data])

  const sortableColumns = React.useMemo(() => {
    return columns
      .filter((column) => {
        if (isActionsColumn(column)) return false
        if (column.enableSorting === false) return false
        return (
          ('accessorKey' in column && Boolean(column.accessorKey)) ||
          Boolean(
            'accessorFn' in column &&
              typeof (column as { accessorFn?: unknown }).accessorFn ===
                'function'
          )
        )
      })
      .map((column) => ({
        id:
          column.id ||
          ('accessorKey' in column ? String(column.accessorKey) : ''),
        label: columnHeaderLabel(column),
      }))
      .filter((column) => column.id && column.label)
  }, [columns])

  const resolvedPageSize = resolvePageSize(pageSize, data.length)
  const tableColumns = React.useMemo(
    () =>
      columns.map((column) =>
        isActionsColumn(column)
          ? { ...column, enableSorting: false, enableGlobalFilter: false }
          : {
              ...column,
              filterFn:
                column.filterFn ??
                ((row, columnId, filterValue) => {
                  if (filterValue == null || filterValue === '') return true
                  return String(row.getValue(columnId)) === String(filterValue)
                }),
            }
      ),
    [columns]
  )

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      setSorting(updater)
      setPageIndex(0)
    },
    onGlobalFilterChange: (updater) => {
      setGlobalFilter(updater)
      setPageIndex(0)
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater)
      setPageIndex(0)
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: resolvedPageSize })
          : updater
      setPageIndex(next.pageIndex)
      if (pageSize !== 'all') {
        setPageSize(next.pageSize as DataTablePageSize)
      }
    },
    globalFilterFn: 'includesString',
    autoResetPageIndex: false,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      pagination: {
        pageIndex,
        pageSize: resolvedPageSize,
      },
    },
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  const size = resolvePageSize(pageSize, filteredCount)
  const totalPages = Math.max(1, Math.ceil(filteredCount / size) || 1)
  const safePage = Math.min(pageIndex + 1, totalPages)
  const rangeStart = filteredCount === 0 ? 0 : (safePage - 1) * size + 1
  const rangeEnd = Math.min(safePage * size, filteredCount)

  React.useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1))
    }
  }, [pageIndex, totalPages])

  const activeFilterCount =
    columnFilters.filter((filter) => Boolean(filter.value)).length +
    (globalFilter.trim() ? 1 : 0)

  function clearFilters() {
    setGlobalFilter('')
    setColumnFilters([])
    setSorting([])
    setPageIndex(0)
  }

  function onExport() {
    const rows = table.getFilteredRowModel().rows.map((row) => row.original)
    const csv = buildCsvFromColumnDefs(rows, columns)
    downloadCsv(exportFilename, csv)
  }

  const sortValue =
    sorting[0] != null ? `${sorting[0].id}:${sorting[0].desc ? 'desc' : 'asc'}` : '__none__'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <FilterField label="Search" className="min-w-[12rem] flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter ?? ''}
              onChange={(event) => setGlobalFilter(String(event.target.value))}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </FilterField>

        {sortableColumns.length > 0 ? (
          <FilterField label="Sort">
            <Select
              value={sortValue}
              onValueChange={(value) => {
                if (!value || value === '__none__') {
                  setSorting([])
                } else {
                  const [id, dir] = value.split(':')
                  setSorting([{ id, desc: dir === 'desc' }])
                }
                setPageIndex(0)
              }}
            >
              <SelectTrigger className="h-8 w-[10.5rem] text-xs">
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Default</SelectItem>
                {sortableColumns.flatMap((column) => [
                  <SelectItem key={`${column.id}-asc`} value={`${column.id}:asc`}>
                    {column.label} ↑
                  </SelectItem>,
                  <SelectItem
                    key={`${column.id}-desc`}
                    value={`${column.id}:desc`}
                  >
                    {column.label} ↓
                  </SelectItem>,
                ])}
              </SelectContent>
            </Select>
          </FilterField>
        ) : null}

        {filterableColumns.map((column) => {
          const current =
            columnFilters.find((filter) => filter.id === column.id)?.value
          return (
            <FilterField key={column.id} label={column.label}>
              <Select
                value={typeof current === 'string' && current ? current : '__all__'}
                onValueChange={(value) => {
                  setColumnFilters((prev) => {
                    const next = prev.filter((filter) => filter.id !== column.id)
                    if (!value || value === '__all__') return next
                    return [...next, { id: column.id, value }]
                  })
                  setPageIndex(0)
                }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {column.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )
        })}

        {activeFilterCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}

        <div className="ml-auto flex flex-wrap items-end gap-2 pb-px">
          <span className="pb-1.5 text-xs tabular-nums text-muted-foreground">
            {filteredCount.toLocaleString('en-SG')} row
            {filteredCount === 1 ? '' : 's'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={filteredCount === 0}
            onClick={onExport}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-left hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </span>
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const href = rowHref(row.original, rowHrefBase, rowHrefIdKey)
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={cn(href && 'cursor-pointer')}
                    tabIndex={href ? 0 : undefined}
                    role={href ? 'link' : undefined}
                    onClick={(event) => {
                      if (!href) return
                      const target = event.target as HTMLElement
                      if (target.closest(INTERACTIVE_SELECTOR)) {
                        return
                      }
                      if (event.metaKey || event.ctrlKey) {
                        window.open(href, '_blank', 'noopener,noreferrer')
                        return
                      }
                      router.push(href)
                    }}
                    onKeyDown={(event) => {
                      if (!href) return
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      const target = event.target as HTMLElement
                      if (target.closest(INTERACTIVE_SELECTOR)) return
                      event.preventDefault()
                      router.push(href)
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t bg-white px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const next: DataTablePageSize =
                  value === 'all'
                    ? 'all'
                    : (Number.parseInt(value, 10) as DataTablePageSize)
                setPageSize(next)
                setPageIndex(0)
              }}
            >
              <SelectTrigger className="h-7 w-[4.75rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_TABLE_PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
                <SelectItem value="all">ALL</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <span className="text-xs tabular-nums text-muted-foreground">
            {filteredCount === 0
              ? '0-0 of 0'
              : `${rangeStart.toLocaleString('en-SG')}-${rangeEnd.toLocaleString('en-SG')} of ${filteredCount.toLocaleString('en-SG')}`}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-1.5"
              disabled={safePage <= 1}
              onClick={() => setPageIndex(0)}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-1.5"
              disabled={safePage <= 1}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-1.5"
              disabled={safePage >= totalPages}
              onClick={() =>
                setPageIndex((current) => Math.min(totalPages - 1, current + 1))
              }
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-1.5"
              disabled={safePage >= totalPages}
              onClick={() => setPageIndex(totalPages - 1)}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
