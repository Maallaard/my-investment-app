import * as pdfjsLib from "pdfjs-dist"
import pdfjsWorker from "pdfjs-dist/build/pdf.worker?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export async function parseTossPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const trades = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items = content.items.map(item => item.str.trim()).filter(s => s)

    let j = 0
    while (j < items.length) {
      const dateMatch = items[j].match(/^(\d{4}\.\d{2}\.\d{2})$/)
      if (dateMatch) {
        const date = dateMatch[1].replace(/\./g, "-")
        const type = items[j + 1]
        const nameRaw = items[j + 2] || ""
        const name = nameRaw.replace(/\(.*?\)/g, "").trim()

        const typeStr = type === "구매" ? "buy" : type === "판매" ? "sell" : null
        if (!typeStr) { j++; continue }

        const qtyRaw = items[j + 4]
        const priceRaw = items[j + 7]

        if (qtyRaw && priceRaw) {
          const qtyNum = parseFloat(qtyRaw.replace(/,/g, ""))
          const priceNum = parseFloat(priceRaw.replace(/,/g, ""))

          if (!isNaN(qtyNum) && !isNaN(priceNum)) {
            const exchangeRateRaw = items[j + 3]
            const exchangeRate = parseFloat(exchangeRateRaw.replace(/,/g, ""))
            const currency = (!isNaN(exchangeRate) && exchangeRate > 100) ? "US" : "KR"

            trades.push({ date, name, type: typeStr, quantity: qtyNum, price: priceNum, currency })
          }
        }
        j += 8
      } else {
        j++
      }
    }
  }

  return trades
}