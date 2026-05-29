import { useState, useEffect, useRef } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { parseTossPDF } from "./parsePDF"

const COLORS = {
  blue: "#3182F6", green: "#E24B4A", red: "#3182F6", orange: "#FF6B00",
  gray: "#8B95A1", lightGray: "#F2F4F6", border: "#E5E8EB", text: "#191F28", textSub: "#8B95A1",
  profit: "#E24B4A", loss: "#3182F6",
}

function calcStockSummary(trades, stockName) {
  const filtered = trades.filter(t => t.name === stockName)
  let avgPrice = 0, holdingQty = 0, realizedProfit = 0, totalInvested = 0
  filtered.forEach(t => {
    if (t.type === "buy") {
      const totalCost = holdingQty * avgPrice + t.quantity * t.price
      holdingQty += t.quantity
      avgPrice = holdingQty > 0 ? totalCost / holdingQty : 0
      totalInvested += t.quantity * t.price
    } else {
      realizedProfit += (t.price - avgPrice) * t.quantity
      holdingQty -= t.quantity
    }
  })
  return { avgPrice, holdingQty, realizedProfit, totalInvested }
}

function calcBuyHistory(trades, stockName) {
  const filtered = trades.filter(t => t.name === stockName)
  let avgPrice = 0, holdingQty = 0
  const history = []
  filtered.forEach(t => {
    if (t.type === "buy") {
      const totalCost = holdingQty * avgPrice + t.quantity * t.price
      holdingQty += t.quantity
      avgPrice = holdingQty > 0 ? totalCost / holdingQty : 0
      history.push({ date: t.date, price: t.price, quantity: t.quantity, avgPrice, memo: t.memo })
    } else {
      holdingQty -= t.quantity
    }
  })
  return history
}

function getTradeLabel(type, quantity, summary) {
  if (!summary || !quantity) return null
  const qty = Number(quantity)
  if (type === "buy") {
    if (summary.holdingQty === 0) return { text: "신규 매수", color: "#185FA5", bg: "#EBF3FE" }
    return { text: "물타기", color: COLORS.orange, bg: "#FFF3E9" }
  } else {
    if (qty >= summary.holdingQty) return { text: "전량 매도", color: "#A32D2D", bg: "#FCEBEB" }
    return { text: "일부 매도", color: "#9B2FF7", bg: "#F5EFFE" }
  }
}

function getStatusBadge(totalInvested, realizedProfit, unrealizedProfit) {
  if (totalInvested === 0) return null
  const totalValue = realizedProfit + unrealizedProfit
  if (realizedProfit >= totalInvested) return { text: "원금 회수 완료!", color: COLORS.profit, bg: "#FEF0F1" }
  if (totalValue >= 0) return { text: "수익 중", color: "#185FA5", bg: "#EBF3FE" }
  if (totalValue < 0) return { text: "원금 손실 중", color: COLORS.loss, bg: "#EBF3FE" }
  return { text: "회수 진행 중", color: COLORS.orange, bg: "#FFF3E9" }
}

