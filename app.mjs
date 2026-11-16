/* HeaderLens: imported markup is parsed as strict XML, never attached or executed. */
export const WORKSHOP = `<table>
  <caption>Workshop schedule · synthetic example</caption>
  <tr><th scope="col">Workshop</th><th scope="col">Monday</th><th scope="col">Tuesday</th></tr>
  <tr><td>Intro</td><td>09:00</td><td>11:00</td></tr>
  <tr><td>Advanced</td><td>14:00</td><td>16:00</td></tr>
</table>`;
export const MERGED = `<table>
  <caption>Unsupported merged header · synthetic example</caption>
  <tr><th scope="col">Workshop</th><th scope="col" colspan="2">Weekdays</th></tr>
  <tr><td>Intro</td><td>09:00</td><td>11:00</td></tr>
</table>`;

export function parseTableMarkup(source, Parser = globalThis.DOMParser) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Paste one table before previewing.');
  if (source.length > 200000) throw new Error('This input is too large. Use at most 200,000 characters.');
  if (/<!|<\?/.test(source)) throw new Error('Comments, document declarations and entities are outside this text-only format. Paste only the table.');
  if (source.includes('\r')) throw new Error('Use LF line endings. Carriage returns cannot be preserved by this parser.');
  if (typeof Parser !== 'function') throw new Error('The safe table parser is unavailable in this browser.');
  const doc = new Parser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement || doc.documentElement.tagName !== 'table') {
    throw new Error('Use one well-formed table: close every tag, quote attribute values and escape literal & as &amp;. Only standard XML text escapes are supported.');
  }
  const root = doc.documentElement;
  const allowed = new Set(['table', 'caption', 'thead', 'tbody', 'tr', 'td', 'th']);
  for (const el of [root, ...root.getElementsByTagName('*')]) {
    if (!allowed.has(el.tagName) || el.namespaceURI) throw new Error(`Unsupported element: ${el.tagName}. Only a simple text-only table is supported.`);
    for (const attr of el.attributes) {
      if (!(el.tagName === 'th' && attr.name === 'scope' && ['row', 'col'].includes(attr.value))) {
        throw new Error(`Unsupported attribute: ${attr.name}. Spans, IDs, custom associations, formatting and structural overrides are not modeled.`);
      }
    }
  }
  function children(el) {
    for (const node of el.childNodes) {
      if (node.nodeType !== 1 && !(node.nodeType === 3 && !node.textContent.trim())) throw new Error(`Unexpected content inside ${el.tagName}. Keep text inside cells or a caption.`);
    }
    return [...el.children];
  }
  function textOnly(el) {
    if ([...el.childNodes].some(n => n.nodeType !== 3)) throw new Error('Cells and captions must contain plain text only, with no nested elements or comments.');
    return el.textContent;
  }
  let caption = '', seenCaption = false, seenRows = false, seenHead = false, seenBody = false;
  const rowElements = [];
  for (const child of children(root)) {
    if (child.tagName === 'caption') {
      if (seenCaption || seenRows) throw new Error('Use at most one caption, before all rows.');
      caption = textOnly(child); seenCaption = true;
    } else if (child.tagName === 'tr') {
      if (seenHead || seenBody) throw new Error('Use either direct rows or thead/tbody groups, not a mixture.');
      seenRows = true; rowElements.push(child);
    } else if (child.tagName === 'thead' || child.tagName === 'tbody') {
      if (seenRows && !seenHead && !seenBody) throw new Error('Use either direct rows or thead/tbody groups, not a mixture.');
      if (child.tagName === 'thead') {
        if (seenHead || seenBody) throw new Error('Use one thead before the tbody.');
        seenHead = true;
      } else {
        if (seenBody) throw new Error('Use only one tbody.');
        seenBody = true;
      }
      const rows = children(child);
      if (!rows.length || rows.some(n => n.tagName !== 'tr')) throw new Error('Table groups must contain rows only.');
      if (child.tagName === 'thead' && rows.length !== 1) throw new Error('Multilevel header rows are not supported. Use one explicit column-header row.');
      rowElements.push(...rows); seenRows = true;
    } else throw new Error(`Unexpected ${child.tagName} inside the table.`);
  }
  const rows = rowElements.map(row => children(row).map(cell => {
    if (!['th', 'td'].includes(cell.tagName)) throw new Error('Each row must contain only th or td cells.');
    return {text: textOnly(cell), kind: cell.tagName, scope: cell.getAttribute('scope')};
  }));
  return {caption, rows};
}

