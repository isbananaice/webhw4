const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("data/prices.sqlite");

const rows = [
  ["2026-05-06", "GeForce RTX 5070 12GB GDDR7 X2 顯示卡", 21790],
  ["2026-05-06", "RTX 5080 16G VENTUS 3X OC 顯示卡", 44590],
  ["2026-05-06", "GAMING RTX 5090 SOLID OC 顯示卡+技嘉B850 A ELITE/B860M主機板 組合", 158900],
  ["2026-05-07", "GeForce RTX 5070 12GB GDDR7 X2 顯示卡", 21850],
  ["2026-05-07", "RTX 5080 16G VENTUS 3X OC 顯示卡", 44750],
  ["2026-05-07", "GAMING RTX 5090 SOLID OC 顯示卡+技嘉B850 A ELITE/B860M主機板 組合", 159900],
  ["2026-05-08", "GeForce RTX 5070 12GB GDDR7 X2 顯示卡", 21920],
  ["2026-05-08", "RTX 5080 16G VENTUS 3X OC 顯示卡", 44890],
  ["2026-05-08", "GAMING RTX 5090 SOLID OC 顯示卡+技嘉B850 A ELITE/B860M主機板 組合", 160500]
];

const deleteSql =
  "DELETE FROM prices WHERE date IN ('2026-05-06','2026-05-07','2026-05-08') AND (name LIKE '%5070%' OR name LIKE '%5080%' OR name LIKE '%5090%')";

const insertSql = "INSERT INTO prices (date, name, price) VALUES (?, ?, ?)";

db.serialize(() => {
  db.run(deleteSql, function onDelete(err) {
    if (err) {
      console.error(err);
      db.close();
      return;
    }

    console.log("Deleted", this.changes);
    const stmt = db.prepare(insertSql);
    rows.forEach((row) => stmt.run(row));
    stmt.finalize(() => db.close());
  });
});
