"use client";

import React, { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, MapPin } from "lucide-react";
import * as mapboxgl from "mapbox-gl";

const Map = dynamic(() => import("react-map-gl").then((mod) => mod.Map), { ssr: false });
const Marker = dynamic(() => import("react-map-gl").then((mod) => mod.Marker), { ssr: false });

interface Carpark {
  id: string;
  name: string;
  type: "public" | "private";
  pricePerHour: number;
  totalSlots: number;
  lat: number;
  lng: number;
}

const CARPARKS: Carpark[] = [
  { id: "1", name: "Marina Bay Sands Carpark", type: "private", pricePerHour: 5, totalSlots: 50, lat: 1.2834, lng: 103.8607 },
  { id: "2", name: "Raffles Place Public Lot", type: "public", pricePerHour: 2, totalSlots: 80, lat: 1.283, lng: 103.851 },
  { id: "3", name: "Orchard Road Carpark", type: "private", pricePerHour: 4, totalSlots: 40, lat: 1.3048, lng: 103.8318 },
];

const DURATION_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "1h 30min", minutes: 90 },
  { label: "2h", minutes: 120 },
  { label: "3h", minutes: 180 },
  { label: "4h", minutes: 240 },
  { label: "6h", minutes: 360 },
];

const ParkingMapCalculator: React.FC = () => {
  const [selectedCarpark, setSelectedCarpark] = useState<Carpark | null>(CARPARKS[0]);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [finalChoice, setFinalChoice] = useState<Carpark | null>(null);
  const [mapRef, setMapRef] = useState<mapboxgl.Map | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchedLocation, setSearchedLocation] = useState<{ lat: number; lng: number } | null>(null);

  const calculateCost = (carpark: Carpark, duration: number) =>
    parseFloat(((carpark.pricePerHour * duration) / 60).toFixed(2));

  const deg2rad = (deg: number) => deg * (Math.PI / 180);

  const getDistance = (loc: { lat: number; lng: number }, carpark: Carpark) => {
    const R = 6371;
    const dLat = deg2rad(carpark.lat - loc.lat);
    const dLon = deg2rad(carpark.lng - loc.lng);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(deg2rad(loc.lat)) * Math.cos(deg2rad(carpark.lat)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const recommendedCarpark = useMemo(() => {
    if (!selectedCarpark) return null;
    const otherOptions = CARPARKS.filter(c => c.id !== selectedCarpark.id);
    let cheapest = selectedCarpark;
    let minCost = calculateCost(selectedCarpark, selectedDuration);
    otherOptions.forEach(c => {
      const cost = calculateCost(c, selectedDuration);
      if (cost < minCost) {
        cheapest = c;
        minCost = cost;
      }
    });
    return cheapest.id !== selectedCarpark.id ? cheapest : null;
  }, [selectedCarpark, selectedDuration]);

  useEffect(() => {
    if (!searchQuery) return setSearchResults([]);
    const timer = setTimeout(async () => {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=5`);
      const data = await res.json();
      setSearchResults(data);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (result: any) => {
    const location = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    setSearchedLocation(location);
    setSearchQuery(result.display_name);
    setSearchResults([]);

    if (mapRef) mapRef.flyTo({ center: [location.lng, location.lat], zoom: 15 });

    let nearest = CARPARKS[0];
    let minDist = getDistance(location, nearest);
    CARPARKS.forEach(c => {
      const dist = getDistance(location, c);
      if (dist < minDist) {
        nearest = c;
        minDist = dist;
      }
    });
    setSelectedCarpark(nearest);
  };

  return (
    <div className="min-h-screen relative bg-transparent">
      <h1 className="text-center text-4xl font-bold text-white mt-6 pt-10">
        Carpark Cost Comparator
      </h1>
      <div className="relative max-w-6xl mx-auto py-10 px-4 space-y-8">

        {/* Search Input */}
        <div className="relative z-50">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search a location..."
            className="w-full p-3 rounded-xl bg-white/10 text-white border border-white/20 backdrop-blur-md placeholder:text-slate-300"
          />
          {searchResults.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-auto bg-slate-800/90 backdrop-blur-md border border-white/20 rounded-xl z-50">
              {searchResults.map((r, idx) => (
                <li
                  key={idx}
                  className="p-2 cursor-pointer hover:bg-slate-700 text-white"
                  onClick={() => handleSelectLocation(r)}
                >
                  {r.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Map */}
        <div className="w-full h-[450px] rounded-2xl overflow-hidden border border-white/20 relative">
          <Map
            initialViewState={{ latitude: 1.283, longitude: 103.85, zoom: 13 }}
            mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            onLoad={(event: mapboxgl.MapboxEvent & { target: mapboxgl.Map }) => setMapRef(event.target)}
          >
            {/* Duration Selector at top-left */}
            <div className="absolute top-4 left-4 z-50 bg-white/10 backdrop-blur-md rounded-lg p-2 text-white text-sm font-medium flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" /> Duration
              </div>
              {DURATION_PRESETS.map(d => (
                <label key={d.minutes} className="flex items-center gap-1 cursor-pointer hover:text-emerald-400">
                  <input
                    type="radio"
                    name="duration"
                    className="accent-emerald-400"
                    checked={selectedDuration === d.minutes}
                    onChange={() => setSelectedDuration(d.minutes)}
                  />
                  {d.label}
                </label>
              ))}
            </div>

            {CARPARKS.map(c => (
              <Marker key={c.id} latitude={c.lat} longitude={c.lng}>
                <div
                  onClick={() => setSelectedCarpark(c)}
                  className={`cursor-pointer w-6 h-6 rounded-full border-[2.5px] border-white/80 shadow-lg backdrop-blur-md transition-transform transform hover:scale-125 ${
                    selectedCarpark?.id === c.id ? "bg-emerald-400" : c.type === "public" ? "bg-blue-400" : "bg-yellow-400"
                  }`}
                  title={`${c.name} - $${c.pricePerHour}/h`}
                />
              </Marker>
            ))}
            {searchedLocation && (
              <Marker latitude={searchedLocation.lat} longitude={searchedLocation.lng}>
                <div className="w-5 h-5 bg-red-400 rounded-full border border-white shadow-md" title="Searched Location" />
              </Marker>
            )}
          </Map>
        </div>

        {/* Cost Comparison */}
        {/* Cost Comparison */}
        {/* Cost Comparison */}
        {selectedCarpark && (
          <div className="grid grid-cols-2 gap-4">
            {/* Selected Carpark Card */}
            <Card className="p-4 border rounded-xl bg-white/10 backdrop-blur-md relative">
              <input
                type="radio"
                name="carparkChoice"
                checked={finalChoice?.id === selectedCarpark.id}
                onChange={() => setFinalChoice(selectedCarpark)}
                className="absolute top-2 left-2 w-5 h-5 cursor-pointer accent-emerald-500"
              />
              <CardContent className="ml-8">
                <div className="text-white font-semibold">{selectedCarpark.name} ({selectedCarpark.type})</div>
                <div className="text-white text-2xl font-bold mt-2">
                  ${calculateCost(selectedCarpark, selectedDuration).toFixed(2)}
                </div>
              </CardContent>
            </Card>

            {/* Recommended Carpark Card */}
            {recommendedCarpark && (
              <Card className="p-4 border rounded-xl bg-white/10 backdrop-blur-md relative">
                <input
                  type="radio"
                  name="carparkChoice"
                  checked={finalChoice?.id === recommendedCarpark.id}
                  onChange={() => setFinalChoice(recommendedCarpark)}
                  className="absolute top-2 left-2 w-5 h-5 cursor-pointer accent-emerald-500"
                />
                <CardContent className="ml-8">
                  <div className="text-white font-semibold">{recommendedCarpark.name} ({recommendedCarpark.type})</div>
                  <div className="text-white text-2xl font-bold mt-2">
                    ${calculateCost(recommendedCarpark, selectedDuration).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Confirm Choice Button */}
        {finalChoice && (
          <Button
            className="w-full bg-emerald-500/80 hover:bg-emerald-600/80 shadow-lg text-white font-semibold backdrop-blur-md mt-4"
            onClick={() => alert(`Final Choice Confirmed: ${finalChoice.name}`)}
          >
            Confirm Choice
          </Button>
        )}
        {finalChoice && (
          <div className="text-white mt-3 text-center font-medium text-lg">
            Final Choice: {finalChoice.name} ({finalChoice.type})
          </div>
        )}
      </div>
    </div>
  );
};

export default ParkingMapCalculator;
