// The world's clock: day number and hour (0-24), kept in world.data.time so every player sees the same time.
export const timeOf = world => ({ day: world.data.time?.day ?? 1, hour: world.data.time?.hour ?? 10 });
const subs = new Set();
export const onTime = f => { subs.add(f); return () => subs.delete(f); };
// Move the clock on by some hours (days roll over), or set it outright with { day, hour }.
export function setTime(app, patch) {
  const t = { ...timeOf(app.world), ...patch };
  t.day += Math.floor(t.hour / 24); t.hour = ((t.hour % 24) + 24) % 24;
  app.world.data.time = t; for (const f of subs) f(t); app.save(); app.request();
}
export const advance = (app, hours) => { const t = timeOf(app.world); setTime(app, { hour: t.hour + hours }); };
