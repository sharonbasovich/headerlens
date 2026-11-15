# HeaderLens core API

Fresh implementation for the opened SQHacks window. No dependencies. `core.mjs` is a pure schema engine, not an HTML parser or accessibility conformance checker.

## Supported schema

`{caption: string, rows: [[{text: string, kind: 'td'|'th', scope: null|'col'|'row'}]]}`

Table and cell objects require exactly these fields and reject accessor properties and unknown fields. Use 2–30 rows and 2–12 columns. Each text/caption is at most 500 UTF-16 code units. NUL, carriage return and unpaired surrogate code units are refused because they cannot be preserved through HTML parsing without normalization/replacement. LF and valid Unicode remain supported.

All top-row cells, including the corner, are `th scope=col`. Body first-column cells are `td` with null scope or `th scope=row`; remaining body cells are `td` with null scope. Mixed first-column row-header states are supported. This does not represent spans, multiple header levels, hidden/ARIA overrides, rich markup or explicit headers/ID relationships. The HTML importer must refuse those before conversion to schema; stripping unsupported source information and then claiming preservation is not valid.

## Exports

- `validateTable(table)`: returns `true` or throws `Error`. Never mutates.
- `proposeRowHeaders(table, enabled)`: validates and returns a fresh deep table copy, converting only body first-column roles. `enabled` must be boolean. The caller retains the original for exact Undo, including mixed original states.
- `contextForCell(table, row, col)`: zero-based coordinates. Returns explicit supported-model header objects `{row,col,text,scope}` in row-header then column-header order for a data cell. Header cells return an empty array because this API describes retained data-cell context, not header names or speech. Before conversion, first-column data cells have the top-left column header as their explicit context.
- `compareTables(before, after)`: throws if caption, dimensions or any cell text changed. Returns `{model,preservation:{unchanged:true,cellCount,rows,columns},roleChanges,contextChanges}`. Role entries contain `{row,col,text,before:{kind,scope},after:{kind,scope}}`. Context entries contain `{row,col,text,before:[header objects],after:[header objects]}`. Only cells that remain data cells appear in context changes. Identity is coordinate-based even when text duplicates.
- `exportHTML(table)`: validated escaped table-only HTML with caption, thead and tbody. All cell/caption text is escaped; only fixed validated tags/scopes are emitted.
- `exportReceipt(before,after)`: deterministic pretty JSON comparison plus final newline.
- `escapeHTML(value)`: escapes `& < > " '` for safe text insertion.
- `MODEL`: explicit-context limitation label.

Errors must clear the UI's active proposal and disable export, not leave an earlier candidate available. HTML reparse roundtrip and browser download behavior need independent importer/UI checks. Core output is not browser-computed accessibility associations, screen-reader speech or a WCAG verdict.

## Verification

`node --test core.test.mjs` passes 17 tests, including 300 seeded varied-dimension cases. Both source files pass `node --check`. Producer results are in `CORE-TEST-RESULT.txt`; independent review is separate. The synthetic workshop example yields four retained-data context changes, two role changes and nine preserved texts.
