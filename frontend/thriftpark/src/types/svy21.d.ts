declare module "svy21" {
  export function svy21ToWgs84(
    northing: number,
    easting: number
  ): [latitude: number, longitude: number];

  export function wgs84ToSvy21(
    latitude: number,
    longitude: number
  ): [northing: number, easting: number];
}