function App() {
  const [trades, setTrades] = useState(() => { const s = localStorage.getItem("trades"); return s ? JSON.parse(s) : [] })
  const [stockList, setStockList] = useState(() => { const s = localStorage.getItem("stockList"); return s ? JSON.parse(s) : [] })
  const [currentPrices, setCurrentPrices] = useState(() => { const s = localStorage.getItem("currentPrices"); return s ? JSON.parse(s) : {} })
  const [targetPrices, setTargetPrices] = useState(() => { const s = localStorage.getItem("targetPrices"); return s ? JSON.parse(s) : {} })
  const [exchangeRate, setExchangeRate] = useState(() => { const s = localStorage.getItem("exchangeRate"); return s ? Number(s) : 1380 })
  const [tab, setTab] = useState("dashboard")
  const [newStockName, setNewStockName] = useState("")
  const [newStockMarket, setNewStockMarket] = useState("KR")
  const [errors, setErrors] = useState({})
  const [chartPeriod, setChartPeriod] = useState("전체")
  const [expandedStock, setExpandedStock] = useState(null)
  const [exchangeRateError, setExchangeRateError] = useState(false)
  const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState(null)
  const [sortOrder, setSortOrder] = useState("name")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [toast, setToast] = useState(null)
  const [editingTrade, setEditingTrade] = useState(null)
const [form, setForm] = useState({ name: "", type: "buy", quantity: "", price: "", date: new Date().toISOString().split("T")[0], memo: "" })

useEffect(() => {
  if (tab === "trade" && !editingTrade) {
    setForm(prev => ({ ...prev, date: new Date().toISOString().split("T")[0] }))
  }
}, [tab])
  const touchStartX = useRef(null)

  const tabKeys = ["dashboard", "trade", "chart", "stocks", "history"]

  useEffect(() => { localStorage.setItem("trades", JSON.stringify(trades)) }, [trades])
  useEffect(() => { localStorage.setItem("stockList", JSON.stringify(stockList)) }, [stockList])
  useEffect(() => { localStorage.setItem("currentPrices", JSON.stringify(currentPrices)) }, [currentPrices])
  useEffect(() => { localStorage.setItem("targetPrices", JSON.stringify(targetPrices)) }, [targetPrices])
  useEffect(() => { localStorage.setItem("exchangeRate", String(exchangeRate)) }, [exchangeRate])

  useEffect(() => {
    function fetchRate() {
      fetch("https://api.exchangerate-api.com/v4/latest/USD")
        .then(res => res.json())
        .then(data => {
          if (data.rates && data.rates.KRW) {
            setExchangeRate(Math.round(data.rates.KRW))
            setExchangeRateError(false)
            setExchangeRateUpdatedAt(new Date())
          } else setExchangeRateError(true)
        })
        .catch(() => setExchangeRateError(true))
    }
    fetchRate()
    const interval = setInterval(fetchRate, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function addStock() {
    if (!newStockName) return
    if (stockList.find(s => s.name === newStockName)) { alert("이미 있는 종목이에요!"); return }
    setStockList([...stockList, { name: newStockName, market: newStockMarket }])
    setNewStockName("")
  }

  function deleteStock(name) {
    const hasTrades = trades.some(t => t.name === name)
    if (hasTrades) {
      if (!window.confirm(`${name}의 거래 내역이 있어요. 종목을 삭제하면 관련 거래 내역도 모두 삭제돼요. 계속할까요?`)) return
      setTrades(trades.filter(t => t.name !== name))
    }
    setStockList(stockList.filter(s => s.name !== name))
    const newPrices = { ...currentPrices }
    delete newPrices[name]
    setCurrentPrices(newPrices)
  }

  function handleSubmit() {
    const newErrors = {}
    if (!form.name) newErrors.name = "종목 선택은 필수 항목이에요"
    if (!form.quantity) newErrors.quantity = "수량은 필수 항목이에요"
    if (!form.price) newErrors.price = "단가는 필수 항목이에요"
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }
    const summary = calcStockSummary(trades, form.name)
    if (form.type === "sell" && Number(form.quantity) > summary.holdingQty) {
      setErrors({ quantity: `보유 수량(${summary.holdingQty}주)보다 많이 매도할 수 없어요` }); return
    }
    setErrors({})
    if (editingTrade) {
      setTrades(trades.map(t => t.id === editingTrade.id ? { ...t, name: form.name, type: form.type, quantity: Number(form.quantity), price: Number(form.price), date: form.date, memo: form.memo } : t))
      setEditingTrade(null)
      showToast("거래가 수정됐어요!")
    } else {
      setTrades([...trades, { id: Date.now(), name: form.name, type: form.type, quantity: Number(form.quantity), price: Number(form.price), date: form.date, memo: form.memo }])
      showToast("거래가 추가됐어요!")
    }
    setForm({ name: "", type: "buy", quantity: "", price: "", date: new Date().toISOString().split("T")[0], memo: "" })
  }

  async function handlePDFImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const parsed = await parseTossPDF(file)
      if (parsed.length === 0) { setImportResult({ success: false, message: "거래 내역을 찾지 못했어요." }); return }
      const newStocks = []
      parsed.forEach(t => {
        if (!stockList.find(s => s.name === t.name) && !newStocks.find(s => s.name === t.name))
          newStocks.push({ name: t.name, market: t.currency })
      })
      if (newStocks.length > 0) setStockList(prev => [...prev, ...newStocks])
      setTrades(prev => {
        const merged = [...prev, ...parsed.map(t => ({ id: Date.now() + Math.random(), ...t, memo: "PDF 가져오기" }))]
        return merged.sort((a, b) => a.date.localeCompare(b.date))
      })
      setImportResult({ success: true, message: `${parsed.length}건 가져오기 완료!` })
    } catch {
      setImportResult({ success: false, message: "오류가 발생했어요. 토스증권 거래내역서 PDF인지 확인해주세요." })
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  const selectedSummary = form.name ? calcStockSummary(trades, form.name) : null
  const tradeLabel = getTradeLabel(form.type, form.quantity, selectedSummary)
  const isUS = stockList.find(s => s.name === form.name)?.market === "US"
  const previewProfit = form.type === "sell" && form.price && form.quantity && selectedSummary
    ? (Number(form.price) - selectedSummary.avgPrice) * Number(form.quantity) : null
  const previewTotal = form.price && form.quantity ? Number(form.price) * Number(form.quantity) : null
  const newAvgPrice = form.type === "buy" && form.price && form.quantity && selectedSummary
    ? (selectedSummary.holdingQty * selectedSummary.avgPrice + Number(form.quantity) * Number(form.price)) / (selectedSummary.holdingQty + Number(form.quantity)) : null

  const allSummaries = stockList.map(s => ({ ...s, ...calcStockSummary(trades, s.name), currentPrice: currentPrices[s.name] || 0 }))

  const sortedSummaries = [...allSummaries].sort((a, b) => {
    const aUnrealized = a.currentPrice ? (a.currentPrice - a.avgPrice) * a.holdingQty : 0
    const bUnrealized = b.currentPrice ? (b.currentPrice - b.avgPrice) * b.holdingQty : 0
    if (sortOrder === "profit") return (b.realizedProfit + bUnrealized) - (a.realizedProfit + aUnrealized)
    if (sortOrder === "loss") return (a.realizedProfit + aUnrealized) - (b.realizedProfit + bUnrealized)
    if (sortOrder === "invested") return b.totalInvested - a.totalInvested
    return a.name.localeCompare(b.name, "ko")
  })

  const totalInvested = allSummaries.reduce((sum, s) => sum + (s.market === "US" ? s.totalInvested * exchangeRate : s.totalInvested), 0)
  const totalRealized = allSummaries.reduce((sum, s) => sum + (s.market === "US" ? s.realizedProfit * exchangeRate : s.realizedProfit), 0)
  const totalUnrealized = allSummaries.reduce((sum, s) => {
    if (!s.currentPrice || s.holdingQty === 0) return sum
    const u = (s.currentPrice - s.avgPrice) * s.holdingQty
    return sum + (s.market === "US" ? u * exchangeRate : u)
  }, 0)
  const recoveryRate = totalInvested > 0 ? ((totalInvested + totalRealized + totalUnrealized) / totalInvested * 100) : 0

  const sellTrades = trades.filter(t => {
    if (t.type !== "sell") return false
    const date = new Date(t.date)
    const now = new Date()
    if (chartPeriod === "올해") return date.getFullYear() === now.getFullYear()
    if (chartPeriod === "이번달") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    return true
  })
  const monthlyMap = {}
  sellTrades.forEach(t => {
    const key = t.date.slice(0, 7)
    const avg = calcStockSummary(trades.filter(x => x.name === t.name && x.date <= t.date), t.name).avgPrice
    const market = stockList.find(s => s.name === t.name)?.market
    const profit = (t.price - avg) * t.quantity * (market === "US" ? exchangeRate : 1)
    monthlyMap[key] = (monthlyMap[key] || 0) + profit
  })
  const monthlyData = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([month, profit]) => ({ month: month.slice(2), profit }))
  const chartTotalProfit = sellTrades.reduce((sum, t) => {
    const avg = calcStockSummary(trades.filter(x => x.name === t.name && x.date <= t.date), t.name).avgPrice
    const market = stockList.find(s => s.name === t.name)?.market
    return sum + (t.price - avg) * t.quantity * (market === "US" ? exchangeRate : 1)
  }, 0)

  const inputStyle = (field) => ({
    width: "100%", padding: "12px 14px", borderRadius: "10px", fontSize: "15px", outline: "none",
    border: errors[field] ? `1.5px solid ${COLORS.profit}` : `1px solid ${COLORS.border}`,
    marginBottom: errors[field] ? "4px" : "10px", background: "white", color: COLORS.text, boxSizing: "border-box"
  })

  function ErrorMsg({ field }) {
    if (!errors[field]) return null
    return <div style={{ fontSize: "12px", color: COLORS.profit, marginBottom: "10px" }}>⚠ {errors[field]}</div>
  }

  const sortedStockList = [...stockList].sort((a, b) => a.name.localeCompare(b.name, "ko"))

  const tabs = [
    { key: "dashboard", label: "홈" },
    { key: "trade", label: "거래" },
    { key: "chart", label: "차트" },
    { key: "stocks", label: "종목" },
    { key: "history", label: "내역" },
  ]

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    const idx = tabKeys.indexOf(tab)
    if (diff > 60 && idx < tabKeys.length - 1) setTab(tabKeys[idx + 1])
    else if (diff < -60 && idx > 0) setTab(tabKeys[idx - 1])
    touchStartX.current = null
  }

  return (
    <div
      style={{ maxWidth: "480px", margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#F8F9FA", minHeight: "100vh", paddingBottom: "80px" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {toast && (
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: COLORS.text, color: "white", padding: "10px 20px", borderRadius: "20px", fontSize: "13px", zIndex: 100, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      <div style={{ background: "white", padding: "20px 20px 16px", borderBottom: `1px solid ${COLORS.border}`, position: "sticky", top: 0, zIndex: 10 }}>
        <h1 style={{ fontSize: "18px", fontWeight: "700", color: COLORS.text, margin: 0, textAlign: "center" }}>내 투자 기록</h1>
      </div>

      <div style={{ padding: "16px" }}>

        {tab === "dashboard" && (
          <div>
            <div style={{ background: "white", borderRadius: "16px", padding: "20px", marginBottom: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "13px", color: COLORS.textSub, marginBottom: "6px" }}>총 투자 원금</div>
              <div style={{ fontSize: "28px", fontWeight: "700", color: COLORS.text, marginBottom: "4px" }}>{Math.round(totalInvested).toLocaleString()}원</div>
              <div style={{ fontSize: "13px", color: COLORS.textSub }}>전체 기간 매수 합계</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              {[
                { label: "실현수익", value: totalRealized, sub: totalInvested > 0 ? `원금 대비 ${(totalRealized / totalInvested * 100).toFixed(1)}%` : "" },
                { label: "미실현수익", value: totalUnrealized, sub: totalUnrealized !== 0 && totalInvested > 0 ? `원금 대비 ${(totalUnrealized / totalInvested * 100).toFixed(1)}%` : "현재가 미입력" },
                { label: "총 수익", value: totalRealized + totalUnrealized, sub: totalInvested > 0 ? `원금 대비 ${((totalRealized + totalUnrealized) / totalInvested * 100).toFixed(1)}%` : "" },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: "white", borderRadius: "14px", padding: "16px", textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>{label}</div>
                  <div style={{ fontSize: "17px", fontWeight: "700", color: value >= 0 ? COLORS.profit : COLORS.loss }}>
                    {value !== 0 ? `${value >= 0 ? "+" : ""}${Math.round(value).toLocaleString()}원` : "—"}
                  </div>
                  <div style={{ fontSize: "11px", color: COLORS.textSub, marginTop: "3px" }}>{sub}</div>
                </div>
              ))}
              <div style={{ background: "white", borderRadius: "14px", padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>총자산회복률</div>
                <div style={{ fontSize: "17px", fontWeight: "700", color: recoveryRate >= 100 ? COLORS.profit : COLORS.orange }}>{recoveryRate.toFixed(1)}%</div>
                <div style={{ marginTop: "8px", height: "4px", background: COLORS.lightGray, borderRadius: "2px" }}>
                  <div style={{ height: "100%", borderRadius: "2px", background: recoveryRate >= 100 ? COLORS.profit : COLORS.loss, width: `${Math.min(100, recoveryRate)}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            </div>

            <div style={{ background: "white", borderRadius: "14px", padding: "14px 16px", marginBottom: exchangeRateError ? "6px" : "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "13px", color: COLORS.textSub }}>환율{exchangeRateError && <span style={{ marginLeft: "6px" }}>⚠️</span>}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: COLORS.text }}>{exchangeRate.toLocaleString()}원/달러</div>
                {!exchangeRateError && exchangeRateUpdatedAt && (
                  <div style={{ fontSize: "10px", color: "#00B493", marginTop: "2px" }}>실시간 · {exchangeRateUpdatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준</div>
                )}
              </div>
            </div>
            {exchangeRateError && (
              <div style={{ marginBottom: "12px", padding: "8px 10px", background: "#FFF3E9", borderRadius: "8px", fontSize: "11px", color: COLORS.orange, lineHeight: "1.6" }}>
                인터넷 또는 API 연결 오류로 실시간 환율 적용이 불가능하여 최근 환율을 적용했어요!
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 10px" }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: COLORS.text }}>종목별 현황</div>
              <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, outline: "none", background: "white", color: COLORS.textSub }}>
                <option value="name">이름순</option>
                <option value="profit">수익순</option>
                <option value="loss">손실순</option>
                <option value="invested">투자액순</option>
              </select>
            </div>

            {stockList.length === 0 && (
              <div style={{ background: "white", borderRadius: "14px", padding: "32px 20px", textAlign: "center", color: COLORS.textSub, fontSize: "14px" }}>
                종목 탭에서 종목을 먼저 추가해주세요
              </div>
            )}
            {sortedSummaries.map(s => {
              const isStockUS = s.market === "US"
              const unrealizedRaw = s.currentPrice ? (s.currentPrice - s.avgPrice) * s.holdingQty : 0
              const unrealized = isStockUS ? unrealizedRaw * exchangeRate : unrealizedRaw
              const badge = getStatusBadge(s.totalInvested, s.realizedProfit, unrealized)
              const extraProfit = s.realizedProfit - s.totalInvested
              const bep = s.avgPrice
              const bepDiff = s.currentPrice && bep > 0 ? ((s.currentPrice - bep) / bep * 100) : null
              const targetPrice = targetPrices[s.name]
              const targetProgress = targetPrice && s.avgPrice > 0 ? Math.min(100, ((s.currentPrice - s.avgPrice) / (targetPrice - s.avgPrice)) * 100) : null
              const buyHistory = calcBuyHistory(trades, s.name)
              const totalIn = trades.filter(t => t.name === s.name && t.type === "buy").reduce((sum, t) => sum + t.quantity * t.price, 0)
              const totalOut = trades.filter(t => t.name === s.name && t.type === "sell").reduce((sum, t) => sum + t.quantity * t.price, 0)
              const currentValue = s.currentPrice ? s.currentPrice * s.holdingQty : 0
              const isExpanded = expandedStock === s.name
              const stockRecoveryRate = s.totalInvested > 0 ? ((s.realizedProfit + (s.currentPrice ? (s.currentPrice - s.avgPrice) * s.holdingQty : 0)) / s.totalInvested * 100) : 0

              return (
                <div key={s.name} style={{ background: "white", borderRadius: "14px", padding: "16px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "700", fontSize: "15px", color: COLORS.text }}>{s.name}</span>
                      <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "20px", background: isStockUS ? "#E6FAF6" : "#EBF3FE", color: isStockUS ? "#00B493" : "#185FA5", fontWeight: "500" }}>
                        {isStockUS ? "US" : "KR"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {badge && <span style={{ fontSize: "11px", padding: "3px 9px", borderRadius: "20px", background: badge.bg, color: badge.color, fontWeight: "600" }}>{badge.text}</span>}
                      <button onClick={() => setExpandedStock(isExpanded ? null : s.name)} style={{ padding: "3px 8px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: "transparent", fontSize: "11px", color: COLORS.textSub, cursor: "pointer" }}>
                        {isExpanded ? "접기" : "상세"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                    {[
                      { label: "투자원금", value: `${Math.round(s.totalInvested).toLocaleString()}${isStockUS ? "$" : "원"}` },
                      { label: "보유수량", value: `${s.holdingQty}주` },
                      { label: "평단가", value: `${Math.round(s.avgPrice).toLocaleString()}${isStockUS ? "$" : "원"}` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: COLORS.lightGray, borderRadius: "8px", padding: "8px 10px" }}>
                        <div style={{ fontSize: "10px", color: COLORS.textSub, marginBottom: "3px" }}>{label}</div>
                        <div style={{ fontSize: "12px", fontWeight: "600", color: COLORS.text }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", color: COLORS.textSub }}>실현수익</span>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: s.realizedProfit >= 0 ? COLORS.profit : COLORS.loss }}>
                      {s.realizedProfit >= 0 ? "+" : ""}{Math.round(s.realizedProfit).toLocaleString()}{isStockUS ? "$" : "원"}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: COLORS.textSub }}>원금회수율</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: stockRecoveryRate >= 100 ? COLORS.profit : stockRecoveryRate >= 0 ? COLORS.orange : COLORS.loss }}>
                      {stockRecoveryRate.toFixed(1)}%
                    </span>
                  </div>

                  {s.realizedProfit >= s.totalInvested && s.totalInvested > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "13px", color: COLORS.textSub }}>순수 추가수익</span>
                      <span style={{ fontSize: "14px", fontWeight: "700", color: COLORS.profit }}>
                        +{Math.round(extraProfit).toLocaleString()}{isStockUS ? "$" : "원"} ({(extraProfit / s.totalInvested * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )}

                  {s.holdingQty > 0 && bepDiff !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", padding: "8px 10px", background: bepDiff >= 0 ? "#FEF0F1" : "#EBF3FE", borderRadius: "8px" }}>
                      <span style={{ fontSize: "12px", color: COLORS.textSub }}>손익분기점(BEP)</span>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: bepDiff >= 0 ? COLORS.profit : COLORS.loss }}>
                        {bepDiff >= 0 ? "+" : ""}{bepDiff.toFixed(1)}% ({Math.round(bep).toLocaleString()}{isStockUS ? "$" : "원"})
                      </span>
                    </div>
                  )}

                  {s.holdingQty > 0 && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", paddingTop: "10px", borderTop: `1px solid ${COLORS.border}`, marginBottom: "8px" }}>
                      <span style={{ fontSize: "12px", color: COLORS.textSub, flexShrink: 0 }}>현재가</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={isStockUS ? "$ 입력" : "원 입력"}
                        value={currentPrices[s.name] ?? ""}
                        onChange={e => {
                          const raw = e.target.value
                          if (/^\d*\.?\d*$/.test(raw)) setCurrentPrices({ ...currentPrices, [s.name]: raw === "" ? "" : raw })
                        }}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, fontSize: "13px", outline: "none" }}
                      />
                      {s.currentPrice > 0 && (
                        <span style={{ fontSize: "13px", fontWeight: "700", color: unrealized >= 0 ? COLORS.profit : COLORS.loss, flexShrink: 0 }}>
                          {unrealized >= 0 ? "+" : ""}{Math.round(unrealized).toLocaleString()}원
                        </span>
                      )}
                    </div>
                  )}

                  {s.holdingQty > 0 && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "12px", color: COLORS.textSub, flexShrink: 0 }}>목표가</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={isStockUS ? "$ 입력" : "원 입력"}
                        value={targetPrices[s.name] ?? ""}
                        onChange={e => {
                          const raw = e.target.value
                          if (/^\d*\.?\d*$/.test(raw)) setTargetPrices({ ...targetPrices, [s.name]: raw === "" ? "" : raw })
                        }}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, fontSize: "13px", outline: "none" }}
                      />
                    </div>
                  )}

                  {targetProgress !== null && s.currentPrice > 0 && Number(targetPrices[s.name]) > s.avgPrice && (
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", color: COLORS.textSub }}>목표가까지</span>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: COLORS.loss }}>{Math.max(0, targetProgress).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: "5px", background: COLORS.lightGray, borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: "3px", background: COLORS.loss, width: `${Math.max(0, Math.min(100, targetProgress))}%`, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${COLORS.border}` }}>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: COLORS.text, marginBottom: "10px" }}>현금 흐름</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: COLORS.textSub }}>총 투입금액</span>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: COLORS.loss }}>-{Math.round(totalIn).toLocaleString()}{isStockUS ? "$" : "원"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: COLORS.textSub }}>총 회수금액</span>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: COLORS.profit }}>+{Math.round(totalOut).toLocaleString()}{isStockUS ? "$" : "원"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: COLORS.textSub }}>현재 묶인 돈</span>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: COLORS.text }}>{Math.round(s.avgPrice * s.holdingQty).toLocaleString()}{isStockUS ? "$" : "원"}</span>
                        </div>
                        {currentValue > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "12px", color: COLORS.textSub }}>현재 평가금액</span>
                            <span style={{ fontSize: "12px", fontWeight: "600", color: COLORS.text }}>{Math.round(currentValue).toLocaleString()}{isStockUS ? "$" : "원"}</span>
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: "13px", fontWeight: "700", color: COLORS.text, marginBottom: "10px" }}>물타기 타임라인</div>
                      <div style={{ maxHeight: buyHistory.length > 5 ? "200px" : "none", overflowY: buyHistory.length > 5 ? "auto" : "visible", paddingRight: buyHistory.length > 5 ? "4px" : "0" }}>
                        {buyHistory.length === 0
                          ? <div style={{ fontSize: "12px", color: COLORS.textSub }}>매수 내역이 없어요</div>
                          : buyHistory.map((h, i) => (
                            <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", alignItems: "flex-start" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: i === 0 ? COLORS.loss : COLORS.orange, marginTop: "4px" }} />
                                {i < buyHistory.length - 1 && <div style={{ width: "1px", height: "24px", background: COLORS.border }} />}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "11px", color: COLORS.textSub }}>{h.date}</div>
                                <div style={{ fontSize: "12px", color: COLORS.text }}>
                                  {h.quantity}주 @ {Math.round(h.price).toLocaleString()}{isStockUS ? "$" : "원"}
                                  {i > 0 && <span style={{ color: COLORS.orange, marginLeft: "4px" }}>물타기</span>}
                                </div>
                                <div style={{ fontSize: "11px", color: COLORS.textSub }}>→ 평단 {Math.round(h.avgPrice).toLocaleString()}{isStockUS ? "$" : "원"}</div>
                                {h.memo && <div style={{ fontSize: "11px", color: COLORS.textSub, fontStyle: "italic" }}>{h.memo}</div>}
                              </div>
                            </div>
                          ))
                        }
                      </div>

                      {isStockUS && s.currentPrice > 0 && (
                        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${COLORS.border}` }}>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: COLORS.text, marginBottom: "8px" }}>환율 손익</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: "12px", color: COLORS.textSub }}>달러 미실현수익</span>
                              <span style={{ fontSize: "12px", fontWeight: "600", color: unrealizedRaw >= 0 ? COLORS.profit : COLORS.loss }}>
                                {unrealizedRaw >= 0 ? "+" : ""}{unrealizedRaw.toFixed(2)}$
                              </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: "12px", color: COLORS.textSub }}>원화 환산 (현재 환율)</span>
                              <span style={{ fontSize: "12px", fontWeight: "600", color: unrealized >= 0 ? COLORS.profit : COLORS.loss }}>
                                {unrealized >= 0 ? "+" : ""}{Math.round(unrealized).toLocaleString()}원
                              </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: "12px", color: COLORS.textSub }}>적용 환율</span>
                              <span style={{ fontSize: "12px", color: COLORS.textSub }}>{exchangeRate.toLocaleString()}원/$</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === "trade" && (
          <div>
            <div style={{ background: "white", borderRadius: "16px", padding: "20px" }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: COLORS.text, marginBottom: "16px" }}>
                {editingTrade ? "거래 수정" : "거래 입력"}
              </div>
              <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>종목</div>
              <select value={form.name} onChange={e => { setForm({ ...form, name: e.target.value, quantity: "", price: "" }); setErrors({ ...errors, name: null }) }} style={{ ...inputStyle("name"), background: "white" }}>
                <option value="">종목 선택</option>
                {sortedStockList.map(s => <option key={s.name} value={s.name}>{s.name} ({s.market === "KR" ? "한국" : "미국"})</option>)}
              </select>
              <ErrorMsg field="name" />
              {selectedSummary && selectedSummary.holdingQty > 0 && (
                <div style={{ background: "#EBF3FE", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", fontSize: "13px", color: "#185FA5", fontWeight: "500" }}>
                  현재 보유 {selectedSummary.holdingQty}주 · 평단 {Math.round(selectedSummary.avgPrice).toLocaleString()}{isUS ? "$" : "원"}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <button onClick={() => { setForm({ ...form, type: "buy", quantity: "", price: "" }); setErrors({}) }} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: form.type === "buy" ? COLORS.loss : COLORS.lightGray, color: form.type === "buy" ? "white" : COLORS.textSub, fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>매수</button>
                <button onClick={() => { setForm({ ...form, type: "sell", quantity: "", price: "" }); setErrors({}) }} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: form.type === "sell" ? COLORS.profit : COLORS.lightGray, color: form.type === "sell" ? "white" : COLORS.textSub, fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>매도</button>
              </div>
              <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>수량</div>
              <input type="text" inputMode="decimal" placeholder={isUS ? "수량 (소수점 가능, 예: 0.5)" : "수량"} value={form.quantity}
                onChange={e => {
                  if (!form.name) { setErrors({ name: "종목을 먼저 선택해주세요!" }); return }
                  const raw = e.target.value
                  if (isUS ? /^\d*\.?\d*$/.test(raw) : /^\d*$/.test(raw)) { setForm({ ...form, quantity: raw }); setErrors({ ...errors, quantity: null }) }
                }}
                style={inputStyle("quantity")} />
              <ErrorMsg field="quantity" />
              {form.type === "sell" && selectedSummary && selectedSummary.holdingQty > 0 && !form.quantity && (
                <button onClick={() => setForm({ ...form, quantity: String(selectedSummary.holdingQty) })} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: `1px solid ${COLORS.profit}`, background: "transparent", color: COLORS.profit, fontSize: "13px", fontWeight: "600", marginBottom: "10px", cursor: "pointer" }}>
                  전량 매도 ({selectedSummary.holdingQty}주) 자동입력
                </button>
              )}
              <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>{isUS ? "단가 ($)" : "단가 (원)"}</div>
              <input type="text" inputMode="decimal" placeholder={isUS ? "달러 단가" : "원화 단가"}
                value={form.price ? (isUS ? form.price : Number(form.price).toLocaleString()) : ""}
                onChange={e => {
                  if (!form.name) { setErrors({ name: "종목을 먼저 선택해주세요!" }); return }
                  const raw = e.target.value.replace(/,/g, "")
                  if (isUS ? /^\d*\.?\d*$/.test(raw) : /^\d*$/.test(raw)) { setForm({ ...form, price: raw }); setErrors({ ...errors, price: null }) }
                }}
                style={inputStyle("price")} />
              <ErrorMsg field="price" />

              {tradeLabel && form.quantity && form.price && (
                <div style={{ borderRadius: "12px", padding: "12px 14px", marginBottom: "10px", background: tradeLabel.bg }}>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: tradeLabel.color, marginBottom: "8px" }}>
                    {tradeLabel.text}
                    {form.type === "buy" && newAvgPrice && selectedSummary.holdingQty > 0 && (
                      <span style={{ fontWeight: "400", marginLeft: "8px", color: COLORS.textSub }}>→ 새 평단 {Math.round(newAvgPrice).toLocaleString()}{isUS ? "$" : "원"}</span>
                    )}
                  </div>
                  {previewTotal !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "13px", color: COLORS.textSub }}>총 {form.type === "buy" ? "매수" : "매도"}금액</span>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: COLORS.text }}>{Math.round(previewTotal).toLocaleString()}{isUS ? "$" : "원"}</span>
                    </div>
                  )}
                  {form.type === "sell" && previewProfit !== null && selectedSummary && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", color: COLORS.textSub }}>예상 실현수익</span>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: previewProfit >= 0 ? COLORS.profit : COLORS.loss }}>{previewProfit >= 0 ? "+" : ""}{Math.round(previewProfit).toLocaleString()}{isUS ? "$" : "원"}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", color: COLORS.textSub }}>평단 기준</span>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: previewProfit >= 0 ? COLORS.profit : COLORS.loss }}>{((Number(form.price) - selectedSummary.avgPrice) / selectedSummary.avgPrice * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", color: COLORS.textSub }}>원금 기준</span>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: previewProfit >= 0 ? COLORS.profit : COLORS.loss }}>
                          {(previewProfit / selectedSummary.totalInvested * 100).toFixed(1)}%
                          <span style={{ fontWeight: "400", color: COLORS.textSub, marginLeft: "4px", fontSize: "11px" }}>
                            {previewProfit >= 0
                              ? `(${Math.round(selectedSummary.totalInvested).toLocaleString()}${isUS ? "$" : "원"} 중 ${Math.round(previewProfit).toLocaleString()}${isUS ? "$" : "원"} 회수)`
                              : `(${Math.round(selectedSummary.totalInvested).toLocaleString()}${isUS ? "$" : "원"} 투자 → ${Math.round(Math.abs(previewProfit)).toLocaleString()}${isUS ? "$" : "원"} 손실)`}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>날짜</div>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle("")} />
              <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "6px" }}>메모 (선택)</div>
              <input placeholder="거래 이유, 메모 등" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} style={inputStyle("")} />
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleSubmit} style={{ flex: 1, padding: "14px", borderRadius: "12px", border: "none", background: COLORS.loss, color: "white", fontSize: "15px", fontWeight: "700", cursor: "pointer", marginTop: "4px" }}>
                  {editingTrade ? "수정 완료" : "거래 추가"}
                </button>
                {editingTrade && (
                  <button onClick={() => { setEditingTrade(null); setForm({ name: "", type: "buy", quantity: "", price: "", date: new Date().toISOString().split("T")[0], memo: "" }) }}
                    style={{ padding: "14px 20px", borderRadius: "12px", border: `1px solid ${COLORS.border}`, background: "white", fontSize: "14px", color: COLORS.textSub, cursor: "pointer", marginTop: "4px" }}>
                    취소
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "chart" && (
          <div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
              {["전체", "올해", "이번달"].map(p => (
                <button key={p} onClick={() => setChartPeriod(p)} style={{ padding: "7px 16px", borderRadius: "20px", border: "none", background: chartPeriod === p ? COLORS.loss : "white", color: chartPeriod === p ? "white" : COLORS.textSub, fontSize: "13px", fontWeight: chartPeriod === p ? "700" : "400", cursor: "pointer" }}>{p}</button>
              ))}
            </div>
            <div style={{ background: "white", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", color: COLORS.textSub, marginBottom: "6px" }}>기간 실현수익</div>
              <div style={{ fontSize: "26px", fontWeight: "700", color: chartTotalProfit >= 0 ? COLORS.profit : COLORS.loss }}>{chartTotalProfit >= 0 ? "+" : ""}{Math.round(chartTotalProfit).toLocaleString()}원</div>
              {totalInvested > 0 && <div style={{ fontSize: "13px", color: COLORS.textSub, marginTop: "4px" }}>원금 대비 {(chartTotalProfit / totalInvested * 100).toFixed(1)}%</div>}
            </div>
            <div style={{ background: "white", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.text, marginBottom: "14px" }}>월별 실현수익</div>
              {monthlyData.length === 0
                ? <div style={{ textAlign: "center", color: COLORS.textSub, fontSize: "13px", padding: "20px 0" }}>매도 내역이 없어요</div>
                : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: COLORS.textSub }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: COLORS.textSub }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} axisLine={false} tickLine={false} />
                      <Tooltip formatter={v => [`${Math.round(v).toLocaleString()}원`, "실현수익"]} contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="profit" radius={[6, 6, 0, 0]}>
                        {monthlyData.map((entry, i) => <Cell key={i} fill={entry.profit >= 0 ? COLORS.profit : COLORS.loss} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </div>
            <div style={{ background: "white", borderRadius: "16px", padding: "20px" }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.text, marginBottom: "14px" }}>종목별 실현수익</div>
              {allSummaries.map(s => (
                <div key={s.name} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: COLORS.text }}>{s.name}</span>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: s.realizedProfit >= 0 ? COLORS.profit : COLORS.loss }}>{s.realizedProfit >= 0 ? "+" : ""}{Math.round(s.realizedProfit).toLocaleString()}원</span>
                  </div>
                  <div style={{ height: "6px", background: COLORS.lightGray, borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "3px", background: s.realizedProfit >= 0 ? COLORS.profit : COLORS.loss, width: `${Math.min(100, Math.abs(s.realizedProfit) / Math.max(...allSummaries.map(x => Math.abs(x.realizedProfit)), 1) * 100)}%`, transition: "width 0.4s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "stocks" && (
          <div>
            <div style={{ background: "white", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: COLORS.text, marginBottom: "16px" }}>종목 추가</div>
              <input placeholder="종목명 (예: 삼성전자, NVDA)" value={newStockName} onChange={e => setNewStockName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStock()} style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontSize: "15px", marginBottom: "10px", outline: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                <button onClick={() => setNewStockMarket("KR")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: newStockMarket === "KR" ? COLORS.loss : COLORS.lightGray, color: newStockMarket === "KR" ? "white" : COLORS.textSub, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>한국 주식</button>
                <button onClick={() => setNewStockMarket("US")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", background: newStockMarket === "US" ? COLORS.loss : COLORS.lightGray, color: newStockMarket === "US" ? "white" : COLORS.textSub, fontWeight: "700", fontSize: "13px", cursor: "pointer" }}>미국 주식</button>
              </div>
              <button onClick={addStock} style={{ width: "100%", padding: "13px", borderRadius: "12px", border: "none", background: COLORS.loss, color: "white", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>종목 추가</button>
            </div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: COLORS.text, margin: "4px 0 10px" }}>등록된 종목</div>
            {stockList.length === 0 && <div style={{ background: "white", borderRadius: "14px", padding: "32px 20px", textAlign: "center", color: COLORS.textSub, fontSize: "14px" }}>아직 등록된 종목이 없어요</div>}
            {sortedStockList.map(s => {
              const sum = calcStockSummary(trades, s.name)
              return (
                <div key={s.name} style={{ background: "white", borderRadius: "14px", padding: "16px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "700", fontSize: "15px", color: COLORS.text }}>{s.name}</span>
                      <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "20px", background: s.market === "KR" ? "#EBF3FE" : "#E6FAF6", color: s.market === "KR" ? "#185FA5" : "#00B493", fontWeight: "600" }}>{s.market === "KR" ? "KR" : "US"}</span>
                    </div>
                    <button onClick={() => deleteStock(s.name)} style={{ padding: "4px 10px", borderRadius: "8px", border: `1px solid ${COLORS.border}`, background: "transparent", fontSize: "12px", color: COLORS.textSub, cursor: "pointer" }}>삭제</button>
                  </div>
                  <div style={{ display: "flex", gap: "10px", fontSize: "13px", color: COLORS.textSub }}>
                    <span>보유 {sum.holdingQty}주</span>
                    <span>평단 {Math.round(sum.avgPrice).toLocaleString()}{s.market === "US" ? "$" : "원"}</span>
                    <span style={{ color: sum.realizedProfit >= 0 ? COLORS.profit : COLORS.loss, fontWeight: "600" }}>{sum.realizedProfit >= 0 ? "+" : ""}{Math.round(sum.realizedProfit).toLocaleString()}{s.market === "US" ? "$" : "원"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === "history" && (
          <div>
            <div style={{ background: "white", borderRadius: "14px", padding: "16px", marginBottom: "12px" }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: COLORS.text, marginBottom: "8px" }}>토스증권 PDF 가져오기</div>
              <div style={{ fontSize: "12px", color: COLORS.textSub, marginBottom: "12px" }}>토스증권 앱 → 계좌 → 거래내역 → 내보내기 → PDF로 저장 후 업로드해주세요</div>
              <label style={{ display: "block", width: "100%", padding: "12px", borderRadius: "10px", border: `1.5px dashed ${COLORS.border}`, textAlign: "center", cursor: "pointer", fontSize: "13px", color: COLORS.textSub, boxSizing: "border-box" }}>
                {importing ? "가져오는 중..." : "PDF 파일 선택"}
                <input type="file" accept=".pdf" onChange={handlePDFImport} style={{ display: "none" }} />
              </label>
              {importResult && (
                <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "8px", fontSize: "12px", background: importResult.success ? "#FEF0F1" : "#FEF0F1", color: importResult.success ? COLORS.profit : COLORS.loss }}>
                  {importResult.message}
                </div>
              )}
            </div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: COLORS.text, marginBottom: "12px" }}>거래 내역</div>
            {trades.length === 0 && <div style={{ background: "white", borderRadius: "14px", padding: "32px 20px", textAlign: "center", color: COLORS.textSub, fontSize: "14px" }}>아직 거래 내역이 없어요</div>}
            {[...trades].reverse().map(trade => {
              const market = stockList.find(s => s.name === trade.name)?.market
              return (
                <div key={trade.id} style={{ background: "white", borderRadius: "14px", padding: "14px 16px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "700", fontSize: "14px", color: COLORS.text }}>{trade.name}</span>
                      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: trade.type === "buy" ? "#EBF3FE" : "#FEF0F1", color: trade.type === "buy" ? "#185FA5" : COLORS.profit, fontWeight: "600" }}>
                        {trade.type === "buy" ? "매수" : "매도"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => {
                        setEditingTrade(trade)
                        setForm({ name: trade.name, type: trade.type, quantity: String(trade.quantity), price: String(trade.price), date: trade.date, memo: trade.memo || "" })
                        setTab("trade")
                      }} style={{ padding: "3px 8px", borderRadius: "6px", border: `1px solid ${COLORS.border}`, background: "transparent", fontSize: "11px", color: COLORS.textSub, cursor: "pointer" }}>수정</button>
                      <button onClick={() => { if (window.confirm("이 거래를 삭제할까요?")) setTrades(trades.filter(t => t.id !== trade.id)) }} style={{ padding: "3px 8px", borderRadius: "6px", border: `1px solid ${COLORS.border}`, background: "transparent", fontSize: "11px", color: COLORS.textSub, cursor: "pointer" }}>삭제</button>
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: COLORS.textSub }}>
                    {trade.date} · {trade.quantity}주 · {trade.price.toLocaleString()}{market === "US" ? "$" : "원"}
                  </div>
                  {trade.memo && <div style={{ fontSize: "12px", color: COLORS.textSub, marginTop: "4px", padding: "6px 10px", background: COLORS.lightGray, borderRadius: "6px" }}>{trade.memo}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", background: "white", borderTop: `1px solid ${COLORS.border}`, display: "flex", zIndex: 10 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "16px 0 20px", border: "none", background: "transparent", color: tab === t.key ? COLORS.loss : COLORS.textSub, fontSize: "12px", fontWeight: tab === t.key ? "700" : "400", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "20px" }}>
              {t.key === "dashboard" ? "🏠" : t.key === "trade" ? "📝" : t.key === "chart" ? "📊" : t.key === "stocks" ? "📋" : "📜"}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default App