const tableBody = document.getElementById("price-table");
const form = document.getElementById("price-form");
const searchInput = document.getElementById("search-input");
const rangeStart = document.getElementById("range-start");
const rangeEnd = document.getElementById("range-end");
const rangeReset = document.getElementById("range-reset");
const chartFilterInput = document.getElementById("chart-filter");
const chartAggSelect = document.getElementById("chart-agg");
const tableFilterInput = document.getElementById("table-filter");
const chartCanvas = document.getElementById("price-chart");
const scrapeButton = document.getElementById("scrape-btn");
const tablePrevButton = document.getElementById("table-prev");
const tableNextButton = document.getElementById("table-next");
const tablePageInput = document.getElementById("table-page-input");
const tablePageGo = document.getElementById("table-page-go");
const tablePageLabel = document.getElementById("table-page-label");
const modelOptions = document.getElementById("model-options");

const formatPrice = (value) => Number(value).toLocaleString("zh-TW");
let cachedRows = [];
let tablePage = 1;
const tablePageSize = 10;
let modelTokenSet = new Set();
let normalizedModelTokenSet = new Set();

const parseFilterTokens = (value) =>
  String(value || "")
    .split(/[\s,\/]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeModelToken = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();

const formatModelToken = (prefix, digits, suffix) => {
  const normalizedPrefix = prefix ? prefix.toUpperCase() : "";
  const normalizedSuffix = suffix ? suffix.toUpperCase() : "";
  const base = normalizedPrefix ? `${normalizedPrefix} ${digits}` : digits;
  return normalizedSuffix ? `${base} ${normalizedSuffix}` : base;
};

const extractModelTokens = (name) => {
  const tokens = [];
  const regex = /(?:(RTX|RX)\s*)?(\d{3,5})\s*(TI|XT|SUPER)?/gi;
  let match = null;
  while ((match = regex.exec(name)) !== null) {
    const [, prefix, digits, suffix] = match;
    if (!digits) {
      continue;
    }

    tokens.push(digits);
    if (prefix || suffix) {
      tokens.push(formatModelToken(prefix, digits, suffix));
    }
  }
  return tokens;
};

const updateModelOptions = (rows) => {
  if (!modelOptions) {
    return;
  }

  const tokens = new Set();
  rows.forEach((row) => {
    const name = String(row.name || "");
    extractModelTokens(name).forEach((token) => tokens.add(token));
  });

  const sortedTokens = Array.from(tokens).sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true })
  );

  modelTokenSet = new Set(sortedTokens);
  normalizedModelTokenSet = new Set(
    sortedTokens.map((token) => normalizeModelToken(token))
  );

  modelOptions.innerHTML = "";
  sortedTokens.forEach((token) => {
    const option = document.createElement("option");
    option.value = token;
    modelOptions.appendChild(option);
  });
};

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const syncRangeBounds = (rows) => {
  if (!rows.length) {
    rangeStart.value = "";
    rangeEnd.value = "";
    rangeStart.min = "";
    rangeEnd.max = "";
    return;
  }

  const dates = rows.map((row) => row.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  rangeStart.min = minDate;
  rangeStart.max = maxDate;
  rangeEnd.min = minDate;
  rangeEnd.max = maxDate;

  if (!rangeStart.value) {
    rangeStart.value = minDate;
  }

  if (!rangeEnd.value) {
    rangeEnd.value = maxDate;
  }
};

const filterRowsByRange = (rows) => {
  const start = parseDateValue(rangeStart.value);
  const end = parseDateValue(rangeEnd.value);

  if (!start || !end) {
    return rows;
  }

  return rows.filter((row) => {
    const current = parseDateValue(row.date);
    return current !== null && current >= start && current <= end;
  });
};

const filterRowsForChart = (rows) => {
  const filteredByRange = filterRowsByRange(rows);
  const keyword = chartFilterInput ? chartFilterInput.value.trim().toLowerCase() : "";
  if (!keyword) {
    return filteredByRange;
  }

  return filteredByRange.filter((row) =>
    String(row.name || "").toLowerCase().includes(keyword)
  );
};

const filterRowsForTable = (rows) => {
  const keyword = tableFilterInput ? tableFilterInput.value.trim().toLowerCase() : "";
  if (!keyword) {
    return rows;
  }

  return rows.filter((row) =>
    String(row.name || "").toLowerCase().includes(keyword)
  );
};

const buildChartPoints = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const dateKey = row.date;
    const price = Number(row.price);
    if (!dateKey || Number.isNaN(price)) {
      return;
    }

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey).push(price);
  });

  const mode = chartAggSelect ? chartAggSelect.value : "avg";
  const points = Array.from(grouped.entries()).map(([dateLabel, values]) => {
    let price = 0;
    if (mode === "min") {
      price = Math.min(...values);
    } else if (mode === "max") {
      price = Math.max(...values);
    } else {
      const total = values.reduce((sum, value) => sum + value, 0);
      price = total / values.length;
    }

    return {
      date: parseDateValue(dateLabel),
      dateLabel,
      price
    };
  });

  return points
    .filter((point) => point.date !== null && !Number.isNaN(point.price))
    .sort((a, b) => a.date - b.date);
};

