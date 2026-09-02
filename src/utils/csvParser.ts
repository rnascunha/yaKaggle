export function parseCsv(csvString: string): Record<string, string>[] {
  if (!csvString || !csvString.trim()) return [];

  let clean = csvString
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/^\uFEFF/, "")
    .trim();
  const rawLines = clean.split(/\r?\n/);
  const headerLineIndex = rawLines.findIndex((line) => {
    const l = line.toLowerCase();
    return (
      l.includes(",") &&
      (l.includes("teamid") ||
        l.includes("teamname") ||
        l.includes("ref") ||
        l.includes("title") ||
        l.includes("name") ||
        l.includes("id"))
    );
  });

  if (headerLineIndex !== -1) {
    clean = rawLines.slice(headerLineIndex).join("\n");
  }

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < clean.length && clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field.trim());
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && i + 1 < clean.length && clean[i + 1] === "\n") {
          i++;
        }
        row.push(field.trim());
        if (row.some((val) => val.length > 0)) records.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((val) => val.length > 0)) records.push(row);
  }

  if (records.length < 2) return [];

  const headers = records[0].map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  return records.slice(1).map((r) => {
    const entry: Record<string, string> = {};
    headers.forEach((h, idx) => {
      let val = r[idx] ?? "";
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.substring(1, val.length - 1);
      }
      entry[h] = val;
    });
    return entry;
  });
}
