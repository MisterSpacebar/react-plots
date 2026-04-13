import { createReadStream } from "fs";
import { parse } from "csv-parse";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const serviceAccount = require("../serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Columns to drop (qualifier/code columns that are always "A")
const DROP_COLS = new Set([
  "agency",
  "site_no",
  "timezone",
  "stream_water_level_elevation_cd",
  "gage_height_cd",
  "water_temp_top_cd",
  "salinity_top_cd",
  "specific_conductance_top_cd",
  "water_temp_bottom_cd",
  "specific_conductance_bottom_cd",
  "salinity_bottom_cd",
]);

// Rename remaining columns to shorter, cleaner names
const RENAME = {
  stream_water_level_elevation_ft_ngvd29: "water_level_ft",
  gage_height_ft_navd88: "gage_height_ft",
  water_temp_top_c: "temp_top_c",
  salinity_top_ppt: "salinity_top_ppt",
  specific_conductance_top_us_cm_25c: "conductance_top_us_cm",
  water_temp_bottom_c: "temp_bottom_c",
  specific_conductance_bottom_us_cm_25c: "conductance_bottom_us_cm",
  salinity_bottom_ppt: "salinity_bottom_ppt",
  airport_temp_min_c: "airport_temp_min_c",
  airport_temp_max_c: "airport_temp_max_c",
  airport_rain_in: "rainfall_in",
};

function parseRow(raw) {
  const row = {};
  let docId = null;
  for (const [key, val] of Object.entries(raw)) {
    if (DROP_COLS.has(key)) continue;
    if (key === "datetime") {
      docId = val.replace(" ", "T"); // e.g. "2025-08-01T00:00:00"
      row.datetime = Timestamp.fromDate(new Date(docId));
      row.date = docId.slice(0, 10); // e.g. "2025-08-01"
      continue;
    }
    const name = RENAME[key] ?? key;
    const num = parseFloat(val);
    row[name] = isNaN(num) ? val : num;
  }
  return { docId, row };
}

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (raw) => rows.push(parseRow(raw)))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function uploadInBatches(rows, collectionName) {
  const BATCH_SIZE = 499;
  let uploaded = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = rows.slice(i, i + BATCH_SIZE);
    for (const { docId, row } of chunk) {
      const ref = db.collection(collectionName).doc(docId);
      batch.set(ref, row);
    }
    let attempts = 0;
    while (attempts < 3) {
      try {
        await batch.commit();
        break;
      } catch (err) {
        attempts++;
        console.error(`  Batch failed (attempt ${attempts}): ${err.message}`);
        if (attempts >= 3) throw err;
        await new Promise((r) => setTimeout(r, 2000 * attempts));
      }
    }
    uploaded += chunk.length;
    console.log(`  Uploaded ${uploaded} / ${rows.length}`);
    // Small delay to avoid hitting Firestore rate limits
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  const DATA_DIR =
    "C:\\Users\\yibin\\OneDrive\\Documents\\Spring 2026 Data Visualization\\water";
  const files = [
    `${DATA_DIR}\\jul_2025_canal_plus_rainfall_readable.csv`,
    `${DATA_DIR}\\aug_2025_canal_plus_rainfall_readable.csv`,
    `${DATA_DIR}\\sep_2025_canal_plus_rainfall_readable.csv`,
  ];

  console.log("Parsing CSV files...");
  const allRows = [];
  for (const file of files) {
    const rows = await parseCSV(file);
    console.log(`  ${file.split("\\").pop()}: ${rows.length} rows`);
    allRows.push(...rows);
  }
  console.log(`Total rows: ${allRows.length}`);

  console.log("Uploading to Firestore collection: canal_ne135...");
  await uploadInBatches(allRows, "canal_ne135");
  console.log("Done.");
}

main().catch(console.error);
