"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "mapbox-gl/dist/mapbox-gl.css";
import { Marker, Popup } from "react-map-gl";
import haversine from "haversine-distance";
import { svy21ToWgs84 } from "svy21";

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
  const diffHours =
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
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
  const sortMode = "price";
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [parkingDuration, setParkingDuration] = useState<{
    hours: number;
    startDate: Date;
  } | null>(null);
  const [selectedCarpark, setSelectedCarpark] = useState<any>(null);
  const [referenceCarpark, setReferenceCarpark] = useState<any>(null);
  const [referenceLocked, setReferenceLocked] = useState(false);
  const [cheapestCarpark, setCheapestCarpark] = useState<any>(null);
  const [cheapestSelection, setCheapestSelection] = useState<any>(null);
  const [loadingCarparks, setLoadingCarparks] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [sessionNotice, setSessionNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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

  const sortCarparksForDisplay = (list: any[]) => {
    const sorted = [...list];
    if (sortMode === "price") {
      sorted.sort(
        (a, b) => (a.totalCost ?? a.rate ?? 0) - (b.totalCost ?? b.rate ?? 0)
      );
    } else if (sortMode === "occupancy") {
      sorted.sort((a, b) => (b.availableLots || 0) - (a.availableLots || 0));
    } else {
      const getDistanceValue = (cp: any) => {
        if (typeof cp.userDistance === "number") return cp.userDistance;
        if (typeof cp.distance === "number") return cp.distance;
        return Number.POSITIVE_INFINITY;
      };
      sorted.sort((a, b) => getDistanceValue(a) - getDistanceValue(b));
    }
    return sorted;
  };

  const getCarparkDisplayName = (code?: string) => {
    if (!code) return "Unknown Carpark";
    const match = allCarparks.find((cp) => cp.code === code || cp.id === code);
    return match?.name || code;
  };

  const formatHoursValue = (val: any) =>
    typeof val === "number" ? val.toFixed(2) : val ?? "N/A";

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
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("thriftpark_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCurrentUser(parsed?.username || null);
      } catch (err) {
        console.error("Failed to parse thriftpark_user", err);
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
    }
  }, []);

  const fetchSessions = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(
        `http://localhost:3005/get-active-session/${currentUser}`
      );
      if (!res.ok) throw new Error("Failed to fetch active session");
      const data = await res.json();
      setActiveSession(data.activeSession || null);
    } catch (err) {
      console.error("Error fetching active session:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setActiveSession(null);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!startTime || !endTime) {
      setParkingDuration(null);
      if (!referenceLocked) {
        setReferenceCarpark(null);
      }
      setCheapestSelection(null);
      setHasSearched(false);
      return;
    }
    const duration = getParkingDuration(startTime, endTime);
    if (duration) {
      setParkingDuration(duration);
    } else {
      setParkingDuration(null);
    }
    if (!referenceLocked) {
      setReferenceCarpark(null);
    }
    setCheapestSelection(null);
    setHasSearched(false);
    setCheapestSelection(null);
    setHasSearched(false);
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
        if (!privateRes.ok) throw new Error("Failed to fetch private carparks");

        const [publicData, privateData] = await Promise.all([
          publicRes.json(),
          privateRes.json(),
        ]);

        const missingCoords: string[] = [];

        const formatRecord = (
          cp: any,
          idx: number,
          type: "public" | "private"
        ) =>
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
              id: cp.carpark_code || cp.carpark_name || `${type}-${idx}`,
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
      setReferenceCarpark(null);
      setReferenceLocked(false);
      setCheapestCarpark(null);
      return;
    }

    const center = searchLocation ?? currentLocation;
    const filtered = filterByRadius(baseCarparks, center, currentLocation, 500);
    const withCost = applyParkingCost(filtered, parkingDuration);
    const sorted = sortCarparksForDisplay(withCost);

    const existingJson = JSON.stringify(carparks);
    const sortedJson = JSON.stringify(sorted);
    if (existingJson !== sortedJson) {
      setCarparks(sorted);
    }

    if (!sorted.length) {
      setSelectedCarpark(null);
      setReferenceCarpark(null);
      setReferenceLocked(false);
      setCheapestCarpark(null);
      return;
    }

    const cheapest = sorted.reduce((best, cp) => {
      if (!best) return cp;
      const bestCost = best.totalCost ?? best.rate ?? Infinity;
      const currentCost = cp.totalCost ?? cp.rate ?? Infinity;
      return currentCost < bestCost ? cp : best;
    }, null as any);

    if (JSON.stringify(cheapestCarpark) !== JSON.stringify(cheapest)) {
      setCheapestCarpark(cheapest);
    }

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

    if (referenceCarpark) {
      const refMatch = sorted.find((cp) => cp.id === referenceCarpark.id);
      if (refMatch) {
        const equals =
          refMatch.id === referenceCarpark.id &&
          refMatch.totalCost === referenceCarpark.totalCost &&
          refMatch.distance === referenceCarpark.distance &&
          refMatch.userDistance === referenceCarpark.userDistance;
        if (!equals) {
          setReferenceCarpark(refMatch);
        }
      }
    }
  }, [
    baseCarparks,
    currentLocation,
    searchLocation,
    selectedCarpark,
    referenceCarpark,
    parkingDuration,
  ]);

  const normalizeMetaValue = (val: any) => {
    if (val === undefined || val === null) return "";
    return String(val).trim().toLowerCase();
  };

  const findMatchingReference = (list: any[], reference: any) => {
    if (!reference) return null;
    const refId = normalizeMetaValue(
      reference.id || reference.code || reference.carpark_code
    );
    const refName = normalizeMetaValue(reference.name);

    // Exact id/name first
    let match =
      list.find((cp) => {
        const candidateId = normalizeMetaValue(
          cp.id || cp.code || cp.carpark_code
        );
        const candidateName = normalizeMetaValue(cp.name);
        return (
          (refId && candidateId && refId === candidateId) ||
          (refName &&
            candidateName &&
            (candidateName === refName ||
              candidateName.includes(refName) ||
              refName.includes(candidateName)))
        );
      }) || null;

    // Proximity (if we have coords), within 50 m
    if (!match && isLatLng(reference.lat, reference.lng)) {
      match =
        list.find((cp) => {
          if (!isLatLng(cp.lat, cp.lng)) return false;
          const d = haversine(
            { lat: reference.lat, lon: reference.lng },
            { lat: cp.lat, lon: cp.lng }
          );
          return d < 50; // treat as the same place
        }) || null;
    }
    return match;
  };

  const syncReferenceWithList = (list: any[]) => {
    if (!list?.length) {
      if (!referenceLocked) {
        setReferenceCarpark(null);
        setReferenceLocked(false);
      }
      return false;
    }

    if (referenceCarpark) {
      const match = findMatchingReference(list, referenceCarpark);
      if (match) {
        setReferenceCarpark(match);
        if (!referenceLocked) {
          setReferenceLocked(false);
        }
        return true;
      }
    }

    if (referenceLocked) {
      return true;
    }

    setReferenceCarpark(list[0]);
    setReferenceLocked(false);
    return true;
  };

  const fallbackToLocalCarparks = ({
    center,
    shouldSetReference = true,
  }: {
    center?: { lat: number; lng: number };
    shouldSetReference?: boolean;
  }) => {
    if (!center || !isLatLng(center.lat, center.lng) || !allCarparks.length) {
      return false;
    }

    setBaseCarparks([...allCarparks]);

    const scopedList = filterByRadius(
      allCarparks,
      center,
      currentLocation,
      500
    );
    const withCost = applyParkingCost(scopedList, parkingDuration);
    const sorted = sortCarparksForDisplay(withCost);

    if (!shouldSetReference) {
      return !!sorted.length;
    }

    if (!sorted.length) {
      return false;
    }

    return syncReferenceWithList(sorted);
  };

  const runCarparkLookup = async (
    keyword: string,
    options?: {
      fallbackCenter?: { lat: number; lng: number };
      preferredReference?: any;
    }
  ) => {
    const fallback = () =>
      fallbackToLocalCarparks({
        center:
          options?.fallbackCenter ||
          searchLocation ||
          currentLocation ||
          undefined,
      });

    try {
      const res = await fetch("http://localhost:3002/search-carpark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });

      if (!res.ok) {
        const errMsg = await res.text();
        if (res.status === 404) {
          const fallbackSucceeded = fallback();
          if (!fallbackSucceeded) {
            alert("No carparks found for this location.");
          }
          return fallbackSucceeded;
        }
        throw new Error(errMsg || "Failed to fetch carparks.");
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
        const fallbackSucceeded = fallback();
        if (!fallbackSucceeded) {
          alert("No carparks found for this location.");
        }
        return fallbackSucceeded;
      }

      setBaseCarparks(nearby);

      let appliedPreferred = false;

      if (options?.preferredReference) {
        const preferredMatch = findMatchingReference(
          nearby,
          options.preferredReference
        );
        if (preferredMatch) {
          setReferenceCarpark(preferredMatch);
          setReferenceLocked(true);
          appliedPreferred = true;
        }
      }

      // 🔧 NEW: fall back to "nearest to searched point" as Original Selection
      if (!appliedPreferred && options?.fallbackCenter) {
        const center = options.fallbackCenter;
        const withDists = nearby
          .filter((cp: any) => isLatLng(cp.lat, cp.lng))
          .map((cp: any) => ({
            ...cp,
            __dist: haversine(
              { lat: center.lat, lon: center.lng },
              { lat: cp.lat, lon: cp.lng }
            ),
          }))
          .sort((a: any, b: any) => a.__dist - b.__dist);

        if (withDists.length) {
          setReferenceCarpark(withDists[0]);
          setReferenceLocked(true);
          appliedPreferred = true;
        }
      }
      // If user already locked a reference, keep it and (if possible) sync it to the new list
      if (referenceLocked && referenceCarpark) {
        const keep = findMatchingReference(nearby, referenceCarpark);
        if (keep) {
          setReferenceCarpark(keep); // sync to the object from this result set
        }
        // Don't set ANY other reference here; the locked one stands
        return true;
      }

      // existing fallback stays as last resort
      if (!appliedPreferred) {
        syncReferenceWithList(nearby);
      }

      return true;
    } catch (err) {
      console.error("Error fetching carparks:", err);
      const fallbackSucceeded = fallback();
      if (!fallbackSucceeded) {
        alert("Failed to fetch carparks from backend.");
      }
      return fallbackSucceeded;
    }
  };

  const focusOnCarpark = (cp: any, options?: { setReference?: boolean }) => {
    if (!cp) return;
    setSelectedCarpark(cp);
    if (options?.setReference) {
      setReferenceCarpark(cp);
      setReferenceLocked(true);
    }
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [cp.lng, cp.lat], zoom: 16 });
    }
  };

  const handleCheapestCarparkClick = () => {
    if (!cheapestCarpark) return;
    focusOnCarpark(cheapestCarpark, { setReference: false });
    setCheapestSelection(cheapestCarpark);
  };

  const startParkingSession = async (cp: any) => {
    if (!cp) return;

    // Prevent starting another session if one is already active
    if (activeSession) {
      alert(
        "You already have an active parking session. Please end it before starting a new one."
      );
      return;
    }
    // No user detected
    if (!currentUser) {
      alert("Please log in before starting a session.");
      return;
    }
    // Invalid Start and End time
    if (!parkingDuration || parkingDuration.hours <= 0) {
      alert("Please enter a valid start and end time first.");
      return;
    }

    const now = new Date();
    const actualRate = cp.rate ?? deriveRateFromRecord(cp);
    const estimatedCharge = parseFloat(
      (cp.totalCost ?? actualRate * parkingDuration.hours).toFixed(2)
    );

    if (!referenceCarpark) {
      alert(
        "We couldn't determine the original carpark rate. Please search again."
      );
      return;
    }

    const referenceRate = referenceCarpark.rate ?? actualRate;

    // --- Create session payload ---
    const payload = {
      username: currentUser,
      parking_date: now.toISOString().split("T")[0],
      carpark_code: cp.code || cp.id || cp.name || "UNKNOWN",
      parking_planned_hours: parkingDuration.hours,
      parking_estimated_charge: estimatedCharge,
      parking_start_time: now.toISOString().slice(0, 19).replace("T", " "),
      parking_end_time: null,
      parking_actual_hours: null,
      original_parking_rate: referenceRate,
      parking_savings: null,
    };

    try {
      // 1️⃣ Create the session in DB
      const createRes = await fetch("http://localhost:3005/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(`Failed to create session: ${text}`);
      }

      // 2️⃣ Mark it as active and update rates
      const startPayload = {
        username: currentUser,
        parking_charge: actualRate, // actual rate for chosen carpark
        parking_priv_charge: referenceRate, // reference/original rate
      };

      const startRes = await fetch("http://localhost:3005/start-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startPayload),
      });

      if (!startRes.ok) {
        const text = await startRes.text();
        throw new Error(`Failed to start session: ${text}`);
      }

      await fetchSessions();

      setSessionNotice({
        type: "success",
        message: `🚗 Session started at ${cp.name}.`,
      });
    } catch (err: any) {
      console.error("Error starting session:", err);
      setSessionNotice({
        type: "error",
        message: err?.message || "Failed to start session.",
      });
    }
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
    setCheapestSelection(null);

    console.log("🔍 Searching carparks near:", searchLocation);
    const lookupSucceeded = await runCarparkLookup(searchLocation.name, {
      fallbackCenter: { lat: searchLocation.lat, lng: searchLocation.lng },
      preferredReference: {
        id: `user-selected-${searchLocation.name}`,
        name: searchLocation.name,
        lat: searchLocation.lat,
        lng: searchLocation.lng,
      },
    });
    setHasSearched(!!lookupSucceeded);

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
    setCheapestSelection(null);
    setHasSearched(false);

    // Treat the user's chosen place as the Original selection
    if (s.source === "carpark" && s.carpark) {
      // If they clicked a specific carpark suggestion, lock THAT as original
      setReferenceCarpark(s.carpark);
      setReferenceLocked(true);
    } else {
      // If they clicked a generic Mapbox place, lock THAT place as original
      setReferenceCarpark({
        id: `user-selected-${loc.name}`,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
      });
      setReferenceLocked(true);
    }

    if (s.source === "carpark" && s.carpark) {
      fallbackToLocalCarparks({ center: loc, shouldSetReference: false });
      focusOnCarpark(s.carpark, { setReference: true });
    } else {
      let matchedCarpark: any = null;
      const baseName = s.place_name?.split(",")[0]?.trim().toLowerCase();
      if (baseName && allCarparks.length) {
        matchedCarpark =
          allCarparks.find((cp) => cp.name?.toLowerCase() === baseName) ||
          allCarparks.find((cp) => cp.name?.toLowerCase().includes(baseName));
        if (matchedCarpark) {
          focusOnCarpark(matchedCarpark, { setReference: true });
        } else {
          setReferenceCarpark(null);
          setReferenceLocked(false);
        }
      } else {
        setReferenceCarpark(null);
        setReferenceLocked(false);
      }
      runCarparkLookup(loc.name, {
        fallbackCenter: loc,
        preferredReference: matchedCarpark || undefined,
      });
    }

    if (mapRef.current) {
      mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 15 });
    }
  };

  const endActiveSession = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch("http://localhost:3005/end-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: activeSession.username,
          parking_start_time: activeSession.parking_start_time,
          parking_planned_hours: activeSession.parking_planned_hours,
          parking_charge:
            activeSession.parking_charge ??
            activeSession.parking_estimated_charge,
          parking_priv_charge:
            activeSession.parking_priv_charge ??
            activeSession.original_parking_rate ??
            activeSession.parking_estimated_charge ??
            activeSession.parking_charge,
        }),
      });

      if (!res.ok) throw new Error("Failed to end session");
      await fetchSessions();
      setSessionNotice({
        type: "success",
        message: "Session ended successfully.",
      });
    } catch (err: any) {
      console.error("Error ending session:", err);
      setSessionNotice({
        type: "error",
        message: err?.message || "Failed to end session.",
      });
    }
  };

  const referenceCostValue = getCarparkCostValue(referenceCarpark);
  const cheapestCostValue = getCarparkCostValue(cheapestCarpark);
  const costDifference =
    referenceCostValue != null && cheapestCostValue != null
      ? parseFloat((referenceCostValue - cheapestCostValue).toFixed(2))
      : null;
  const referenceLabel =
    referenceCarpark?.name ||
    searchLocation?.name?.split(",")[0] ||
    destinationInput ||
    "your selection";
  const cheaperAvailable =
    !!referenceCarpark &&
    !!cheapestCarpark &&
    referenceCarpark.id !== cheapestCarpark.id &&
    costDifference !== null &&
    costDifference > 0.01;
  const canStartSession = !!referenceCarpark && !!cheapestCarpark;

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

      {hasSearched && referenceCarpark && cheapestCarpark && (
        <div className="max-w-3xl mx-auto mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-sm sm:text-base">
            {/* --- Comparison table --- */}
            <div className="flex-1 space-y-4">
              {/* Original selection */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/50">
                    Original selection
                  </p>
                  <p className="font-semibold text-white">{referenceLabel}</p>
                </div>
                <div className="text-white/80">
                  {formatCostText(referenceCostValue)}
                </div>
              </div>

              <div className="h-px w-full bg-white/10" />

              {/* Cheapest nearby */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-white/50">
                    Cheapest nearby
                  </p>
                  <button
                    type="button"
                    onClick={handleCheapestCarparkClick}
                    className="font-semibold underline decoration-dotted hover:decoration-solid"
                  >
                    {cheapestCarpark.name}
                  </button>
                </div>
                <div className="flex flex-col items-start sm:items-end text-white/80">
                  <span>{formatCostText(cheapestCostValue)}</span>
                  {costDifference !== null && (
                    <span
                      className={`text-xs ${
                        cheaperAvailable ? "text-emerald-300" : "text-white/60"
                      }`}
                    >
                      {cheaperAvailable
                        ? `Save $${costDifference.toFixed(2)}`
                        : "Same price"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* --- Start Session button on right --- */}
            {canStartSession && (
              <button
                type="button"
                onClick={() => startParkingSession(cheapestCarpark)}
                className="self-center sm:self-auto px-5 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 border border-emerald-400 hover:bg-emerald-500/40 text-sm font-medium transition"
              >
                Start Session
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-2 space-y-4"></div>
      {sessionNotice && (
        <div
          className={`p-4 rounded-xl border text-sm ${
            sessionNotice.type === "success"
              ? "bg-emerald-500/15 border-emerald-400 text-emerald-100"
              : "bg-red-500/15 border-red-400 text-red-100"
          }`}
        >
          <div className="flex justify-between items-center gap-4">
            <span>{sessionNotice.message}</span>
            <button
              type="button"
              onClick={() => setSessionNotice(null)}
              className="text-xs uppercase tracking-wide"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {loadingCarparks && (
        <p className="text-center text-sm text-white/70 mt-2">
          Loading carpark markers…
        </p>
      )}

      {/* Map */}
      <div className="mt-2 h-[70vh] rounded-xl overflow-hidden border border-white/20 shadow-lg relative">
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
              </div>
            </Popup>
          )}
        </Map>
      </div>

      <div className="mt-6 space-y-4">
        <div className="border border-white/20 rounded-xl p-4 bg-white/5 text-sm text-white/80 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg text-white font-semibold">Active Session</h2>
            {currentUser ? (
              <span className="text-xs text-white/60">
                Signed in as {currentUser}
              </span>
            ) : (
              <span className="text-xs text-red-200">
                Log in to enable sessions
              </span>
            )}
          </div>

          {activeSession ? (
            <div className="space-y-2">
              <p>
                Carpark:{" "}
                <span className="font-semibold">
                  {getCarparkDisplayName(activeSession.carpark_code)}
                </span>
              </p>
              <p>
                Planned hours:{" "}
                {formatHoursValue(activeSession.parking_planned_hours)}
              </p>
              <p>
                Started:{" "}
                {activeSession.parking_start_time
                  ? new Date(activeSession.parking_start_time).toLocaleString()
                  : "Processing..."}
              </p>
              <button
                type="button"
                onClick={endActiveSession}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
              >
                End Session
              </button>
            </div>
          ) : (
            <p className="text-white/60 text-sm">
              No active parking session. Select a carpark above and tap "Start
              Session" to begin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
