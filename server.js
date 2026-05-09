const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "prices.sqlite");
const scrapeSearchBaseUrl =
  process.env.SCRAPE_SEARCH_URL ||
  "https://ecshweb.pchome.com.tw/search/v3.3/all/results";
const scrapeLimit = Number(process.env.SCRAPE_LIMIT || 40);
const scrapePageLimit = Number(process.env.SCRAPE_PAGE_LIMIT || 3);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

const cleanText = (value) => value.replace(/\s+/g, " ").trim();

const normalizePrice = (value) => {
  const numeric = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const parseFilterTokens = (value) =>
  String(value || "")
    .split(/[\s,\/]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const matchesFilter = (name, tokens) => {
  if (!tokens.length) {
    return true;
  }

  const lowerName = name.toLowerCase();
  return tokens.some((token) => lowerName.includes(token.toLowerCase()));
};

const fetchText = async (url) => {
  if (typeof fetch !== "function") {
    throw new Error("Fetch is unavailable. Use Node 18+.");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      referer: "https://24h.pchome.com.tw/",
      origin: "https://24h.pchome.com.tw",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "accept-language": "zh-TW,zh;q=0.9,en;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Scrape failed: ${response.status}`);
  }

  return response.text();
};

const fetchJson = async (url) => {
  const rawText = await fetchText(url);
  if (!rawText) {
    throw new Error("Empty response from API.");
  }

  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error("Unsupported API response format.");
  }

  return JSON.parse(trimmed);
};

const extractPriceValue = (price) => {
  if (price === null || price === undefined) {
    return null;
  }

  if (typeof price === "number") {
    return Number.isFinite(price) ? price : null;
  }

  if (typeof price === "string") {
    return normalizePrice(price);
  }

  if (typeof price === "object") {
    const candidate = price.P ?? price.Price ?? price.Sale ?? price.S ?? price.M;
    return extractPriceValue(candidate);
  }

  return null;
};

const scrapePchomeApi = async (tokens = []) => {
  const items = [];
  const query = tokens.length ? tokens.join(" ") : "顯示卡";
  const paramsBase = `q=${encodeURIComponent(query)}&sort=sale/dc`;
  let totalPages = 1;
  let page = 1;

  while (page <= totalPages && page <= scrapePageLimit && items.length < scrapeLimit) {
    const url = `${scrapeSearchBaseUrl}?${paramsBase}&page=${page}`;
    const data = await fetchJson(url);
    totalPages = Number(data.totalPage || 1);

    const prods = Array.isArray(data.prods) ? data.prods : [];
    for (const entry of prods) {
      if (items.length >= scrapeLimit) {
        break;
      }

      if (!entry || typeof entry !== "object") {
        continue;
      }

      const name = cleanText(String(entry.name || entry.Name || ""));
      const price = extractPriceValue(entry.price || entry.Price || entry.PRICE);

      if (name && Number.isFinite(price) && matchesFilter(name, tokens)) {
        items.push({ name, price });
      }
    }

    page += 1;
  }

  return {
    items,
    source: `${scrapeSearchBaseUrl}?${paramsBase}`,
    query,
    pages: Math.min(totalPages, scrapePageLimit)
  };
};

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS prices (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL)"
  );

  db.get("SELECT COUNT(*) AS count FROM prices", (err, row) => {
    if (err) {
      console.error("Failed to count prices:", err.message);
      return;
    }

    if (row.count === 0) {
      const seed = [
        ["2026-05-01", "Nova RTX 5080", 37999],
        ["2026-05-04", "Atlas RX 8900 XT", 32990],
        ["2026-05-08", "Helios RTX 5070", 25990]
      ];

      const stmt = db.prepare(
        "INSERT INTO prices (date, name, price) VALUES (?, ?, ?)"
      );

      seed.forEach((entry) => stmt.run(entry));
      stmt.finalize();
    }
  });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/prices", (req, res) => {
  const search = (req.query.search || "").trim();
  const params = [];
  let sql = "SELECT id, date, name, price FROM prices";

  if (search) {
    sql += " WHERE name LIKE ?";
    params.push(`%${search}%`);
  }

  sql += " ORDER BY date ASC, id ASC";

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Failed to load prices." });
      return;
    }

    res.json(rows);
  });
});

app.post("/api/prices", (req, res) => {
  const { date, name, price } = req.body || {};
  const numericPrice = Number(price);

  if (!date || !name || Number.isNaN(numericPrice)) {
    res.status(400).json({ error: "Missing or invalid fields." });
    return;
  }

  const sql = "INSERT INTO prices (date, name, price) VALUES (?, ?, ?)";
  const params = [date, name.trim(), numericPrice];

  db.run(sql, params, function onInsert(err) {
    if (err) {
      res.status(500).json({ error: "Failed to save price." });
      return;
    }

    res.status(201).json({ id: this.lastID, date, name: name.trim(), price: numericPrice });
  });
});

app.all("/api/prices/:id", (req, res) => {
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id." });
    return;
  }

  db.run("DELETE FROM prices WHERE id = ?", [id], function onDelete(err) {
    if (err) {
      res.status(500).json({ error: "Failed to delete price." });
      return;
    }

    if (this.changes === 0) {
      res.status(404).json({ error: "Record not found." });
      return;
    }

    res.status(204).send();
  });
});

app.post("/api/scrape", async (req, res) => {
  try {
    const tokens = parseFilterTokens(req.body && req.body.filter);
    const { items, source, query, pages } = await scrapePchomeApi(tokens);
    if (!items.length) {
      res.status(502).json({ error: "No items found from source." });
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      const existing = await dbGet(
        "SELECT id FROM prices WHERE date = ? AND name = ? LIMIT 1",
        [date, item.name]
      );

      if (existing) {
        skipped += 1;
        continue;
      }

      await dbRun(
        "INSERT INTO prices (date, name, price) VALUES (?, ?, ?)",
        [date, item.name, item.price]
      );
      inserted += 1;
    }

    res.json({
      source,
      query,
      pages,
      date,
      inserted,
      skipped,
      total: items.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Scrape failed." });
  }
});

app.listen(PORT, () => {
  console.log(`GPU price tracker running on http://localhost:${PORT}`);
});
