# LEE Wealth visual direction

References reviewed on 2026-11-04:

- Copilot Money product screenshots: https://www.copilot.money/ — monetary hierarchy, quiet account lists, secondary detail panels.
- Linear, “A calmer interface for a product in motion”: https://linear.app/now/behind-the-latest-design-refresh — distinguish navigation, controls and content; reduce competing visual weight.
- Monarch tracking: https://www.monarch.com/features/tracking — net worth first, grouped accounts and supporting dashboard information.

The implementation uses original CSS, not third-party assets or copied source.

## Decisions

- Black night canvas and near-black surfaces. Neutral text has three readable levels. Blue is reserved for primary actions and selected navigation; green/red communicate financial results, amber signals attention. Secondary buttons use neutral borders; delete controls turn red on hover/focus. Category color strips are removed, while chart categories keep a limited blue/teal/violet palette.
- One prominent workflow in each toolbar; secondary actions retain a visible neutral surface and border. Navigation uses a quiet tab treatment instead of raised buttons.
- Net worth is the main visual anchor, with USD/AUD equivalents visible alongside the primary CNY value.
- Holdings remain two-line summaries. Names use a detail chevron and hover/focus affordance instead of a box and dotted underline around every title.
- Category totals show all three equivalent currencies, below the category title with enough room to read them.
- Consistent font weights, tabular numeric alignment, spacing and corner radii across overview, banking, stocks, history, settings and dialogs.
- Desktop rows keep compact visible edit/delete controls; mobile preserves the existing 44px action menu.
- Accounting, quotes, transfers, asset identities and historical data are unchanged.
- Daylight theme: neutral off-white canvas, white cards, charcoal text and blue actions. Chart colors, profit/loss, forms and dialogs adapt with the same semantic roles. A visible desktop toggle and the mobile More menu switch themes; the browser remembers the choice. Unset preferences start in daylight, while explicit night preferences remain intact.

`wealth-design.css` replaces the previous `interaction-ui.css` entry point. Existing accounting and layout behavior stays in its original modules.

## Color role review

Reviewed Carbon color roles (https://www.carbondesignsystem.com/building-blocks/foundations/color/overview) and W3C text contrast guidance (https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html). Core token pair checks cover main/secondary/muted text, controls, primary buttons, financial result badges and warnings in both themes. This is a targeted color check, not a claim of whole-site accessibility certification.
