# Funnel view switcher

## Goal

Present the existing funnel board and opportunities list as two views of one section.

## Experience

- Keep `/funnel` as the section URL.
- Remove Opportunities from the sidebar.
- Remove the existing Funnel page title.
- Add a Columns / List selector to the header.
- Store the selected view in the URL with the `view` search parameter.
- Keep the existing board and list layouts and their actions.
- Show open opportunities in Columns.
- Show open and closed opportunities in List.
- Redirect existing `/deals` links to the list view, preserving applicable search parameters.

## Architecture and data flow

The funnel page selects the view from the URL. Each view retains its existing data query and loading state. The server prepares data for the selected view. Client components render the prepared view and its controls. The selector changes the URL rather than duplicating view state.

## Validation

Test the default board view, the list view, view switching, and the `/deals` redirect. Check that list filters and record links retain their behavior. Verify that the sidebar contains one entry for this section. Do not run a build.
