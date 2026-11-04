# LEE Wealth visual direction

References reviewed on 2026-11-04:

- Copilot Money product screenshots: https://www.copilot.money/ — monetary hierarchy, quiet account lists, secondary detail panels.
- Linear, “A calmer interface for a product in motion”: https://linear.app/now/behind-the-latest-design-refresh — distinguish navigation, controls and content; reduce competing visual weight.
- Monarch tracking: https://www.monarch.com/features/tracking — net worth first, grouped accounts and supporting dashboard information.

The implementation uses original CSS, not third-party assets or copied source.

## Decisions

- Blue-black canvas, cool navy card surfaces and mint as the primary action accent. Blue and green share a cool hue family; the darker canvas separates cards without a gray wash. Profit/loss retains its own green/red meaning.
- One prominent workflow in each toolbar; secondary actions retain a visible neutral surface and border. Navigation uses a quiet tab treatment instead of raised buttons.
- Net worth is the main visual anchor, with USD/AUD equivalents visible alongside the primary CNY value.
- Holdings remain two-line summaries. Names use a detail chevron and hover/focus affordance instead of a box and dotted underline around every title.
- Category totals show all three equivalent currencies, below the category title with enough room to read them.
- Consistent font weights, tabular numeric alignment, spacing and corner radii across overview, banking, stocks, history, settings and dialogs.
- Desktop rows keep compact visible edit/delete controls; mobile preserves the existing 44px action menu.
- Accounting, quotes, transfers, asset identities and historical data are unchanged.
- Daylight theme: pale blue-white canvas, white cards, dark navy text and deep green actions. Chart colors, profit/loss, forms and dialogs adapt with the same semantic roles. A visible desktop toggle and the mobile More menu switch themes; the browser remembers the choice. Unset preferences start in daylight, while explicit night preferences remain intact.

`wealth-design.css` replaces the previous `interaction-ui.css` entry point. Existing accounting and layout behavior stays in its original modules.
