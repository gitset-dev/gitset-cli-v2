**Repository**: `https://github.com/imprvhub/entercinema`

## Improve IMDb Rating Sort by Considering Vote Count in Watchlist and Advanced Search

### Summary
The current sorting functionality by IMDb rating (high/low) in both the Watchlist (`pages/watchlist/index.vue`) and Advanced Search (`pages/advanced-search/index.vue`) pages prioritizes the IMDb score alone, neglecting the number of votes. This can result in less popular items with fewer votes but higher scores appearing above more widely acclaimed items with lower scores but significantly more votes, leading to a suboptimal and potentially misleading user experience.

### Background and Motivation
When users sort their watchlist or advanced search results by IMDb rating (e.g., `imdb-high`, `imdb-low`), the common expectation is that items with higher overall community consensus and broader appeal will rank higher. However, the current sorting mechanism only considers the numerical IMDb score (`item.details.imdbRating`), disregarding the crucial `item.details.imdbVotes` count.

This leads to scenarios such as:
- A niche film with an IMDb rating of 7.9 based on 2,398 votes ranking higher than a critically acclaimed film with an IMDb rating of 7.3 based on 245,000 votes.
- Users may perceive the sorting as inaccurate or counter-intuitive, as highly-rated but obscure content can overshadow more popular and established titles that have a more robust backing of votes.

The motivation is to provide a more intuitive, contextually relevant, and robust sorting experience when filtering by IMDb rating. By incorporating vote count, the system can better reflect the true community consensus and popularity, ensuring that items with broader acclaim are appropriately weighted or considered, thereby improving content discoverability and aligning better with user expectations for quality and relevance.

### Detailed Description and Implementation Suggestions
The core problem lies in the IMDb sorting logic within `pages/watchlist/index.vue` and `pages/advanced-search/index.vue`, which currently only compares `item.details.imdbRating`. To address this, a decision needs to be made on how to incorporate `item.details.imdbVotes` into the sorting algorithm for `imdb-high` and `imdb-low` parameters.

**Implementation Decision Points and Suggestions:**

1.  **Option A: Maintain Current Behavior (Delegate Responsibility)**:
    *   No changes are made. The current sorting behavior is considered a direct, unweighted representation of IMDb's official scores.
    *   **Pros**: Simplicity, direct reflection of source data.
    *   **Cons**: Continues to provide potentially misleading sorting results for users, as described in the background.

2.  **Option B: Incorporate Vote Count for Improved UX (Recommended)**:
    *   Modify the sorting logic for `imdb-high` and `imdb-low` to consider both `imdbRating` and `imdbVotes`.
    *   **Recommended Approach: Weighted Score (e.g., Bayesian Average)**:
        Implement a weighted average formula similar to IMDb's own Top 250 list calculation. This formula balances high scores with high vote counts:
        `WR = (v / (v + m)) * R + (m / (v + m)) * C`
        Where:
        *   `WR` = Weighted Rating (the new score to sort by)
        *   `R` = Average rating for the item (`item.details.imdbRating`)
        *   `v` = Number of votes for the item (`item.details.imdbVotes`)
        *   `m` = Minimum votes required to be considered significant (a constant threshold, e.g., 1,000 or 5,000, to be determined).
        *   `C` = The mean vote across the entire dataset being sorted (average IMDb rating of all items in the current filtered list or a global average).
        This approach provides a more "fair" rating that prevents items with few votes from disproportionately influencing the top ranks.

    *   **Alternative Approach: Tie-breaker by Vote Count**:
        If two items have the same `imdbRating`, then sort them by `imdbVotes` (higher votes first for `imdb-high`, lower votes first for `imdb-low`). This is a simpler alternative if the Bayesian average is deemed too complex.

**Affected Files**:
-   `pages/watchlist/index.vue`: Specifically, the sorting logic within the `filteredItems` computed property or similar data processing for IMDb rating.
-   `pages/advanced-search/index.vue`: Specifically, the sorting logic applied to search results when `imdb-high` or `imdb-low` is selected.

### Expected Outcomes
-   When sorting by `imdb-high` or `imdb-low` in both the Watchlist and Advanced Search pages, the results will be more intuitively ordered, reflecting a better balance between the raw IMDb score and the number of contributing votes.
-   Highly-rated films with a significant number of votes will be more appropriately positioned relative to films with high scores but very few votes.
-   Users will perceive the IMDb rating sort as more accurate, reliable, and consistent for identifying well-regarded content.
-   The improved sorting mechanism will provide a consistent and enhanced user experience across `pages/watchlist/index.vue` and `pages/advanced-search/index.vue`.

### Acceptance Criteria
-   Navigate to the Watchlist page (`pages/watchlist/index.vue`).
-   Apply the `IMDb Rating (High to Low)` sort option.
-   Verify that popular movies with high vote counts are correctly ranked above less popular movies with fewer votes, even if the latter has a slightly higher raw IMDb score (assuming Option B with weighted scoring is implemented).
-   Specifically, confirm that a film with a rating of 7.3 and 245k votes ranks appropriately relative to a hypothetical film with a rating of 7.9 and 2k votes.
-   Repeat the sorting process using the `IMDb Rating (Low to High)` option and confirm logical ordering.
-   Navigate to the Advanced Search page (`pages/advanced-search/index.vue`).
-   Perform a search and apply the `IMDb Rating (High to Low)` / `IMDb Rating (Low to High)` sort.
-   Confirm that the improved sorting behavior is consistent with the Watchlist page.
-   Ensure that the sorting remains stable and predictable across different datasets (e.g., large watchlists, varied search results).
-   If a weighted score formula is implemented, verify that the chosen `m` (minimum votes) and `C` (mean vote) constants produce a logical and user-friendly ranking.