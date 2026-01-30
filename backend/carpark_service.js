require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const { svy21ToWgs84 } = require("svy21");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3002;
app.use(cors());
app.use(bodyParser.json());

// MySQL connection
const db = mysql.createConnection({
  host: "10.96.188.212",
  user: "host",
  password: "ThriftParkDB",
  database: "thriftpark",
  port: 3306,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to ThriftPark Database", err.stack);
    return;
  }
  console.log("Connected to ThriftPark Database successfully!");
});

// Setup multer for file upload
const upload = multer({ dest: "uploads/" });

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.REACT_APP_MAPBOX_TOKEN ||
  "";
const geocodeCache = new Map();
let mapboxWarningLogged = false;

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const safeParseFloat = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

// === Geocoding: shared constants/helpers ===
// Singapore bounding box (rough): SW[103.602,1.130], NE[104.116,1.474]
const SG_BBOX = [103.602, 1.130, 104.116, 1.474];
/** Geocoding helper: ensure a coordinate lies within Singapore. */
const inSgBbox = (lat, lng) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  lng >= SG_BBOX[0] &&
  lng <= SG_BBOX[2] &&
  lat >= SG_BBOX[1] &&
  lat <= SG_BBOX[3];

// === Geocoding provider: OneMap SG ===
// OneMap SG (public endpoints) — no token required for common search
const ONEMAP_BASE = "https://developers.onemap.sg";

/**
 * geocodeOneMap(query)
 * OneMap-first geocoding of a free‑text place string.
 * Returns { lat, lng } on success, or null when not found.
 */
async function geocodeOneMap(query) {
  if (!query) return null;

  // Try placesearch (POI) first
  const buildUrl = (endpoint) => {
    const params = new URLSearchParams({
      searchVal: query,
      returnGeom: "Y",
      getAddrDetails: "Y",
      pageNum: "1",
    });
    return `${ONEMAP_BASE}/commonapi/${endpoint}?${params.toString()}`;
  };

  const endpoints = ["placesearch", "search"];
  for (const ep of endpoints) {
    try {
      const resp = await fetch(buildUrl(ep));
      if (!resp.ok) continue;
      const data = await resp.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) continue;

      // Heuristics: prefer entries with BUILDING or CATEGORY akin to carparks/malls
      const score = (r) => {
        const cat = (r.CATEGORY || "").toLowerCase();
        const bld = (r.BUILDING || r.SEARCHVAL || "").toLowerCase();
        let s = 0;
        if (cat.includes("shopping") || cat.includes("mall")) s += 2;
        if (bld.includes("car park") || bld.includes("carpark")) s += 2;
        if (cat.includes("car park")) s += 2;
        if (bld) s += 1;
        return s;
      };
      results.sort((a, b) => score(b) - score(a));

      for (const r of results) {
        const lat = parseFloat(r.LATITUDE);
        const lng = parseFloat(r.LONGITUDE);
        if (Number.isFinite(lat) && Number.isFinite(lng) && inSgBbox(lat, lng)) {
          return { lat, lng };
        }
      }
    } catch (e) {
      // Keep trying other endpoint / fallbacks
      console.warn("[OneMap] geocode error for", query, e.message || e);
    }
  }
  return null;
}

// === Unified Geocoder (OneMap → Mapbox fallback) ===
/**
 * geocodeAddress(query, opts)
 * Unified entry used by uploads and maintenance endpoints.
 * - Calls OneMap SG first.
 * - Falls back to Mapbox (POI-only, SG-bounded) when available.
 * - Caches results per (query, opts).
 * Returns { lat, lng } or null.
 */
