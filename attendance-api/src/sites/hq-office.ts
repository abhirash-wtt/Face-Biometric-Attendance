/** Walking Tree Technologies Agra office — M.G. Plaza building (basement through 2nd floor). */
export const HQ_OFFICE = {
  code: 'HQ',
  name: 'Walking Tree Technologies — Agra',
  lat: 27.1531296,
  lng: 78.0504704,
  radius_m: 45,
  /** Closed ring not required. Vertices are [lat, lng], W→N→E→S around the rectangular building. */
  geofence_polygon: [
    [27.1531862, 78.0504062],
    [27.1532393, 78.0506474],
    [27.1531197, 78.0506795],
    [27.1530672, 78.0504389],
  ] as Array<[number, number]>,
};
