import { viewSlug } from "./views";
export type Issue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  dueDate: string | null;
  priority: number;
  priorityLabel: string;
  state: { name: string; color: string; type: string };
  assignee: { name: string } | null;
  project: { name: string } | null;
};
export type ViewResult = { id: string; name: string; issues: Issue[] };
export const viewQuery = `query LinearViewIssues($id: String!, $after: String) {
  customView(id: $id) {
    id name modelName
    issues(first: 100, after: $after) {
      nodes {
        id identifier title description url dueDate priority priorityLabel
        state { name color type }
        assignee { name }
        project { name }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
type Page = {
  customView: {
    id: string;
    name: string;
    modelName: string;
    issues: { nodes: Issue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  };
};
// Fetch every page so search covers the whole view. Never present a partial result as a complete view.
export async function fetchView(url: string, apiKey: string, signal: AbortSignal): Promise<ViewResult> {
  const id = viewSlug(url);
  if (!apiKey.trim()) throw new Error("Add your Linear API Key in extension preferences.");
  const issues = new Map<string, Issue>();
  const seenCursors = new Set<string>();
  let after: string | null = null;
  let result: ViewResult | undefined;
  do {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey.trim() },
      body: JSON.stringify({ query: viewQuery, variables: { id, after } }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error("Linear rejected this API key. Check the key and its workspace access in preferences.");
    if (response.status === 429) throw new Error("Linear is rate limiting requests. Wait a moment, then refresh.");
    if (!response.ok) throw new Error(`Linear returned HTTP ${response.status}. Try refreshing.`);
    const body = (await response.json()) as { data?: Page; errors?: { extensions?: { code?: string } }[] };
    if (body.errors?.length) {
      const authError = body.errors.some((error) => /AUTHENTICAT|FORBIDDEN/i.test(error.extensions?.code ?? ""));
      throw new Error(
        authError
          ? "Linear rejected this API key. Check the key and its access in preferences."
          : "Linear could not read this view. Check the View URL and that this key can access it.",
      );
    }
    const view = body.data?.customView;
    if (!view?.issues?.nodes || !view.issues.pageInfo)
      throw new Error("Linear returned an incomplete response. Refresh to try again.");
    if (view.modelName !== "Issue") throw new Error("This is not an issue view. Configure a Linear issue View URL.");
    result = { id: view.id, name: view.name, issues: [] };
    for (const issue of view.issues.nodes) issues.set(issue.id, issue);
    if (!view.issues.pageInfo.hasNextPage) break;
    after = view.issues.pageInfo.endCursor;
    if (!after || seenCursors.has(after)) throw new Error("Linear pagination did not advance. Refresh to try again.");
    seenCursors.add(after);
  } while (!signal.aborted);
  signal.throwIfAborted();
  if (!result) throw new Error("Unable to load the view.");
  return { ...result, issues: [...issues.values()] };
}
