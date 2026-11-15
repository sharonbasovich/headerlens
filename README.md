# HeaderLens

A small authoring aid for comparing explicit header context before and after a row-header correction in a simple HTML table.

**[Try the live demo](https://sharonbasovich.github.io/headerlens/)**. The synthetic workshop is ready to use: select **Preview correction**, compare the 4 data-cell context changes and 2 label-role changes while all 9 cell texts stay intact, then use **Undo preview** or download a correction receipt. No account or build step is needed for the hosted demo.

## Why this exists

Editing table headers and inspecting their associations are already supported by established tools. HeaderLens focuses on a narrower task: an understandable, reversible change receipt that separates changed cell roles from changed context for retained data cells, while checking that cell text and order are preserved. This is a workflow hypothesis, not a claim of unique technology or measured user benefit.

## Supported model

Rectangular text-only tables with one explicit top column-header row and optional first-column row headers. The corner remains a column header. Merged cells, multi-level headers, nested or rich content, custom ID/headers associations and structural overrides are outside the supported model and must be refused rather than silently normalized.

“Explicit header context” is this app's supported model. It is not browser-computed accessibility output or screen-reader speech. HTML can have implicit associations that this tool does not model. This is not a WCAG certification or comprehensive accessibility checker.

## Privacy and safety

The static app has no account, analytics, server storage or network submission. Imported table text is processed locally and rendered as text rather than executable markup. Export is an author-reviewed proposal, not an automated compliance verdict. Keep a copy of your original document.

## Development provenance

Fresh implementation started November 15, 2026 after the verified 08:00 UTC Bridge The Gap build opening. Synthetic workshop example was authored for this project. AI assistance was used for design, implementation and testing; the entrant remains responsible for the work and its claims. No human study or assistive-technology acceptance is claimed.

## Current status

Source implementation has passed 17 producer tests and an independent 638-case core review. Bounded native preview checked the synthetic correction, Undo, merged-table refusal, actual HTML/JSON downloads, visible keyboard focus and 320/390/768 px iframe layouts. These are not physical-device or screen-reader tests. Source publication, hosting, media and event submission are separate milestones.

## Run and test

Serve this directory with a static HTTP server and open index.html. No build step or dependencies are required. Run `node --test core.test.mjs` for the core suite. The import format deliberately requires well-formed closed tags, quoted attributes and XML-compatible text escapes. HTML named entities such as `&nbsp;` are not supported; use numeric character references instead.

## Prior-art references

- [W3C tables tutorial](https://www.w3.org/WAI/tutorials/tables/)
- [TinyMCE tables](https://www.tiny.cloud/docs/tinymce/latest/table/)
- [CKEditor tables](https://ckeditor.com/docs/ckeditor5/latest/features/tables/tables.html)
- [ANDI table inspection](https://www.ssa.gov/accessibility/andi/help/modules.html)

These references informed scope, not a reproduced benchmark or competitor feature-absence claim.