const geocodeAddress = async (
  query,
  opts = {
    limit: 5,
    types: "poi",
    minRelevance: 0.7,
    bbox: SG_BBOX,
  }
) => {
  if (!query) return null;
  // Try OneMap first regardless of Mapbox token
  const cacheKey = `${query}|${opts.types}|${opts.limit}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  try {
    const om = await geocodeOneMap(query);
    if (om && inSgBbox(om.lat, om.lng)) {
      geocodeCache.set(cacheKey, om);
      return om;
    }
  } catch (e) {
    console.warn("[OneMap] initial lookup failed for", query, e.message || e);
  }

  // If no Mapbox token, we can't try Mapbox fallback
  if (!MAPBOX_TOKEN) {
    if (!mapboxWarningLogged) {
      console.warn("[Geocode] MAPBOX_TOKEN not set. Using OneMap only.");
      mapboxWarningLogged = true;
    }
    geocodeCache.set(cacheKey, null);
    return null;
  }

  const params = new URLSearchParams({
    country: "SG",
    limit: String(opts.limit ?? 5),
    types: opts.types ?? "poi",
    language: "en",
    access_token: MAPBOX_TOKEN,
  });
  if (opts.bbox && Array.isArray(opts.bbox) && opts.bbox.length === 4) {
    params.set("bbox", opts.bbox.join(","));
  }
  // prefer exact matches over fuzzy
  params.set("autocomplete", "false");

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query
  )}.json?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox error ${response.status}`);
    }
    const data = await response.json();
    const features = Array.isArray(data.features) ? data.features : [];

    // Keep only POIs within SG bbox and with decent relevance
    const minRel = opts.minRelevance ?? 0.7;
    const inBbox = (c) =>
      c &&
      c[0] >= SG_BBOX[0] &&
      c[0] <= SG_BBOX[2] &&
      c[1] >= SG_BBOX[1] &&
      c[1] <= SG_BBOX[3];

    const filtered = features
      .filter((f) =>
        Array.isArray(f.place_type) &&
        f.place_type.includes("poi") &&
        typeof f.relevance === "number" &&
        f.relevance >= minRel &&
        Array.isArray(f.center) &&
        inBbox(f.center)
      )
      // prefer higher relevance, then closer to the middle of SG to avoid off-country results
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));

    const chosen = filtered[0] || null;
    let coords = chosen?.center
      ? { lat: chosen.center[1], lng: chosen.center[0] }
      : null;

    geocodeCache.set(cacheKey, coords);
    return coords;
  } catch (err) {
    console.error("[Geocode] Failed for query:", query, err.message || err);
    geocodeCache.set(cacheKey, null);
    return null;
  }
};

// === Geocoding query builder (private carparks) ===
/**
 * formatPrivateCarparkQuery(row)
 * Build a clean geocoding string: "<name>, Singapore".
 * Avoids region/category terms that bias generic centroids.
 */
const formatPrivateCarparkQuery = (row) => {
  // Use only the place name and country; region/category terms like "West"
  // cause Mapbox to return a generic centroid repeatedly.
  const name = row.carpark || row.carpark_name || "";
  return `${name}, Singapore`;
};

// === Coordinate conversion (SVY21 → WGS84) — not geocoding ===
const convertCoordPair = (xCoord, yCoord, meta = {}) => {
  const easting = typeof xCoord === "string" ? parseFloat(xCoord) : xCoord;
  const northing = typeof yCoord === "string" ? parseFloat(yCoord) : yCoord;

  if (!isFiniteNumber(easting) || !isFiniteNumber(northing)) {
    console.warn("[SVY21] Invalid coordinate pair skipped", {
      easting,
      northing,
      ...meta,
    });
    return null;
  }

  try {
    const [lat, lng] = svy21ToWgs84(northing, easting);
    if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
      return { lat, lng };
    }
  } catch (err) {
    console.error("[SVY21] Conversion failed", meta, err);
  }

  console.warn("[SVY21] Conversion produced invalid results", {
    easting,
    northing,
    ...meta,
  });
  return null;
};

const attachConvertedCoords = (carpark) => {
  if (
    isFiniteNumber(carpark.latitude_wgs84) &&
    isFiniteNumber(carpark.longitude_wgs84)
  ) {
    return carpark;
  }

  const converted = convertCoordPair(carpark.x_coord, carpark.y_coord, {
    carpark_code: carpark.carpark_code,
  });

  return {
    ...carpark,
    latitude_wgs84: converted?.lat ?? null,
    longitude_wgs84: converted?.lng ?? null,
  };
};

