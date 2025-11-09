import Papa from 'papaparse'

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
        csvRow[col.header] = row[col.key]
      })
      return csvRow
    })
  } else {
    csvData = data
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

