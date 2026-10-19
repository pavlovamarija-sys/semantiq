# Documents workspace reference inventory

Reference file: `images/EU-Acquis-Dokumentenübersicht mit Vorschau.png`
Reference canvas: 1680 × 945 px.

## Global composition

| Region | Bounds | Notes |
|---|---:|---|
| Sidebar | x 0–224 | Dark navy, full height, 1 px right divider |
| Library | x 225–803 | White, 579 px, vertical divider at right |
| Workspace | x 804–1679 | Pale blue-gray background |
| Preview/info content split | x 824–1656 | Preview x 824–1411; info x 1420–1656 |

## Sidebar

- Brand at x 20, y 21: EU circle mark and “EU Acquis AI”, white, approximately 20 px.
- Navigation begins y 87; each item is approximately 48 px high.
- Order: Documents, Translation, Terminology, Translation Memory, Projects, Reports, Settings.
- Documents is active: blue rounded rectangle x 9–215, blue gradient, white file icon and label.
- Inactive labels are white/light blue with white outline icons.
- Help & Support sits at x 22, y 826.
- Account footer begins y 867 with circular “MP” avatar, Marija Pavlova and chevron.

## Library

- Header x 246 y 23. “Documents” is Georgia-like, 32 px, dark navy.
- Subtitle y 62: 16 px muted blue-gray.
- Upload button x 656 y 21, 130 × 45 px, blue, 8 px radius, white plus and “Upload”.
- Search x 247 y 92, 488 × 42 px; filter icon button x 749, 38 × 42 px.
- Status pills y 149: All, To translate, In progress, Translated. Blue active All; counts in small circular capsules.
- Filter row y 199: Document type, Year, Legal area, Language, then right-aligned Clear.
- Table header y 251–283: checkbox, Title, Number, Date, Status; small sort chevrons.
- Rows y 286–883: 10 rows, approximately 58 px each, 1 px separators.
- Selected row: pale blue fill, blue left edge, checked blue square.
- Row columns: file icon, two-line title, CELEX number, date, status badge, vertical three-dot menu.
- Footer y 883–944: “Showing 1–10 of 103” and pagination 1, 2, 3, 4, 5, …, 11 with previous/next buttons.

## Selected-document header and toolbar

- Workspace card x 819 y 22 to x 1657 y 223, white, 10 px radius, thin #e0e8f1 border.
- Document icon x 844 y 56, blue outline file, approximately 38 × 42 px.
- Title x 904 y 47: “Directive 2006/114/EC”, serif, approximately 31 px, bold.
- Subtitle x 904 y 84: “on misleading and comparative advertising”, serif, approximately 18 px.
- Metadata chips y 118: Directive, 32006L0114, 12 December 2006, 17 pages. Each has its own outline icon, 1 px border, 6 px radius, 13 px text.
- Status badge x 1468 y 45: green check, pale green background, “To translate”.
- Header overflow x 1603 y 45, 38 × 36 px, border and three-dot/chevron affordance.
- Toolbar y 167–209: Translate, View/Download MK1, Regenerate MK1, Generate DOCX, Trados package, overflow menu.
- Translate is blue primary; remaining buttons white with gray border. Buttons have 13–14 px labels, 40–42 px height, 6 px radius, left icons.
- Tabs y 224–282: Preview, Metadata, Files, Translation Status, History, Related Documents. 15–16 px labels; Preview active blue with 2 px underline.

## Preview and right information panel

- Preview card begins x 824 y 288, pale gray #f1f5f9, 8 px radius.
- Preview toolbar height approximately 55 px: previous, page input “1”, “/ 17”, search/zoom, minus, “100%”, plus, fullscreen, rotate, download, expand.
- PDF page is centered inside a white page frame x 835–1393; it is not stretched to the whole workspace.
- Information panel x 1420–1656, white, 236 px wide, separated by a vertical divider.
- Information/Notes tabs at y 304; Information active blue underline.
- Metadata labels are muted, approximately 12 px; values approximately 13–14 px with 15–18 px vertical row gaps.
- Fields in order: Document number, Title, Date, Type, Pages, Language, Legal area, Status, Added, Last modified, Source.
- Tags section follows with Add tag button and rounded chips.

## Current captured implementation differences before this audit

- Real Supabase data makes the selected title and row count differ from the illustrative reference; this is intentional.
- The existing capture was physical 1936 × 1048 and included browser chrome, not a 1680 × 945 page-only capture.
- The library and sidebar widths were close, but the header card and toolbar were initially inset differently.
- The current data model does not provide all illustrative metadata fields such as legal area, page count, source publisher, tags or last-modified date; these must remain data-driven and cannot be invented.
- The current source PDF is displayed through the native browser PDF viewer, so its internal page typography is renderer-controlled.