let startupReady = false;
function initialize(core) {
  const $ = id => document.getElementById(id);
  const source = $('source'), mode = $('mode'), status = $('status');
  let active = null;
  function say(message, error = false) { status.textContent = message; status.className = error ? 'error' : ''; }
  function clear(message) {
    active = null;
    $('results').hidden = true; $('empty').hidden = false;
    $('result-badge').textContent = 'Awaiting preview';
    $('html-download').disabled = $('receipt-download').disabled = $('undo').disabled = true;
    source.removeAttribute('aria-invalid');
    for (const id of ['before','after','contexts','roles','metrics']) $(id).replaceChildren();
    if (message) say(message);
  }
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function renderTable(model, container) {
    const table = element('table');
    if (model.caption) table.append(element('caption', model.caption));
    const head = element('thead'), body = element('tbody');
    model.rows.forEach((row, r) => {
      const tr = element('tr');
      row.forEach(cell => {
        const el = element(cell.kind, cell.text);
        if (cell.scope) el.setAttribute('scope', cell.scope);
        tr.append(el);
      });
      (r === 0 ? head : body).append(tr);
    });
    table.append(head,body); container.replaceChildren(table);
  }
  function contextText(context) { return context.map(h => h.text || '(empty header)').join(' + ') || 'No explicit headers in this model'; }
  function renderChange(change, role = false) {
    const row = element('div', undefined, 'change');
    const name = element('div', change.text || '(empty cell)', 'cell-name');
    name.append(element('span', `Row ${change.row + 1}, column ${change.col + 1}`, 'coordinate'));
    const path = element('div', undefined, 'context-path');
    const roleText = value => value.kind === 'td' ? 'Data cell' : `${value.scope === 'row' ? 'Row' : 'Column'} header`;
    const arrow = element('span', '→'); arrow.setAttribute('aria-label', 'changes to');
    path.append(element('span', role ? roleText(change.before) : contextText(change.before), 'before-context'), arrow,
      element('span', role ? roleText(change.after) : contextText(change.after), 'after-context'));
    row.append(name,path); return row;
  }
  function preview() {
    clear();
    try {
      const before = parseTableMarkup(source.value);
      core.validateTable(before);
      const after = core.proposeRowHeaders(before, mode.value === 'add');
      const receipt = core.compareTables(before,after);
      // Check that the exact supported export round-trips before enabling a download.
      const html = core.exportHTML(after);
      const roundTrip = parseTableMarkup(html);
      core.validateTable(roundTrip);
      if (JSON.stringify(roundTrip) !== JSON.stringify(after)) throw new Error('Export preservation check failed. Nothing was downloaded.');
      const json = core.exportReceipt(before,after);
      active = {before,after,html,json};
      const metrics = [[receipt.contextChanges.length,'data-cell context changes'],[receipt.roleChanges.length,'label-role changes'],[receipt.preservation.cellCount,'cell texts preserved']];
      $('metrics').replaceChildren(...metrics.map(([count,label]) => {
        const metric = element('div',undefined,'metric'); metric.append(element('strong',String(count)),element('span',label)); return metric;
      }));
      renderTable(before,$('before')); renderTable(after,$('after'));
      $('contexts').replaceChildren(...(receipt.contextChanges.length ? receipt.contextChanges.map(c => renderChange(c)) : [element('p','No retained data-cell context changes for this proposal.','small')]));
      $('roles').replaceChildren(...(receipt.roleChanges.length ? receipt.roleChanges.map(c => renderChange(c,true)) : [element('p','No label roles changed. This is a no-op.','small')]));
      $('results').hidden = false; $('empty').hidden = true;
      $('result-badge').textContent = 'Content preserved';
      $('html-download').disabled = $('receipt-download').disabled = $('undo').disabled = false;
      say(`Preview ready: ${receipt.contextChanges.length} context changes, ${receipt.roleChanges.length} role changes. All ${receipt.preservation.cellCount} cell texts and positions preserved. Original input unchanged.`);
    } catch (error) {
      clear(); source.setAttribute('aria-invalid','true'); $('result-badge').textContent = 'Not supported';
      say(`Not previewed: ${error.message} Your input is unchanged; no correction or export is available.`,true);
    }
  }
  function download(kind) {
    if (!active) return;
    const content = kind === 'html' ? active.html : active.json;
    // The downloaded file has no HTTP Content-Type. A BOM preserves UTF-8
    // when this table fragment is opened on its own, without changing the core export.
    const blob = new Blob(kind === 'html' ? ['\uFEFF', content] : [content],{type:kind === 'html' ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = element('a');
    link.href = url; link.download = kind === 'html' ? 'headerlens-corrected-table.html' : 'headerlens-change-receipt.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    say(`Downloaded ${kind === 'html' ? 'the supported corrected table' : 'the change receipt'}. Review it in context; this is not an accessibility certification.`);
  }
  const bind = (target, type, handler) => target.addEventListener(type, event => {
    if (startupReady) handler(event);
  });
  bind(source, 'input',() => clear('Input changed. Preview again to create a fresh receipt.'));
  bind(mode, 'change',() => clear('Proposed correction changed. Preview again before exporting.'));
  bind($('preview'), 'click',preview);
  bind($('undo'), 'click',() => {
    if (!active) return;
    const baseline = active.before;
    active = null;
    renderTable(baseline,$('before')); renderTable(baseline,$('after'));
    $('metrics').replaceChildren(...[[0,'data-cell context changes'],[0,'label-role changes'],[baseline.rows.length * baseline.rows[0].length,'cell texts preserved']].map(([count,label]) => {
      const metric = element('div',undefined,'metric'); metric.append(element('strong',String(count)),element('span',label)); return metric;
    }));
    $('contexts').replaceChildren(element('p','Original context restored. No correction is active.','small'));
    $('roles').replaceChildren(element('p','Original cell roles restored, including any existing row headers.','small'));
    $('result-badge').textContent = 'Original restored';
    $('html-download').disabled = $('receipt-download').disabled = $('undo').disabled = true;
    say('Preview undone. Both tables now show the exact original structure. Your input is unchanged. Preview again to redo.');
    $('preview').focus();
  });
  bind($('example'), 'click',() => {source.value = WORKSHOP;mode.value='add';clear('Synthetic workshop loaded. Preview to compare the proposed row-header correction.');});
  bind($('refused'), 'click',() => {source.value=MERGED;mode.value='add';clear('Merged-header example loaded. Preview to see why this structure is refused.');});
  bind($('html-download'), 'click',() => download('html'));
  bind($('receipt-download'), 'click',() => download('json'));
  // Do not overwrite text entered while the core was loading.
  if (!source.value) source.value = WORKSHOP;
  say('Ready. Preview the synthetic example, or paste your own supported table.');
  $('preview').disabled = false;
  startupReady = true;
}
if (typeof document !== 'undefined') {
  import('./core.mjs').then(initialize).catch(() => {
    startupReady = false;
    for (const id of ['preview','undo','example','refused','html-download','receipt-download']) {
      const control = document.getElementById(id);
      if (control) control.disabled = true;
    }
    const status = document.getElementById('status');
    status.textContent = 'The local comparison engine could not load. Reload to try again. No preview or export is available; your input has not been sent anywhere.';
    status.className = 'error';
  });
}
