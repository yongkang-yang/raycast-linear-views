# Linear Views

Browse the tasks in your saved Linear custom views inside Raycast.

## Setup

1. In Raycast, run **Show Linear View** and select **Configure Linear Views**.
2. Enter your personal **Linear API Key** in the password field. It needs read access to the teams in your views.
3. Reopen **Show Linear View** or select a view in the menu bar.

The API key is read from Raycast preferences and sent only to `https://api.linear.app/graphql`. The extension performs read queries.

## Use

- Click a view in the menu bar to open its issues in the Raycast window.
- Use the dropdown to switch between saved views. The current view is remembered and the menu bar updates.
- Search by title, identifier, status, project, or assignee.
- Press Return on an issue to read its description and metadata inside Raycast.
- Press Cmd+R to refresh the complete view.
- **Open Issue in Browser** is available as a separate action with Cmd+O.
- Configure up to eight name/URL pairs. Leave both fields blank to hide a slot.

Preconfigured: **Due Tomorrow**, **OverDue issues**, **ToDo** (default).

The extension calls Linear's `customView(id: slug).issues` query, so Linear applies the saved view's filters. It fetches every page before displaying a complete result. It does not reproduce Linear's board grouping or custom display ordering. URLs containing temporary query filters are rejected; save those filters in Linear and configure the saved URL.

## Development

    npm install
    npm run dev

Checks:

    npm run build
    npx tsc --noEmit
    npm run lint

To run API and URL tests, first fetch the official schema:

    mkdir -p work
    curl -fsSL https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql -o work/linear-schema.graphql
    npm test

Eight tests cover schema validation, URL handling, pagination, partial responses, repeated cursors, authentication/rate limits, cancellation, and unsupported views/missing credentials.

Validation on 2026-09-08: build, TypeScript, lint and eight tests passed. The command is installed in Raycast; the connection screen and password preference were verified in the native UI. Live issue loading, list/detail rendering with real data, and menu switching still require entering the API key and runtime verification.

References:
- https://linear.app/developers/graphql
- https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql
- https://developers.raycast.com/api-reference/menu-bar-commands
