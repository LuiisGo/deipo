// Adapter boundary: no tile/style provider, token, paid resource or third-party map request.
export type DeliveryPoint = { latitude: number; longitude: number };
export function browserLocation(): Promise<DeliveryPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Error("LOCATION_UNAVAILABLE"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(Error("LOCATION_UNAVAILABLE")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}