// CSV Bulk Upload API
app.post("/upload-carparks", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const filePath = req.file.path;
  const carparks = [];
  const invalidCoords = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      // Convert numeric fields
      const converted = convertCoordPair(row.x_coord, row.y_coord, {
        carpark_code: row.carpark_code,
        source: "upload-carparks",
      });
      if (!converted) {
        invalidCoords.push({
          carpark_code: row.carpark_code,
          address: row.address,
        });
      }

      carparks.push([
        row.carpark_code,
        row.carpark_category,
        row.address,
        parseFloat(row.x_coord),
        parseFloat(row.y_coord),
        row.carpark_type,
        row.parking_sys_type,
        row.short_parking,
        row.free_parking,
        row.night_parking,
        row.weekday_rate_1,
        row.weekday_rate_2,
        row.saturday_rate,
        row.sunday_ph_rate,
        parseInt(row.carpark_decks),
        parseFloat(row.gantry_height),
        row.carpark_basement ? row.carpark_basement : "N", // Default to 'N' if empty
        converted?.lat ?? null,
        converted?.lng ?? null,
      ]);
    })
    .on("end", () => {
      // Bulk insert into carpark_info
      const query = `
                INSERT INTO carpark_info 
                (carpark_code, carpark_category, address, x_coord, y_coord, carpark_type, parking_sys_type, short_parking, free_parking, night_parking, weekday_rate_1, weekday_rate_2, saturday_rate, sunday_ph_rate, carpark_decks, gantry_height, carpark_basement, latitude_wgs84, longitude_wgs84)
                VALUES ?
                ON DUPLICATE KEY UPDATE 
                carpark_category = VALUES(carpark_category),
                address = VALUES(address),
                x_coord = VALUES(x_coord),
                y_coord = VALUES(y_coord),
                carpark_type = VALUES(carpark_type),
                parking_sys_type = VALUES(parking_sys_type),
                short_parking = VALUES(short_parking),
                free_parking = VALUES(free_parking),
                night_parking = VALUES(night_parking),
                weekday_rate_1 = VALUES(weekday_rate_1),
                weekday_rate_2 = VALUES(weekday_rate_2),
                saturday_rate = VALUES(saturday_rate),
                sunday_ph_rate = VALUES(sunday_ph_rate),
                carpark_decks = VALUES(carpark_decks),
                gantry_height = VALUES(gantry_height),
                carpark_basement = VALUES(carpark_basement),
                latitude_wgs84 = VALUES(latitude_wgs84),
                longitude_wgs84 = VALUES(longitude_wgs84)
            `;
      db.query(query, [carparks], (err, result) => {
        fs.unlinkSync(filePath); // remove file after processing
        if (err) {
          console.error("Error inserting carpark data", err);
          return res.status(500).send("Failed to insert carpark data");
        }
        return res.status(200).json({
          message: "CSV uploaded successfully",
          insertedRows: result.affectedRows,
          coordinatesMissing: invalidCoords.length,
          missingCarparks: invalidCoords,
        });
      });
    })
    .on("error", (err) => {
      fs.unlinkSync(filePath);
      console.error("Error reading CSV", err);
      return res.status(500).send("Error processing CSV");
    });
});