const renderRows = (rows) => {
  tableBody.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = "<td colspan=\"4\">目前沒有資料。</td>";
    tableBody.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const numericId = Number(row.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.name}</td>
      <td class=\"num\">${formatPrice(row.price)}</td>
      <td class=\"action\">
        <button type=\"button\" class=\"delete-btn\" data-id=\"${Number.isFinite(numericId) ? numericId : ""}\">刪除</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
};

const getTableTotalPages = (rows) =>
  Math.max(1, Math.ceil(rows.length / tablePageSize));

const clampTablePage = (value, totalPages) => {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  if (value > totalPages) {
    return totalPages;
  }
  return Math.floor(value);
};

const updateTablePaginationUI = (page, totalPages) => {
  if (tablePageLabel) {
    tablePageLabel.textContent = `${page} / ${totalPages}`;
  }

  if (tablePrevButton) {
    tablePrevButton.disabled = page <= 1;
  }

  if (tableNextButton) {
    tableNextButton.disabled = page >= totalPages;
  }
};

const renderTablePage = () => {
  const filteredRows = filterRowsForTable(cachedRows);
  const totalPages = getTableTotalPages(filteredRows);
  tablePage = clampTablePage(tablePage, totalPages);
  const startIndex = (tablePage - 1) * tablePageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + tablePageSize);
  renderRows(pageRows);
  updateTablePaginationUI(tablePage, totalPages);
};

