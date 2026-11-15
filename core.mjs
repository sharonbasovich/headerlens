/** HeaderLens: explicit context for a deliberately restricted table model.
 * Not browser-computed associations, screen-reader output, or a compliance verdict.
 */
export const MODEL = 'Explicit header context in the supported simple-table model';
const fail = message => { throw new Error(message); };
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object.`);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || !keys.every(key => actual.includes(key))) fail(`${label} has missing or unsupported fields.`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) fail(`${label} must contain data fields only.`);
  }
}
function textValue(value, label) {
  if (typeof value !== 'string' || value.length > 500) fail(`${label} must be text of at most 500 UTF-16 code units.`);
  // These cannot round-trip through the HTML parser without replacement/normalization.
  if (/[\u0000\r]/u.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail(`${label} contains unsupported control or unpaired surrogate characters.`);
}
export function validateTable(table) {
  exactKeys(table, ['caption', 'rows'], 'Table');
  textValue(table.caption, 'Caption');
  if (!Array.isArray(table.rows) || table.rows.length < 2 || table.rows.length > 30) fail('Use 2–30 rows including one header row.');
  const width = table.rows[0]?.length;
  if (!Number.isInteger(width) || width < 2 || width > 12) fail('Use 2–12 columns.');
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r];
    if (!Array.isArray(row) || row.length !== width) fail(`Row ${r + 1} is missing or not rectangular.`);
    for (let c = 0; c < width; c++) {
      const cell = row[c];
      exactKeys(cell, ['text', 'kind', 'scope'], `Cell ${r + 1},${c + 1}`);
      textValue(cell.text, `Cell ${r + 1},${c + 1}`);
      if (r === 0) {
        if (cell.kind !== 'th' || cell.scope !== 'col') fail('Every top-row cell must explicitly be a column header (th, scope col). Implicit or multi-level headers are not modeled.');
      } else if (c === 0) {
        if (!((cell.kind === 'td' && cell.scope === null) || (cell.kind === 'th' && cell.scope === 'row'))) fail('Body first-column cells must be data cells or explicit row headers.');
      } else if (cell.kind !== 'td' || cell.scope !== null) fail('Other body cells must be data cells; multi-level headers are unsupported.');
    }
  }
  return true;
}
function cloneTable(table) {
  return {caption: table.caption, rows: table.rows.map(row => row.map(cell => ({...cell})))};
}
export function proposeRowHeaders(table, enabled) {
  validateTable(table);
  if (typeof enabled !== 'boolean') fail('Choose explicitly whether to use row headers.');
  const result = cloneTable(table);
  for (let r = 1; r < result.rows.length; r++) {
    result.rows[r][0].kind = enabled ? 'th' : 'td';
    result.rows[r][0].scope = enabled ? 'row' : null;
  }
  validateTable(result);
  return result;
}
function context(table, row, col) {
  if (table.rows[row][col].kind !== 'td') return [];
  const headers = [];
  if (col > 0 && table.rows[row][0].kind === 'th') headers.push({row, col: 0, text: table.rows[row][0].text, scope: 'row'});
  headers.push({row: 0, col, text: table.rows[0][col].text, scope: 'col'});
  return headers;
}
export function contextForCell(table, row, col) {
  validateTable(table);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= table.rows.length || col >= table.rows[0].length) fail('Cell coordinates are outside the table.');
  return context(table, row, col);
}
export function compareTables(before, after) {
  validateTable(before); validateTable(after);
  if (before.caption !== after.caption || before.rows.length !== after.rows.length || before.rows[0].length !== after.rows[0].length) fail('A change receipt requires unchanged caption and dimensions.');
  const roleChanges = [], contextChanges = [];
  for (let r = 0; r < before.rows.length; r++) {
    for (let c = 0; c < before.rows[r].length; c++) {
      const a = before.rows[r][c], b = after.rows[r][c];
      if (a.text !== b.text) fail(`Content changed at cell ${r + 1},${c + 1}; no preservation receipt can be issued.`);
      if (a.kind !== b.kind || a.scope !== b.scope) roleChanges.push({row:r, col:c, text:a.text, before:{kind:a.kind,scope:a.scope}, after:{kind:b.kind,scope:b.scope}});
      if (a.kind === 'td' && b.kind === 'td') {
        const oldContext = context(before, r, c), newContext = context(after, r, c);
        if (JSON.stringify(oldContext) !== JSON.stringify(newContext)) contextChanges.push({row:r,col:c,text:a.text,before:oldContext,after:newContext});
      }
    }
  }
  return {model: MODEL, preservation:{unchanged:true,cellCount:before.rows.length * before.rows[0].length,rows:before.rows.length,columns:before.rows[0].length},roleChanges,contextChanges};
}
export function escapeHTML(value) {
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
export function exportHTML(table) {
  validateTable(table);
  const renderRow = row => `    <tr>${row.map(cell => `<${cell.kind}${cell.scope ? ` scope="${cell.scope}"` : ''}>${escapeHTML(cell.text)}</${cell.kind}>`).join('')}</tr>`;
  return `<table>\n  <caption>${escapeHTML(table.caption)}</caption>\n  <thead>\n${renderRow(table.rows[0])}\n  </thead>\n  <tbody>\n${table.rows.slice(1).map(renderRow).join('\n')}\n  </tbody>\n</table>\n`;
}
export function exportReceipt(before, after) {
  return JSON.stringify(compareTables(before, after), null, 2) + '\n';
}
