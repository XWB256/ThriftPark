declare module "haversine-distance" {
  export default function haversineDistance(
    a:
      | { lat: number; lon: number }
      | { latitude: number; longitude: number }
      | [number, number],
    b:
      | { lat: number; lon: number }
      | { latitude: number; longitude: number }
      | [number, number]
  ): number;
}
