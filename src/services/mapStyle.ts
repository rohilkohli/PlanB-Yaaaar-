/** Google Maps JSON styles. Light = Google's default tiles; Dark = a night map in PlanB's olive-black (works for maps without a Map ID). */
export const DARK_MAP_STYLE: Array<Record<string, unknown>> = [
  { elementType: 'geometry', stylers: [{ color: '#1b2117' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#11140e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b3bda0' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d8e0c8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a2ad8d' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e2a18' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#8aa866' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3526' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1b2117' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9aa585' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3b4630' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1b2117' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#c9d3b3' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#222a1d' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#a2ad8d' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a1c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6f9096' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0e1a1c' }] }
];

export const mapStylesFor = (theme: 'light' | 'dark') => (theme === 'dark' ? DARK_MAP_STYLE : []);