app.post("/upload-private-carparks", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const filePath = req.file.path;
  const rows = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      rows.push(row);
    })
    .on("end", async () => {
      try {
        const carparks = [];
        const geocodeFailures = [];

        for (const row of rows) {
          const weekday1 = safeParseFloat(row.weekday_rate_1);
          const weekday2 = safeParseFloat(row.weekday_rate_2);
          const saturday = safeParseFloat(row.saturday_rate);
          const sunday = safeParseFloat(row.sunday_ph_rate);

          let coords = null;
          const baseQuery = formatPrivateCarparkQuery(row);
          // 1) Try strict POI search (Mapbox → OneMap fallback baked in)
          coords = await geocodeAddress(baseQuery, {
            limit: 5,
            types: "poi",
            minRelevance: 0.8,
            bbox: SG_BBOX,
          });

          // 2) Fallback: add common parking terms
          if (!coords && row.carpark) {
            const attempts = [
              `${row.carpark} car park, Singapore`,
              `${row.carpark} parking, Singapore`,
              `${row.carpark} mall, Singapore`,
            ];
            for (const q of attempts) {
              coords = await geocodeAddress(q, {
                limit: 5,
                types: "poi",
                minRelevance: 0.7,
                bbox: SG_BBOX,
              });
              if (coords) break;
            }
          }

          if (!coords) {
            geocodeFailures.push(row.carpark || "Unknown Carpark");
          }

          carparks.push([
            row.carpark,
            row.category,
            weekday1,
            weekday2,
            saturday,
            sunday,
            coords?.lat ?? null,
            coords?.lng ?? null,
          ]);
        }

        const query = `
                INSERT INTO priv_carpark_info 
                (carpark_name, carpark_category, weekday_rate_1, weekday_rate_2, saturday_rate, sunday_ph_rate, latitude_wgs84, longitude_wgs84)
                VALUES ?
                ON DUPLICATE KEY UPDATE 
                carpark_category = VALUES(carpark_category),
                weekday_rate_1 = VALUES(weekday_rate_1),
                weekday_rate_2 = VALUES(weekday_rate_2),
                saturday_rate = VALUES(saturday_rate),
                sunday_ph_rate = VALUES(sunday_ph_rate),
                latitude_wgs84 = VALUES(latitude_wgs84),
                longitude_wgs84 = VALUES(longitude_wgs84)
            `;

        db.query(query, [carparks], (err, result) => {
          fs.unlinkSync(filePath);
          if (err) {
            console.error("Error inserting private carpark data", err);
            return res
              .status(500)
              .send("Failed to insert private carpark data");
          }
          return res.status(200).json({
            message: "Private carpark CSV uploaded successfully",
            insertedRows: result.affectedRows,
            geocodeFailures: geocodeFailures.length,
            failedCarparks: geocodeFailures,
          });
        });
      } catch (processingError) {
        fs.unlinkSync(filePath);
        console.error("Error processing private carpark CSV", processingError);
        return res
          .status(500)
          .send("Failed to process private carpark data with geocoding");
      }
    })
    .on("error", (err) => {
      fs.unlinkSync(filePath);
      console.error("Error reading CSV", err);
      return res.status(500).send("Error processing CSV");
    });
});

// Add all the API methods here
app.get("/get-carpark-list", (req, res) => {
  const query = "SELECT * FROM carpark_info";
  db.query(query, (err, results) => {
    if (err) {
      console.error("[Database error] Failed to get carpark list");
      return res.status(500).send("Error getting carpark list");
    }

    const enriched = results.map(attachConvertedCoords);

    return res.status(200).json({ message: "carparks: ", results: enriched });
  });
});

app.get("/get-private-carpark-list", (req, res) => {
  const query = "SELECT * FROM priv_carpark_info";
  db.query(query, (err, results) => {
    if (err) {
      console.error("[Database error] Failed to get private carpark list");
      return res.status(500).send("Error getting private carpark list");
    }

    return res.status(200).json({ message: "private carparks: ", results });
  });
});

app.post("/cost-comparison", (req, res) => {
  const { carparks } = req.body;
  /**
   * {
   *   "carparks": [
   *      { "name": "Carpark A", "price_per_hour": 2.5 },
   *      { "name": "Carpark B", "price_per_hour": 1.8 },
   *      { "name": "Carpark C", "price_per_hour": 3.0 }
   *   ]
   * }
   */

  if (!carparks || !Array.isArray(carparks) || carparks.length === 0) {
    return res.status(400).json({ error: "carparks array is required" });
  }

  for (const cp of carparks) {
    if (!cp.name || cp.price_per_hour == null || isNaN(cp.price_per_hour)) {
      return res.status(400).json({
        error: "Each carpark must have a valid name and numeric price_per_hour",
      });
    }
  }

  let minCarpark = carparks[0];
  let maxCarpark = carparks[0];

  for (const cp of carparks) {
    if (cp.price_per_hour < minCarpark.price_per_hour) {
      minCarpark = cp;
    }
    if (cp.price_per_hour > maxCarpark.price_per_hour) {
      maxCarpark = cp;
    }
  }

  const priceDifference = parseFloat(
    (maxCarpark.price_per_hour - minCarpark.price_per_hour).toFixed(2)
  );

  return res.status(200).json({
    message: "Cost comparison completed successfully",
    cheapest_carpark: {
      name: minCarpark.name,
      price_per_hour: minCarpark.price_per_hour,
    },
    most_expensive_carpark: {
      name: maxCarpark.name,
      price_per_hour: maxCarpark.price_per_hour,
    },
    price_difference: priceDifference,
  });
});

