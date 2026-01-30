"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "mapbox-gl/dist/mapbox-gl.css";
import { Marker, Popup } from "react-map-gl";
import haversine from "haversine-distance";
import { svy21ToWgs84 } from "svy21";
import { useRouter } from "next/navigation";

const Map = dynamic(() => import("react-map-gl").then((mod) => mod.Map), {
  ssr: false,
});

const isLatLng = (
  lat: number | null | undefined,
  lng: number | null | undefined
) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

const getLatLngFromCoords = (x: any, y: any) => {
  const east = typeof x === "string" ? parseFloat(x) : x;
  const north = typeof y === "string" ? parseFloat(y) : y;

  if (isLatLng(north, east)) {
    return { lat: north, lng: east };
  }

  if (!Number.isFinite(east) || !Number.isFinite(north)) return null;

  try {
    const [lat, lng] = svy21ToWgs84(north, east);
    if (isLatLng(lat, lng)) {
      return { lat, lng };
    }
  } catch (err) {
    console.error("SVY21 conversion failed:", err);
  }

  return null;
};

const getCoordsFromRecord = (record: any) => {
  if (isLatLng(record?.latitude_wgs84, record?.longitude_wgs84)) {
    return {
      lat: record.latitude_wgs84,
      lng: record.longitude_wgs84,
    };
  }
  return getLatLngFromCoords(record?.x_coord, record?.y_coord);
};

const getParkingDuration = (start: string, end: string) => {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  if (diffHours <= 0 || diffHours > 24) return null;
  return { hours: diffHours, startDate };
};

