// Pure light palette and value handling. No DOM, Firebase, or VTT state.
export const LIGHT_MATS = [
  { id: "torch", label: "Torch", color: "#ffb347", radius: 3, fog: 2, intensity: 1 },
  { id: "candle", label: "Candle", color: "#ffe9a8", radius: 1, fog: 1, intensity: .7 },
  { id: "lantern", label: "Lantern", color: "#ffd27a", radius: 4, fog: 3, intensity: 1.1 },
  { id: "campfire", label: "Campfire", color: "#e05a3c", radius: 5, fog: 4, intensity: 1.2 },
  { id: "magic", label: "Magic", color: "#a46be0", radius: 4, fog: 3, intensity: 1 },
  { id: "moonlight", label: "Moonlight", color: "#4aa3e8", radius: 6, fog: 4, intensity: .8 },
  { id: "green-glow", label: "Green glow", color: "#58c46a", radius: 3, fog: 2, intensity: .85 },
  { id: "red-alarm", label: "Red alarm", color: "#e05a3c", radius: 4, fog: 2, intensity: 1.1 },
  { id: "daylight", label: "Daylight", color: "#fff4cf", radius: 8, fog: 6, intensity: 1.5 },
  { id: "dim-ember", label: "Dim ember", color: "#b85b38", radius: 2, fog: 1, intensity: .45 },
];

export const LIGHT_DEFAULT = LIGHT_MATS[0];
export const clampIntensity = (value) => Math.max(.2, Math.min(1.5, Number.isFinite(Number(value)) ? Number(value) : 1));
export const clampLightValue = (value, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));
export const lightSettings = (type = LIGHT_DEFAULT) => ({
  radius: clampLightValue(type?.radius, 1, 12, 3),
  fog: clampLightValue(type?.fog, 0, 12, 2),
  intensity: clampIntensity(type?.intensity),
});
export const lightIntensity = (light) => clampIntensity(light?.intensity);
