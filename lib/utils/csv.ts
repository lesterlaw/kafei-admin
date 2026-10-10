import Papa from 'papaparse'
import { toCsvCell } from '@/lib/datetime'

export const exportToCSV = <T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; header: string }[]
) => {
  let csvData: any[]

  if (columns) {
    csvData = data.map((row) => {
      const csvRow: Record<string, any> = {}
      columns.forEach((col) => {
        csvRow[col.header] = toCsvCell(row[col.key])
      })
      return csvRow
    })
  } else {
    csvData = data.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toCsvCell(value)]))
    )
  }

  const csv = Papa.unparse(csvData)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}