const deriveRateFromRecord = (cp: any) => {
  const candidates = [
    cp.rawRates?.weekday_rate_1 ?? cp.weekday_rate_1,
    cp.rawRates?.weekday_rate_2 ?? cp.weekday_rate_2,
    cp.rawRates?.saturday_rate ?? cp.saturday_rate,
    cp.rawRates?.sunday_ph_rate ?? cp.sunday_ph_rate,
    cp.rate,
  ];
  for (const val of candidates) {
    const parsed = parseFloat(val);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1.5;
};

const applyParkingCost = (
  list: any[],
  duration: { hours: number; startDate: Date } | null
) => {
  if (!duration) {
    return list.map((cp) => ({ ...cp, totalCost: null }));
  }
  return list.map((cp) => {
    const baseRate = deriveRateFromRecord(cp);
    const totalCost = parseFloat((baseRate * duration.hours).toFixed(2));
    return { ...cp, rate: baseRate, totalCost };
  });
};

const getCarparkCostValue = (cp: any | null | undefined) => {
  if (!cp) return null;
  const val = cp.totalCost ?? cp.rate;
  return typeof val === "number" ? val : null;
};

const filterByRadius = (
  list: any[],
  center: { lat: number; lng: number } | null,
  userLocation: { lat: number; lng: number } | null,
  radiusMeters = 500
) => {
  const hasCenter = center && isLatLng(center.lat, center.lng);
  const hasUser = userLocation && isLatLng(userLocation.lat, userLocation.lng);

  const withDistances = list
    .map((cp) => {
      if (!isLatLng(cp?.lat, cp?.lng)) return null;

      const distanceToCenter =
        hasCenter && center
          ? haversine(
              { lat: center.lat, lon: center.lng },
              { lat: cp.lat, lon: cp.lng }
            )
          : cp.distance ?? null;

      const distanceToUser =
        hasUser && userLocation
          ? haversine(
              { lat: userLocation.lat, lon: userLocation.lng },
              { lat: cp.lat, lon: cp.lng }
            )
          : cp.userDistance ?? null;

      return {
        ...cp,
        distance: distanceToCenter,
        userDistance: distanceToUser,
      };
    })
    .filter(Boolean);

  if (!hasCenter) return withDistances;

  const withinRadius = withDistances.filter(
    (cp) => typeof cp.distance === "number" && cp.distance <= radiusMeters
  );

  if (withinRadius.length > 0) return withinRadius;

  const sortedByDistance = withDistances
    .filter((cp) => typeof cp.distance === "number")
    .sort((a, b) => (a.distance || 0) - (b.distance || 0));

  return sortedByDistance.slice(0, Math.min(10, sortedByDistance.length));
};

export default function DirectionsPage() {
  const mapRef = useRef<any>(null);
  const router = useRouter();

  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [searchLocation, setSearchLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [destinationInput, setDestinationInput] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [allCarparks, setAllCarparks] = useState<any[]>([]);
  const [baseCarparks, setBaseCarparks] = useState<any[]>([]);
  const [carparks, setCarparks] = useState<any[]>([]);
  const [filters, setFilters] = useState({ sort: "proximity" });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [parkingDuration, setParkingDuration] = useState<{
    hours: number;
    startDate: Date;
  } | null>(null);
  const [selectedCarpark, setSelectedCarpark] = useState<any>(null);
  const [cheapestCarpark, setCheapestCarpark] = useState<any>(null);
  const [loadingCarparks, setLoadingCarparks] = useState(false);
  const [sessionModal, setSessionModal] = useState<{
    open: boolean;
    carpark?: any;
  }>({ open: false });

  const formatCostText = (cost: number | null) => {
    if (cost == null) return "N/A";
    return parkingDuration
      ? `$${cost.toFixed(2)} for ${parkingDuration.hours.toFixed(2)}h stay`
      : `$${cost.toFixed(2)}/hour`;
  };

  const getDisplayDistance = (cp: any) => {
    if (!cp) return null;
    if (searchLocation && typeof cp.distance === "number") {
      return { value: cp.distance, label: "destination" };
    }
    if (typeof cp.userDistance === "number") {
      return { value: cp.userDistance, label: "you" };
    }
    if (typeof cp.distance === "number") {
      return { value: cp.distance, label: null };
    }
    return null;
  };

  const getSortedCarparks = (list: any[], mode: string) => {
    const sorted = [...list];
    if (mode === "price") {
      sorted.sort(
        (a, b) => (a.totalCost ?? a.rate ?? 0) - (b.totalCost ?? b.rate ?? 0)
      );
      return sorted;
    }
    if (mode === "occupancy") {
      sorted.sort(
        (a, b) => (b.availableLots || 0) - (a.availableLots || 0)
      );
      return sorted;
    }
    const getDistanceValue = (cp: any) => {
      if (typeof cp.userDistance === "number") return cp.userDistance;
      if (typeof cp.distance === "number") return cp.distance;
      return Number.POSITIVE_INFINITY;
    };
    sorted.sort((a, b) => getDistanceValue(a) - getDistanceValue(b));
    return sorted;
  };

  // ✅ Get current location and center map
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          console.log("📍 Current location:", loc);
          setCurrentLocation(loc);
          if (mapRef.current) {
            mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 15 });
          }
        },
        (err) => console.error("❌ Location error:", err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  useEffect(() => {
    if (!startTime || !endTime) {
      setParkingDuration(null);
      return;
    }
    const duration = getParkingDuration(startTime, endTime);
    if (duration) {
      setParkingDuration(duration);
    } else {
      setParkingDuration(null);
    }
  }, [startTime, endTime]);

  // ✅ Fetch suggestions from Mapbox + local carparks
  useEffect(() => {
    if (destinationInput.length < 2) {
      setSuggestions([]);
      return;
    }

    const inputLower = destinationInput.toLowerCase();
    const localCarparkSuggestions = allCarparks
      .filter(
        (cp) =>
          cp?.name &&
          cp.name.toLowerCase().includes(inputLower) &&
          isLatLng(cp.lat, cp.lng)
      )
      .slice(0, 5)
      .map((cp) => ({
        id: `carpark-${cp.id}`,
        place_name: cp.name,
        center: [cp.lng, cp.lat],
        source: "carpark",
        carpark: cp,
      }));

    setSuggestions(localCarparkSuggestions);

    const fetchSuggestions = async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            destinationInput
          )}.json?country=SG&autocomplete=true&limit=5&access_token=${
            process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          }`
        );
        const data = await res.json();
        console.log("📍 Suggestions:", data.features);
        if (data.features) {
          const uniquePlaceNames = new Set(
            localCarparkSuggestions.map((s) => s.place_name)
          );
          const mapboxSuggestions = data.features.filter((feature: any) => {
            if (!feature?.place_name) return false;
            const name = feature.place_name;
            if (uniquePlaceNames.has(name)) return false;
            uniquePlaceNames.add(name);
            return true;
          });
          setSuggestions([...localCarparkSuggestions, ...mapboxSuggestions]);
        }
      } catch (err) {
        console.error("❌ Error fetching suggestions:", err);
      }
    };

    fetchSuggestions();
  }, [destinationInput, allCarparks]);
  // ✅ Load static carpark list from backend on mount
  useEffect(() => {
    const fetchCarparks = async () => {
      setLoadingCarparks(true);
      try {
        const [publicRes, privateRes] = await Promise.all([
          fetch("http://localhost:3002/get-carpark-list"),
          fetch("http://localhost:3002/get-private-carpark-list"),
        ]);

        if (!publicRes.ok) throw new Error("Failed to fetch public carparks");
        if (!privateRes.ok)
          throw new Error("Failed to fetch private carparks");

        const [publicData, privateData] = await Promise.all([
          publicRes.json(),
          privateRes.json(),
        ]);

        const missingCoords: string[] = [];

        const formatRecord = (cp: any, idx: number, type: "public" | "private") =>
          (() => {
            const coords = getCoordsFromRecord(cp);
            if (!coords) {
              missingCoords.push(
                cp.carpark_code ||
                  cp.carpark_name ||
                  cp.address ||
                  `${type}-${idx}`
              );
              return null;
            }

            const availableLots =
              parseInt(cp.carpark_decks, 10) > 0
                ? parseInt(cp.carpark_decks, 10) * 15
                : Math.floor(Math.random() * 30) + 10;

            const rate =
              parseFloat(cp.weekday_rate_1) ||
              parseFloat(cp.weekday_rate_2) ||
              parseFloat(cp.saturday_rate) ||
              parseFloat(cp.sunday_ph_rate) ||
              1.5;

            return {
              id:
                cp.carpark_code ||
                cp.carpark_name ||
                `${type}-${idx}`,
              name:
                cp.address ||
                cp.carpark_name ||
                cp.carpark_code ||
                `Carpark ${type === "public" ? idx + 1 : `P-${idx + 1}`}`,
              ...coords,
              availableLots,
              rate,
              rawRates: {
                weekday_rate_1: cp.weekday_rate_1,
                weekday_rate_2: cp.weekday_rate_2,
                saturday_rate: cp.saturday_rate,
                sunday_ph_rate: cp.sunday_ph_rate,
              },
              distance: null,
              userDistance: null,
              restriction:
                cp.carpark_type ||
                cp.carpark_category ||
                (type === "private" ? "Private" : "Public"),
              isPrivate: type === "private",
            };
          })();

        const publicFormatted =
          publicData?.results
            ?.map((cp: any, idx: number) => formatRecord(cp, idx, "public"))
            .filter(Boolean) || [];

        const privateFormatted =
          privateData?.results
            ?.map((cp: any, idx: number) => formatRecord(cp, idx, "private"))
            .filter(Boolean) || [];

        if (missingCoords.length) {
          console.warn(
            "Some carparks are missing converted coordinates and were skipped:",
            missingCoords.slice(0, 50)
          );
        }

        const combined = [...publicFormatted, ...privateFormatted];
        setAllCarparks(combined);
        setBaseCarparks(combined);
      } catch (err) {
        console.error("Error fetching carpark list:", err);
      } finally {
        setLoadingCarparks(false);
      }
    };

    fetchCarparks();
  }, []);

  useEffect(() => {
    if (!baseCarparks.length) {
      setCarparks([]);
      setSelectedCarpark(null);
      setCheapestCarpark(null);
      return;
    }

    const center = searchLocation ?? currentLocation;
    const filtered = filterByRadius(baseCarparks, center, currentLocation, 500);
    const withCost = applyParkingCost(filtered, parkingDuration);
    const sorted = getSortedCarparks(withCost, filters.sort);

    const existingJson = JSON.stringify(carparks);
    const sortedJson = JSON.stringify(sorted);
    if (existingJson !== sortedJson) {
      setCarparks(sorted);
    }

    if (!sorted.length) {
      setSelectedCarpark(null);
      setCheapestCarpark(null);
      return;
    }

    const cheapest = sorted.reduce((best, cp) => {
      if (!best) return cp;
      const bestCost = best.totalCost ?? best.rate ?? Infinity;
      const currentCost = cp.totalCost ?? cp.rate ?? Infinity;
      return currentCost < bestCost ? cp : best;
    }, null as any);

    const cheapestChanged =
      JSON.stringify(cheapestCarpark) !== JSON.stringify(cheapest);
    if (cheapestChanged) setCheapestCarpark(cheapest);

    if (selectedCarpark) {
      const matched = sorted.find((cp) => cp.id === selectedCarpark.id);
      if (matched) {
        const equals =
          matched.id === selectedCarpark.id &&
          matched.totalCost === selectedCarpark.totalCost &&
          matched.rate === selectedCarpark.rate &&
          matched.distance === selectedCarpark.distance &&
          matched.userDistance === selectedCarpark.userDistance;
        if (!equals) {
          setSelectedCarpark(matched);
        }
      } else {
        setSelectedCarpark(null);
      }
    }
  }, [
    baseCarparks,
    currentLocation,
    searchLocation,
    filters.sort,
    selectedCarpark,
    parkingDuration,
  ]);

  const fallbackToLocalCarparks = (center?: { lat: number; lng: number }) => {
    if (!center || !isLatLng(center.lat, center.lng) || !allCarparks.length) {
      return false;
    }
    setBaseCarparks([...allCarparks]);
    return true;
  };

  const runCarparkLookup = async (
    keyword: string,
    options?: { fallbackCenter?: { lat: number; lng: number } }
  ) => {
    const fallback = () => fallbackToLocalCarparks(options?.fallbackCenter);

    try {
      const res = await fetch("http://localhost:3002/search-carpark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });

      if (!res.ok) {
        const errMsg = await res.text();
        console.error("Backend error:", errMsg);
        if (res.status === 404) {
          if (!fallback()) {
            alert("No carparks found for this location.");
          }
          return;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      console.log("Carpark list:", data);

      const missingNearby: string[] = [];
      const nearby = data.nearby_carparks_within_500m
        ?.map((cp: any, idx: number) => {
          const coords = getCoordsFromRecord(cp);
          if (!coords) {
            missingNearby.push(
              cp.carpark_code || cp.address || `nearby-${idx}`
            );
            return null;
          }
          const rate = deriveRateFromRecord(cp);
          return {
            id: cp.carpark_code || `nearby-${idx}`,
            name: cp.address,
            ...coords,
            availableLots: Math.floor(Math.random() * 50) + 10, // optional mock field
            rate,
            distance: null,
            userDistance: null,
            rawRates: {
              weekday_rate_1: cp.weekday_rate_1,
              weekday_rate_2: cp.weekday_rate_2,
              saturday_rate: cp.saturday_rate,
              sunday_ph_rate: cp.sunday_ph_rate,
            },
            restriction: cp.carpark_type,
          };
        })
        .filter(Boolean);

      if (missingNearby?.length) {
        console.warn(
          "Nearby carparks missing coordinates:",
          missingNearby.slice(0, 20)
        );
      }

      if (!nearby?.length) {
        if (!fallback()) {
          alert("No carparks found for this location.");
        }
        return;
      }

      setBaseCarparks(nearby);
    } catch (err) {
      console.error("Error fetching carparks:", err);
      if (!fallback()) {
        alert("Failed to fetch carparks from backend.");
      }
    }
  };

  const focusOnCarpark = (cp: any) => {
    if (!cp) return;
    setSelectedCarpark(cp);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [cp.lng, cp.lat], zoom: 16 });
    }
  };

  const openSessionModal = (cp: any) => {
    setSessionModal({ open: true, carpark: cp });
  };

  const closeSessionModal = () => setSessionModal({ open: false, carpark: null });

  const confirmSessionStart = () => {
    if (!sessionModal.carpark) return;
    const payload = {
      timestamp: Date.now(),
      selectedCarpark: sessionModal.carpark,
      cheapestCarpark,
      duration: parkingDuration,
      startTime,
      endTime,
    };
    try {
      sessionStorage.setItem(
        "pendingParkingSession",
        JSON.stringify(payload)
      );
    } catch (err) {
      console.error("Failed to persist session payload", err);
    }
    closeSessionModal();
    router.push("/dashboard/park-session");
  };

  // ✅ Handle carpark search
  const handleSearch = async () => {
    if (!searchLocation) return alert("Please select a valid location.");
    if (!startTime || !endTime)
      return alert("Please select a start and end time.");

    const duration = getParkingDuration(startTime, endTime);
    if (!duration) {
      return alert("Duration must be less than 24 hours and end after start.");
    }
    setParkingDuration(duration);

    console.log("🔍 Searching carparks near:", searchLocation);
    await runCarparkLookup(searchLocation.name, {
      fallbackCenter: { lat: searchLocation.lat, lng: searchLocation.lng },
    });

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [searchLocation.lng, searchLocation.lat],
        zoom: 15,
      });
    }
  };

  // ✅ When selecting suggestion, recenter the map
  const handleSelectLocation = (s: any) => {
    const loc = { lat: s.center[1], lng: s.center[0], name: s.place_name };
    console.log("📍 Selected location:", loc);
    setSearchLocation(loc);
    setDestinationInput(s.place_name);
    setSuggestions([]);

    if (s.source === "carpark" && s.carpark) {
      fallbackToLocalCarparks(loc);
      focusOnCarpark(s.carpark);
    } else {
      runCarparkLookup(loc.name, { fallbackCenter: loc });
    }

    if (mapRef.current) {
      mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 15 });
    }
  };

  const selectedCostValue = getCarparkCostValue(selectedCarpark);
  const cheapestCostValue = getCarparkCostValue(cheapestCarpark);
  const costDifference =
    selectedCostValue != null && cheapestCostValue != null
      ? parseFloat((selectedCostValue - cheapestCostValue).toFixed(2))
      : null;
  const cheaperAvailable =
    !!selectedCarpark &&
    !!cheapestCarpark &&
    cheapestCarpark.id !== selectedCarpark.id &&
    costDifference !== null &&
    costDifference > 0.01;

  return (
    <div className="flex flex-col min-h-screen px-4 sm:px-8 text-white pt-28 sm:pt-32 bg-[#0b0b0b]">
      <h1 className="text-3xl sm:text-4xl font-bold mb-6 text-center">
        Find Nearby Carparks
      </h1>

      {/* Search Inputs */}
      <div className="flex flex-col sm:flex-row justify-center gap-4 relative max-w-3xl mx-auto">
        <input
          type="text"
          placeholder="Enter location or landmark"
          value={destinationInput}
          onChange={(e) => setDestinationInput(e.target.value)}
          className="p-3 rounded-xl bg-white/10 placeholder-white/70 text-white w-full border border-white/30 backdrop-blur-md"
        />

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <ul className="absolute top-14 left-0 right-0 bg-white/10 backdrop-blur-md rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 p-2 hover:bg-white/20 cursor-pointer"
                onClick={() => handleSelectLocation(s)}
              >
                {s.source === "carpark" ? "🅿️" : "📍"} {s.place_name}
              </li>
            ))}
          </ul>
        )}

        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="p-3 rounded-xl bg-white/10 text-white border border-white/30 backdrop-blur-md"
        />
        <input
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="p-3 rounded-xl bg-white/10 text-white border border-white/30 backdrop-blur-md"
        />

        <button
          onClick={handleSearch}
          className="p-3 bg-[#1db7dd] text-black font-semibold rounded-xl hover:bg-[#19a3c4] transition"
        >
          Search
        </button>
      </div>

      {/* Filters */}
      <div className="flex justify-center mt-4 gap-4">
        <select
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value })}
          className="p-2 bg-white/10 border border-white/30 text-white rounded-lg"
        >
          <option value="proximity">Nearest</option>
          <option value="price">Lowest Price</option>
          <option value="occupancy">Most Lots</option>
        </select>
      </div>
      {cheapestCarpark && (
        <div className="mt-3 text-center text-sm text-white/80 space-x-1">
          {selectedCarpark ? (
            cheaperAvailable ? (
              <>
                <span>Cheapest nearby:</span>
                <button
                  type="button"
                  onClick={() => focusOnCarpark(cheapestCarpark)}
                  className="font-semibold underline decoration-dotted hover:decoration-solid"
                >
                  {cheapestCarpark.name}
                </button>
                <span>
                  saves ${costDifference!.toFixed(2)} vs {selectedCarpark.name} (
                  {formatCostText(cheapestCostValue)})
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">{selectedCarpark.name}</span>
                <span>
                  is already the cheapest nearby (
                  {formatCostText(selectedCostValue)}).
                </span>
              </>
            )
          ) : (
            <>
              <span>Cheapest nearby:</span>
              <button
                type="button"
                onClick={() => focusOnCarpark(cheapestCarpark)}
                className="font-semibold underline decoration-dotted hover:decoration-solid"
              >
                {cheapestCarpark.name}
              </button>
              <span>• {formatCostText(cheapestCostValue)}</span>
              <button
                type="button"
                onClick={() => openSessionModal(cheapestCarpark)}
                className="ml-2 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-xs border border-emerald-400 hover:bg-emerald-500/40"
              >
                Start session
              </button>
            </>
          )}
        </div>
      )}
      {loadingCarparks && (
        <p className="text-center text-sm text-white/70 mt-2">
          Loading carpark markers…
        </p>
      )}

      {/* Map */}
      <div className="mt-8 h-[70vh] rounded-xl overflow-hidden border border-white/20 shadow-lg relative">
        <Map
          ref={mapRef}
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          initialViewState={{
            longitude: currentLocation?.lng || 103.8198,
            latitude: currentLocation?.lat || 1.3521,
            zoom: 13,
          }}
          onLoad={() => {
            console.log("🗺️ Map loaded successfully");
            setMapLoaded(true);
          }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
        >
          {/* User Marker */}
          {currentLocation && (
            <Marker
              latitude={currentLocation.lat}
              longitude={currentLocation.lng}
            >
              <div className="bg-blue-500/70 text-white px-2 py-1 rounded-full shadow-lg">
                You
              </div>
            </Marker>
          )}

          {/* Search Marker */}
          {searchLocation && (
            <Marker
              latitude={searchLocation.lat}
              longitude={searchLocation.lng}
            >
              <div className="bg-green-500/70 text-white px-2 py-1 rounded-full shadow-lg">
                📍 {searchLocation.name.split(",")[0]}
              </div>
            </Marker>
          )}

          {/* Carpark Markers */}
          {carparks.map((cp, i) => (
            <Marker
              key={cp.id ?? i}
              latitude={cp.lat}
              longitude={cp.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                focusOnCarpark(cp);
                console.log("🅿️ Selected carpark:", cp);
              }}
            >
              <div
                className={`px-2 py-1 text-sm font-semibold rounded-lg backdrop-blur-md ${
                  selectedCarpark?.name === cp.name
                    ? "bg-yellow-400 text-black border border-yellow-300"
                    : "bg-[#1db7dd]/70 text-black"
                }`}
              >
                🅿️
              </div>
            </Marker>
          ))}

          {/* Popup for selected carpark */}
          {selectedCarpark && (
            <Popup
              latitude={selectedCarpark.lat}
              longitude={selectedCarpark.lng}
              anchor="top"
              closeButton={true}
              closeOnClick={false}
              onClose={() => setSelectedCarpark(null)}
              className="text-black"
            >
              <div className="text-black font-medium space-y-1">
                <h3 className="font-bold">{selectedCarpark.name}</h3>
                <p className="text-sm">💰 ${selectedCarpark.rate}/hour</p>
                {typeof selectedCarpark.totalCost === "number" && (
                  <p className="text-sm">
                    🧾 Estimated ${selectedCarpark.totalCost.toFixed(2)} total
                  </p>
                )}
                <p className="text-sm">
                  🚗 {selectedCarpark.availableLots} lots available
                </p>
                <p className="text-sm">
                  📏{" "}
                  {(() => {
                    const distanceInfo = getDisplayDistance(selectedCarpark);
                    if (!distanceInfo) return "Distance unavailable";
                    const suffix =
                      distanceInfo.label === "destination"
                        ? "from destination"
                        : distanceInfo.label === "you"
                        ? "from you"
                        : "away";
                    return `${Math.round(distanceInfo.value)}m ${suffix}`;
                  })()}
                </p>
                <p className="text-sm">⚙️ {selectedCarpark.restriction}</p>

                {/* Directions button with start point */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${currentLocation?.lat},${currentLocation?.lng}&destination=${selectedCarpark.lat},${selectedCarpark.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-3 py-1 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition"
                >
                  🚗 Get Directions
                </a>
                <button
                  type="button"
                  onClick={() => openSessionModal(selectedCarpark)}
                  className="inline-block mt-2 px-3 py-1 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition w-full"
                >
                  ⏱️ Start Parking Session
                </button>
              </div>
            </Popup>
          )}
        </Map>
      </div>

      {sessionModal.open && sessionModal.carpark && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white text-black rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-xl font-bold">Start Parking Session</h3>
            <p className="text-sm text-gray-600">
              You are about to start a session at{" "}
              <span className="font-semibold">{sessionModal.carpark.name}</span>
              .
            </p>
            {cheaperAvailable && cheapestCarpark && (
              <div className="bg-gray-100 rounded-lg p-3 text-sm space-y-1">
                <p>
                  Selected:{" "}
                  <span className="font-semibold">
                    {sessionModal.carpark.name}
                  </span>{" "}
                  ({formatCostText(getCarparkCostValue(sessionModal.carpark))})
                </p>
                <p>
                  Cheapest nearby:{" "}
                  <button
                    type="button"
                    onClick={() => {
                      focusOnCarpark(cheapestCarpark);
                      openSessionModal(cheapestCarpark);
                    }}
                    className="font-semibold underline decoration-dotted hover:decoration-solid"
                  >
                    {cheapestCarpark.name}
                  </button>{" "}
                  ({formatCostText(cheapestCostValue)})
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500">
              You’ll be redirected to the Park Session page to complete the
              workflow.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={confirmSessionStart}
                className="flex-1 bg-emerald-500 text-white py-2 rounded-lg font-semibold hover:bg-emerald-600"
              >
                Confirm &amp; Continue
              </button>
              <button
                type="button"
                onClick={closeSessionModal}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