app.post("/search-carpark", (req, res) => {
  const { keyword } = req.body;

  if (!keyword || keyword.trim() === "") {
    return res.status(400).json({ error: "Keyword is required" });
  }

  const searchQuery = `
        SELECT carpark_code, carpark_category, address, x_coord, y_coord, carpark_type
        FROM carpark_info
        WHERE address LIKE ? OR carpark_code LIKE ? OR carpark_category LIKE ?
    `;

  db.query(
    searchQuery,
    [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`],
    (err, results) => {
      if (err) {
        console.error("[Database Error] Failed to search carpark:", err);
        return res.status(500).json({ error: "Database query failed" });
      }

      if (results.length === 0) {
        return res
          .status(404)
          .json({ message: "No carpark found matching the keyword" });
      }

      const withCoords = results.map(attachConvertedCoords);

      //only choose the first one to find the nearby (<=500 m) park
      const target = withCoords[0];
      const targetX = parseFloat(target.x_coord);
      const targetY = parseFloat(target.y_coord);

      if (!isFiniteNumber(targetX) || !isFiniteNumber(targetY)) {
        return res.status(400).json({
          error: "Matched carpark is missing coordinates for proximity search.",
        });
      }

      const nearbyQuery = `
            SELECT carpark_code, carpark_category, address, x_coord, y_coord, carpark_type,
                   SQRT(POW(x_coord - ?, 2) + POW(y_coord - ?, 2)) AS distance
            FROM carpark_info
            HAVING distance <= 500
            ORDER BY distance ASC
        `;

      db.query(nearbyQuery, [targetX, targetY], (err2, nearbyResults) => {
        if (err2) {
          console.error(
            "[Database Error] Failed to find nearby carparks:",
            err2
          );
          return res.status(500).json({
            error: "Database query failed when finding nearby carparks",
          });
        }

        return res.status(200).json({
          message: "Carpark search completed successfully",
          keyword: keyword,
          matched_carparks: withCoords,
          nearby_carparks_within_500m: nearbyResults.map(attachConvertedCoords),
        });
      });
    }
  );
});

app.post("/geocode-private-carparks", async (req, res) => {
  try {
    const overwrite = req.query.overwrite === "1" || req.body?.overwrite === true;
    const selector = overwrite
      ? `SELECT carpark_name, carpark_category FROM priv_carpark_info`
      : `SELECT carpark_name, carpark_category FROM priv_carpark_info WHERE latitude_wgs84 IS NULL OR longitude_wgs84 IS NULL`;
    const rows = await runQuery(selector);

    if (!rows.length) {
      return res
        .status(200)
        .json({ message: "All private carparks already have coordinates." });
    }

    const updated = [];
    const failed = [];

    for (const row of rows) {
      let coords = await geocodeAddress(formatPrivateCarparkQuery(row), {
        limit: 5,
        types: "poi",
        minRelevance: 0.8,
        bbox: SG_BBOX,
      });
      if (!coords) {
        const attempts = [
          `${row.carpark_name} car park, Singapore`,
          `${row.carpark_name} parking, Singapore`,
          `${row.carpark_name} mall, Singapore`,
        ];
        for (const q of attempts) {
          coords = await geocodeAddress(q, {
            limit: 5,
            types: "poi",
            minRelevance: 0.7,
            bbox: SG_BBOX,
          });
          if (coords) break;
        }
      }

      if (coords) {
        await runQuery(
          `UPDATE priv_carpark_info SET latitude_wgs84 = ?, longitude_wgs84 = ? WHERE carpark_name = ?`,
          [coords.lat, coords.lng, row.carpark_name]
        );
        updated.push(row.carpark_name);
      } else {
        failed.push(row.carpark_name);
      }
    }

    return res.status(200).json({
      message: "Private carpark geocoding complete",
      updated: updated.length,
      failed: failed.length,
      failedCarparks: failed,
    });
  } catch (err) {
    console.error("[Geocode] Failed to update private carparks:", err);
    return res
      .status(500)
      .json({ error: "Failed to geocode private carpark list" });
  }
});

app.listen(PORT, () => {
  console.log(`carpark-service is running on port ${PORT}`);
});
