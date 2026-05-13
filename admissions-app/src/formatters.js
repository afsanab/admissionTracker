export function fmtAge(dob) {
  if (!dob) return "";
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return `DOB: ${dob}  ·  Age ${age}`;
}

export function fmtArrival(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function formatPhysicianDisplay(raw) {
  if (!raw) return "";
  if (raw.includes(" ") && !raw.includes(".")) return raw;
  return raw
    .split(/[.\s]+/)
    .filter(Boolean)
    .map((seg) => (seg.toLowerCase() === "dr" ? "Dr." : seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()))
    .join(" ");
}
