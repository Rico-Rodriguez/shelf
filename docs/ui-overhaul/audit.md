# Shelf phone UI audit and overhaul (November 2026)

Rendered in a 390×844 web preview with sample data, light and dark, on every screen: Today, Plan, Activity, Review, Accounts, Bills, Goals, Insights, Your money, Cash flow, Investments, Merchant, Notifications, Rules, Settings, Search, the quick log sheet and the charge sheet. The web preview draws blur and safe areas a little differently from iOS.

## Findings

### Navigation and hierarchy
1. **Two headers on every tab.** Plan and Activity showed a "Shelf" wordmark bar and then a second large title under it, which cost about 100pt before any content.
2. **Net worth in the chrome.** A net worth pill sat in the header of all three tabs. It repeated Accounts and competed with the screen's own number, which is the one thing a tab should lead with.
3. **The settings button looked like a sun.** The gear glyph had eight rays and a circle, so it read as a theme toggle.
4. **Header buttons were 36pt** with no fill, below the 44pt target, and on Plan two of them rendered as empty glass circles.
5. **The tab highlight stuttered.** It animated `left` and `width` on the JS thread, so it hitched whenever a tab mounted. Tabs also had different widths, so the highlight changed size as it moved.
6. **The log button sat inside the tab bar** between tabs, so "Plan" and "Activity" weren't evenly spaced and the + read as a fourth tab.

### Layout and visual noise
7. **Cards in cards.** Heroes were bordered, shadowed cards, rows were bordered cards, and an ambient glow sat behind everything. Every surface had a border, a shadow and a radius, so nothing stood out.
8. **Section headers were small uppercase gray labels** ("LATEST ACTIVITY") with Title Case text, while Plan's group names used a different small style. Neither read as a heading.
9. **Today split two shortcuts into two full cards** ("Your money" and "10 purchases to review"), which pushed recent activity below the fold.
10. **Plan's budget tile didn't look like Today's hero** even though it shows the same number. It had an uppercase eyebrow, a pill badge, a smaller figure and a caption under it.
11. **Plan rows put a small "Left" label above the amount**, so your eye hit the label before the number.
12. **Activity put every transaction in its own bordered card** and used the big Section style for day labels.
13. **Settings gave each one-row group its own section** (Sample, Rules, Export), and the household row "Owner" had a chevron that did nothing.

### Copy
14. **Title Case and jargon:** "Latest Activity", "Committed Bills", "Where It Went", "Needs Review", "This Month", "Cash Flow", "Typical Monthly", "Next Due", "Select Category", "Create Key", "Monthly Target", "potential recurring charge".

### Empty states
15. **Rules, Goals, Notifications and an empty Activity search** showed a bare line such as "No rules yet" with no explanation. Rules had both a header "Add" and a body "Add a rule" button in the same heavy black style.

### Dark mode and contrast
16. **Insights merchant amounts and two Bills sheet labels had no color**, so they rendered black on dark cards.
17. **The dark palette was blue-gray** (#0c0e12 / #171a22), not the true black and #1c1c1e grouped surfaces iOS uses. Separators were too strong.

### Tap targets
18. Filter chips were about 30pt tall, header buttons 36pt and section actions had an 8pt hit slop. Buttons were 46pt tall.

## Design decisions

- **One header per tab.** Each tab pins one bar with its title, a small sync note when it matters, and two 36pt round buttons with a 4pt hit slop (44pt total) for notifications and settings. Page actions, such as Plan's month picker, sit in a toolbar row at the top of the content.
- **Net worth leaves the chrome.** It's the hero of Accounts and is one tap away from Your money.
- **Open heroes, Robinhood style.** The big number sits on the page background with its chart below, not inside a card. Today, Plan, Accounts, Bills, Insights and Cash flow all share that shape.
- **Flat grouped cards.** White on #f2f2f7 in light and #1c1c1e on black in dark, with an 18pt continuous radius, no borders, no shadows and hairline dividers.
- **Type scale:** 34 large title, 28 tab title, 20 bold section heading, 16 row title, 13 meta, 46 hero figure. Sheets and dated lists keep small 13pt labels through a `SmallSections` context, so one `Section` works everywhere.
- **Tab bar:** three equal tabs in a floating pill, with the highlight moving by `translateX` on the native driver. A separate 64pt round green log button sits beside it.
- **Sentence case everywhere**, with plain words: "Recent activity", "Upcoming bills", "Spending", "To review", "possible bills found", "Monthly income".
- **Empty states** show a glyph, a title, one line on what the screen is for, and the next step.

## Not changed

- Data, API calls, review outbox, flights (anchor names are unchanged) and gesture logic.
- The review deck and charge sheet internals, apart from palette and copy.
- No native modules or `app.json` changes, so the update goes out over the air.
