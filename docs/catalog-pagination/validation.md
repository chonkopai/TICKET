# Complete catalogue with priority matching and numbered pagination

Implemented locally; not pushed or deployed in this task.

- The homepage requests one combined, paginated catalogue: all filter matches first, then the remaining published events ordered by startsAt, with a stable ID tie-breaker. No duplicate events occur when crossing between the two groups or switching pages.
- Default sorting is Soonest first. Visitors can still select popularity or newest for the matching group; the nonmatching tail always remains chronological.
- All countries shows every returned event as a normal grid card. The previous first-six featured-carousel extraction could make a small catalogue look incomplete, so catalogue events are no longer removed from the grid.
- 18 cards per page with numbered pages, previous/next controls, URL state, out-of-range page handling and page-one reset on filter/country changes.
- Matching count and combined pagination total are distinct. Other events are explicitly labelled. Other API consumers keep strict filtering unless they opt into includeRemaining.

Validation: 24 tests across 4 API test files passed using a disposable migrated local database, including priority ordering, multiple filters, zero matches, all-country completeness, cross-group pagination and existing public visibility/localization/inventory/pagination behavior. Web/API typechecks, focused lint and whitespace checks pass.

Visual QA used actual homepage, country picker and pager components with 25 isolated test events. Verified 18 cards on page 1, seven on page 2, disabled Next on the final page, resetting from page 2 to page 1 by selecting All countries, and no horizontal overflow at 390px. Screenshot uses test data. Staging was not changed.