const renderChart = (rows) => {
  const ctx = chartCanvas.getContext("2d");
  const pixelRatio = window.devicePixelRatio || 1;
  const width = chartCanvas.clientWidth;
  const height = chartCanvas.height;

  chartCanvas.width = Math.floor(width * pixelRatio);
  chartCanvas.height = Math.floor(height * pixelRatio);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(pixelRatio, pixelRatio);

  ctx.clearRect(0, 0, width, height);

  const drawBackground = () => {
    ctx.save();
    ctx.fillStyle = "#0b1116";
    ctx.fillRect(0, 0, width, height);

    // Diagonal hatch
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#1a232a";
    ctx.lineWidth = 1;
    ctx.translate(width * -0.2, height * 0.2);
    ctx.rotate((-20 * Math.PI) / 180);
    const spacing = 16;
    const max = Math.hypot(width, height) * 1.4;
    for (let x = -max; x <= max; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, -max);
      ctx.lineTo(x, max);
      ctx.stroke();
    }
    ctx.restore();
  };

  drawBackground();

  if (!rows.length) {
    ctx.fillStyle = "rgba(233, 241, 239, 0.75)";
    ctx.font = "14px 'Gill Sans', 'Trebuchet MS', sans-serif";
    ctx.fillText("此範圍內沒有資料", 18, 34);
    return;
  }

  const points = buildChartPoints(rows);

  if (!points.length) {
    ctx.fillStyle = "rgba(233, 241, 239, 0.75)";
    ctx.font = "14px 'Gill Sans', 'Trebuchet MS', sans-serif";
    ctx.fillText("此範圍內沒有資料", 18, 34);
    return;
  }

  const recentCount = 7;
  const displayPoints = points.slice(-recentCount);

  const padding = { top: 22, right: 24, bottom: 80, left: 78 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const prices = displayPoints.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = Math.max(1, maxPrice - minPrice);
  const tickIndices = displayPoints.map((_, index) => index);
  const yTicks = 6;

  // Grid
  ctx.strokeStyle = "rgba(210, 225, 232, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const y = padding.top + ratio * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  tickIndices.forEach((index) => {
    const x = padding.left + (index / Math.max(1, displayPoints.length - 1)) * chartWidth;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(210, 225, 232, 0.2)";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  // Line with glow
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(120, 255, 225, 0.4)";
  ctx.shadowColor = "rgba(120, 255, 225, 0.45)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  displayPoints.forEach((point, index) => {
    const x = padding.left + (index / Math.max(1, displayPoints.length - 1)) * chartWidth;
    const y =
      padding.top +
      (1 - (point.price - minPrice) / range) * chartHeight;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(150, 255, 230, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  displayPoints.forEach((point, index) => {
    const x = padding.left + (index / Math.max(1, displayPoints.length - 1)) * chartWidth;
    const y =
      padding.top +
      (1 - (point.price - minPrice) / range) * chartHeight;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Points
  displayPoints.forEach((point, index) => {
    const x = padding.left + (index / Math.max(1, displayPoints.length - 1)) * chartWidth;
    const y =
      padding.top +
      (1 - (point.price - minPrice) / range) * chartHeight;
    ctx.fillStyle = "#0b1116";
    ctx.strokeStyle = "rgba(255, 199, 82, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Y-axis labels
  ctx.fillStyle = "rgba(210, 225, 232, 0.7)";
  ctx.font = "11px 'Gill Sans', 'Trebuchet MS', sans-serif";
  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const value = maxPrice - range * ratio;
    const label = formatPrice(Math.round(value));
    const y = padding.top + ratio * chartHeight + 4;
    ctx.fillText(label, 10, y);
  }

  // X-axis labels
  ctx.fillStyle = "rgba(210, 225, 232, 0.65)";
  ctx.font = "11px 'Gill Sans', 'Trebuchet MS', sans-serif";
  tickIndices.forEach((index) => {
    const point = displayPoints[index];
    if (!point) {
      return;
    }

    const x = padding.left + (index / Math.max(1, displayPoints.length - 1)) * chartWidth;
    const rawLabel = point.dateLabel || new Date(point.date).toISOString().slice(0, 10);
    const label = rawLabel;
    ctx.save();
    ctx.translate(x, padding.top + chartHeight + 32);
    ctx.rotate((-32 * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
};

const readErrorMessage = async (response, fallback) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return data.error || fallback;
  }

  const text = await response.text();
  return text ? text.slice(0, 120) : fallback;
};

const fetchPrices = async () => {
  const response = await fetch("/api/prices");
  const data = await response.json();
  cachedRows = data;
  updateModelOptions(cachedRows);
  syncRangeBounds(cachedRows);
  renderTablePage();
  renderChart(filterRowsForChart(cachedRows));
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    date: document.getElementById("price-date").value,
    name: document.getElementById("price-name").value,
    price: document.getElementById("price-value").value
  };

  const response = await fetch("/api/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    form.reset();
    await fetchPrices();
    return;
  }

  const message = await readErrorMessage(response, "無法儲存資料。");
  alert(message);
});

if (scrapeButton) {
  scrapeButton.addEventListener("click", async () => {
    const originalLabel = scrapeButton.textContent;
    scrapeButton.disabled = true;
    scrapeButton.textContent = "抓取中...";
    const filter = searchInput ? searchInput.value.trim() : "";
    const tokens = parseFilterTokens(filter);
    const hasInvalidToken = tokens.some((token) =>
      !normalizedModelTokenSet.has(normalizeModelToken(token))
    );
    if (tokens.length && hasInvalidToken) {
      alert("請從清單中選擇顯卡型號，避免輸入其他字詞。");
      scrapeButton.disabled = false;
      scrapeButton.textContent = originalLabel;
      return;
    }

    const payload = tokens.length ? { filter: tokens.join(" ") } : {};

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "抓取失敗。");
        alert(message);
        return;
      }

      await fetchPrices();
      alert("抓取完成，資料已更新。");
    } finally {
      scrapeButton.disabled = false;
      scrapeButton.textContent = originalLabel;
    }
  });
}

rangeStart.addEventListener("change", () => {
  renderChart(filterRowsForChart(cachedRows));
});

rangeEnd.addEventListener("change", () => {
  renderChart(filterRowsForChart(cachedRows));
});

if (chartFilterInput) {
  chartFilterInput.addEventListener("input", () => {
    renderChart(filterRowsForChart(cachedRows));
  });
}

if (chartAggSelect) {
  chartAggSelect.addEventListener("change", () => {
    renderChart(filterRowsForChart(cachedRows));
  });
}

if (tableFilterInput) {
  tableFilterInput.addEventListener("input", () => {
    tablePage = 1;
    renderTablePage();
  });
}

if (tablePrevButton) {
  tablePrevButton.addEventListener("click", () => {
    tablePage = Math.max(1, tablePage - 1);
    renderTablePage();
  });
}

if (tableNextButton) {
  tableNextButton.addEventListener("click", () => {
    tablePage += 1;
    renderTablePage();
  });
}

if (tablePageGo) {
  tablePageGo.addEventListener("click", () => {
    if (!tablePageInput) {
      return;
    }
    const nextPage = Number(tablePageInput.value);
    tablePage = nextPage;
    renderTablePage();
  });
}

rangeReset.addEventListener("click", () => {
  rangeStart.value = "";
  rangeEnd.value = "";
  syncRangeBounds(cachedRows);
  renderChart(filterRowsForChart(cachedRows));
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest(".delete-btn");
  if (!button || !tableBody.contains(button)) {
    return;
  }

  const id = Number(button.dataset.id);
  if (!Number.isInteger(id)) {
    alert("刪除失敗：找不到有效的資料編號。");
    return;
  }
  if (!confirm("確定要刪除此筆資料嗎？")) {
    return;
  }

  const response = await fetch(`/api/prices/${id}`, { method: "DELETE" });
  if (response.ok) {
    await fetchPrices();
    return;
  }

  const message = await readErrorMessage(response, "刪除失敗。");
  alert(message);
});

fetchPrices();
