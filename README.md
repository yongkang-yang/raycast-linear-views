# Linear Views

Browse the tasks in your saved Linear custom views inside Raycast.

> **Not published to the Raycast Store yet.** Install it locally — see
> [Development](#development) below (`npm install && npm run dev`). That
> command builds the extension and registers it in your local Raycast in
> dev mode; it shows up immediately and hot-reloads on further changes.

## Setup

1. In Raycast, run **Show Linear View** and select **Configure Linear Views**.
2. Enter your personal **Linear API Key** in the password field. It needs read and write access to the teams in your views (write is only used to change an issue's status, priority, assignee, project, or due date from the detail view).
3. Reopen **Show Linear View** or select a view in the menu bar.

The API key is read from Raycast preferences and sent only to `https://api.linear.app/graphql`.

## Use

- Click a view in the menu bar to open its issues in the Raycast window.
- Use the dropdown to switch between saved views. The current view is remembered and the menu bar updates.
- Search by title, identifier, status, project, or assignee.
- Press Return on an issue to read its description and metadata inside Raycast.
- From the detail view's **Edit** section (⌘K to open the action panel), **Change Status…**, **Change Priority…**, **Change Assignee…**, **Change Project…**, and **Set Due Date…** update the issue in Linear directly. Status, assignee, and project are scoped to the issue's team and fetched on first open. The list reflects the change without a refetch.
- Sort the list by due date, status, priority, or title, and toggle hiding completed/canceled issues, from the action panel's **Sort & Filter** section. Both preferences are remembered.
- Press Cmd+R to refresh the complete view.
- **Open Issue in Browser** is the default action from the detail view; **Copy Issue Link** is Cmd+C.
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

Thirteen tests cover schema validation (every query and mutation), URL handling, pagination, partial responses, repeated cursors, authentication/rate limits, cancellation, unsupported views/missing credentials, and the status/due-date/priority/assignee/project update calls.

References:
- https://linear.app/developers/graphql
- https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql
- https://developers.raycast.com/api-reference/menu-bar-commands
