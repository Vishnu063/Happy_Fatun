/** Validate Indian mobile formats without claiming that ownership is verified. */
export function indianMobile(value: string): string | null {
  if (!/^[+\d ()-]{10,25}$/.test(value.trim())) return null;
  const compact = value.trim().replace(/[ ()-]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? `+91${match[1]}` : null;
}
