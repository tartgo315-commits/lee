# Mobile feature parity

The mobile layout uses the existing desktop handlers and ledger engines. No balance, interest calculation, sync protocol or production ledger data is replaced by this UI update.

## Entry points

| Feature | Phone entry |
| --- | --- |
| Overview, China, US, Australia, NAV history, news, FX, settings | Navigation menu |
| Add any of the six asset types | Header: Add asset |
| Search assets, accounts, pages and actions | Header: Search |
| Stock trade, transfer, cash movement, term deposit maturity | Quick action bar |
| Asset details, edit, delete | Holding card buttons |
| Quotes, daily AI analysis, ledger AI questions | More: Quotes and analysis |
| Snapshot, JSON export/import, cloud sync settings | More: Ledger and backup |
| Transaction records, in-transit funds, movement review | More: Funds workspace |
| Bulk stock import | More: Bulk US stock import |
| Theme and lock screen | More: Display and security |
| Watchlist and previously held stocks | Holdings: Unheld stocks |
| Goal, history, cash flows, scenario settings | NAV history page |

Mobile applies up to 1000 CSS pixels, including landscape phones. Native selects retain the same options as desktop controls. Tables scroll inside their own regions; dialogs keep action buttons outside the scrolling form. Visual viewport sizing accounts for reduced space when a keyboard opens.

## Validation (2026-10-26)

- Browser UI checks: 8 routes at 360x780, 390x844, 430x932, 844x390 and 1280x800; all 40 checks passed with no document horizontal overflow.
- Isolated fictional ledger: saved stock purchase, cross-currency transfer and receipt, cash expense, maturity with partial renewal, and metadata-only account rename.
- All six asset forms: visible save button and 16px inputs at 390x420.
- AI input and send button remain visible at 390x420 and landscape phone size.
- Navigation drawer, More sheet, snapshot and bulk import entry points checked through browser UI.
- Existing unit checks: movements 27, ledger assistant 18, ledger UI 10, asset editor 6, navigation 9, cloud sync 17 (87 total).

These are desktop-browser viewport simulations, not a physical iPhone/WebKit certification. Native iOS file saving, file selection and keyboard behavior still benefit from a real-device check. UI tests use fictional data and do not submit real financial transactions.
