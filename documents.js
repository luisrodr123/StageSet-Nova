const hiddenRtfDestinations = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer",
  "filetbl", "listtable", "listoverridetable", "generator", "xmlnstbl", "datastore", "themedata",
]);

export function isDocumentSong(song) {
  return Boolean(song && /\.(pdf|rtf|txt)$/i.test(song.fileName));
}

export function rtfToText(source, encoding = "windows-1252") {
  const output = [];
  const groups = [{ skip: false, uc: 1, starred: false }];
  const decodeByte = new TextDecoder(encoding);
  let fallback = 0;

  for (let i = 0; i < source.length; i++) {
    const current = groups.at(-1);
    const char = source[i];
    if (char === "{") {
      groups.push({ ...current, starred: false });
      continue;
    }
    if (char === "}") {
      if (groups.length > 1) groups.pop();
      continue;
    }
    if (char !== "\\") {
      if (fallback > 0) {
        fallback--;
        continue;
      }
      if (!current.skip && char !== "\r" && char !== "\n") output.push(char);
      continue;
    }

    const next = source[i + 1];
    if (next === "\\" || next === "{" || next === "}") {
      i++;
      if (fallback > 0) fallback--;
      else if (!current.skip) output.push(next);
      continue;
    }
    if (next === "'") {
      const encoded = [];
      while (source[i] === "\\" && source[i + 1] === "'" && /^[\da-f]{2}$/i.test(source.slice(i + 2, i + 4))) {
        encoded.push(parseInt(source.slice(i + 2, i + 4), 16));
        i += 4;
      }
      i -= 1;
      if (fallback > 0) fallback--;
      else if (!current.skip) output.push(decodeByte.decode(Uint8Array.from(encoded)));
      continue;
    }
    if (next === "*") {
      current.starred = true;
      i++;
      continue;
    }
    if (!/[a-z]/i.test(next ?? "")) {
      i++;
      if (fallback > 0) fallback--;
      else if (!current.skip) {
        if (next === "~") output.push("\u00a0");
        else if (next === "_") output.push("\u2011");
        else if (next === "-") continue;
        else output.push(next);
      }
      continue;
    }

    let word = "";
    while (i + 1 < source.length && /[a-z]/i.test(source[i + 1])) word += source[++i];
    let parameter = null;
    if (source[i + 1] === "-") {
      let end = i + 2;
      while (end < source.length && /\d/.test(source[end])) end++;
      if (end > i + 2) { parameter = -Number(source.slice(i + 2, end)); i = end - 1; }
    } else {
      let end = i + 1;
      while (end < source.length && /\d/.test(source[end])) end++;
      if (end > i + 1) { parameter = Number(source.slice(i + 1, end)); i = end - 1; }
    }
    if (source[i + 1] === " ") i++;
    if (current.starred) {
      current.starred = false;
      current.skip = true;
    }
    if (hiddenRtfDestinations.has(word)) current.skip = true;
    if (current.skip || fallback > 0) continue;

    if (word === "uc" && parameter !== null) current.uc = Math.max(0, Math.min(8, parameter));
    else if (word === "u" && parameter !== null) {
      output.push(String.fromCharCode(parameter < 0 ? parameter + 65536 : parameter));
      fallback = current.uc;
    } else if (word === "par" || word === "line") output.push("\n");
    else if (word === "tab") output.push("\t");
    else if (word === "emdash") output.push("—");
    else if (word === "endash") output.push("–");
    else if (word === "bullet") output.push("•");
    else if (word === "lquote") output.push("‘");
    else if (word === "rquote") output.push("’");
    else if (word === "ldblquote") output.push("“");
    else if (word === "rdblquote") output.push("”");
  }

  return output.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export async function readDocumentText(file) {
  if (/\.rtf$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder("windows-1252").decode(bytes.subarray(0, Math.min(bytes.length, 512)));
    const codepage = Number(header.match(/\\ansicpg(\d+)/i)?.[1] ?? 1252);
    let encoding = codepage === 65001 ? "utf-8" : `windows-${codepage || 1252}`;
    let source;
    try { source = new TextDecoder(encoding).decode(bytes); }
    catch { encoding = "windows-1252"; source = new TextDecoder(encoding).decode(bytes); }
    return rtfToText(source, encoding);
  }
  return (await file.text()).replace(/^\uFEFF/, "");
}
