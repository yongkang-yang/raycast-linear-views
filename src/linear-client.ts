import { viewSlug } from "./views";
export type NamedRef = { id: string; name: string };
export type Issue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  dueDate: string | null;
  priority: number;
  priorityLabel: string;
  state: { id: string; name: string; color: string; type: string };
  assignee: NamedRef | null;
  project: NamedRef | null;
  team: { id: string };
};
export type ViewResult = { id: string; name: string; issues: Issue[] };
export type WorkflowState = { id: string; name: string; color: string; type: string; position: number };
export const viewQuery = `query LinearViewIssues($id: String!, $after: String) {
  customView(id: $id) {
    id name modelName
    issues(first: 100, after: $after) {
      nodes {
        id identifier title description url dueDate priority priorityLabel
        state { id name color type }
        assignee { id name }
        project { id name }
        team { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
export const teamStatesQuery = `query LinearTeamStates($teamId: String!) {
  team(id: $teamId) {
    states(first: 50) {
      nodes { id name color type position }
    }
  }
}`;
export const teamMembersQuery = `query LinearTeamMembers($teamId: String!) {
  team(id: $teamId) {
    members(first: 100) {
      nodes { id name }
    }
  }
}`;
export const teamProjectsQuery = `query LinearTeamProjects($teamId: String!) {
  team(id: $teamId) {
    projects(first: 100) {
      nodes { id name }
    }
  }
}`;
export const updateIssueStateMutation = `mutation LinearUpdateIssueState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue { id state { id name color type } }
  }
}`;
export const updateIssueDueDateMutation = `mutation LinearUpdateIssueDueDate($id: String!, $dueDate: TimelessDate) {
  issueUpdate(id: $id, input: { dueDate: $dueDate }) {
    success
    issue { id dueDate }
  }
}`;
export const updateIssuePriorityMutation = `mutation LinearUpdateIssuePriority($id: String!, $priority: Int!) {
  issueUpdate(id: $id, input: { priority: $priority }) {
    success
    issue { id priority priorityLabel }
  }
}`;
export const updateIssueAssigneeMutation = `mutation LinearUpdateIssueAssignee($id: String!, $assigneeId: String) {
  issueUpdate(id: $id, input: { assigneeId: $assigneeId }) {
    success
    issue { id assignee { id name } }
  }
}`;
export const updateIssueProjectMutation = `mutation LinearUpdateIssueProject($id: String!, $projectId: String) {
  issueUpdate(id: $id, input: { projectId: $projectId }) {
    success
    issue { id project { id name } }
  }
}`;
type GraphQLResponse<T> = { data?: T; errors?: { message?: string; extensions?: { code?: string } }[] };
// Shared request plumbing: auth, HTTP status classification, and GraphQL
// error classification. Callers supply what to say when Linear returns a
// non-auth GraphQL error, since that's the one message worth being specific
// about (e.g. "could not read this view" vs "could not update this issue").
async function postGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal,
  onErrorMessage: string,
): Promise<T> {
  if (!apiKey.trim()) throw new Error("Add your Linear API Key in extension preferences.");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey.trim() },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("Linear rejected this API key. Check the key and its workspace access in preferences.");
  if (response.status === 429) throw new Error("Linear is rate limiting requests. Wait a moment, then refresh.");
  if (!response.ok) throw new Error(`Linear returned HTTP ${response.status}. Try refreshing.`);
  const body = (await response.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    const authError = body.errors.some((error) => /AUTHENTICAT|FORBIDDEN/i.test(error.extensions?.code ?? ""));
    throw new Error(
      authError ? "Linear rejected this API key. Check the key and its access in preferences." : onErrorMessage,
    );
  }
  if (!body.data) throw new Error(onErrorMessage);
  return body.data;
}
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
  const issues = new Map<string, Issue>();
  const seenCursors = new Set<string>();
  let after: string | null = null;
  let result: ViewResult | undefined;
  do {
    const data = await postGraphQL<Page>(
      viewQuery,
      { id, after },
      apiKey,
      signal,
      "Linear could not read this view. Check the View URL and that this key can access it.",
    );
    const view = data.customView;
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
// States are per-team, sorted by their position in the team's workflow.
export async function fetchTeamStates(teamId: string, apiKey: string, signal: AbortSignal): Promise<WorkflowState[]> {
  const data = await postGraphQL<{ team: { states: { nodes: WorkflowState[] } } | null }>(
    teamStatesQuery,
    { teamId },
    apiKey,
    signal,
    "Linear could not load this team's statuses. Try again.",
  );
  const states = data.team?.states.nodes ?? [];
  return [...states].sort((a, b) => a.position - b.position);
}
export async function fetchTeamMembers(teamId: string, apiKey: string, signal: AbortSignal): Promise<NamedRef[]> {
  const data = await postGraphQL<{ team: { members: { nodes: NamedRef[] } } | null }>(
    teamMembersQuery,
    { teamId },
    apiKey,
    signal,
    "Linear could not load this team's members. Try again.",
  );
  const members = data.team?.members.nodes ?? [];
  return [...members].sort((a, b) => a.name.localeCompare(b.name));
}
export async function fetchTeamProjects(teamId: string, apiKey: string, signal: AbortSignal): Promise<NamedRef[]> {
  const data = await postGraphQL<{ team: { projects: { nodes: NamedRef[] } } | null }>(
    teamProjectsQuery,
    { teamId },
    apiKey,
    signal,
    "Linear could not load this team's projects. Try again.",
  );
  const projects = data.team?.projects.nodes ?? [];
  return [...projects].sort((a, b) => a.name.localeCompare(b.name));
}
type IssueUpdatePayload<T> = { issueUpdate: { success: boolean; issue: T | null } | null };
// Shared by every issueUpdate-based mutation below: runs it and unwraps the
// nested { issueUpdate: { success, issue } } payload, treating a falsy
// `success` the same as a missing `issue` — both mean the edit didn't stick.
async function runIssueUpdate<T>(
  mutation: string,
  variables: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal,
  onErrorMessage: string,
): Promise<T> {
  const data = await postGraphQL<IssueUpdatePayload<T>>(mutation, variables, apiKey, signal, onErrorMessage);
  const issue = data.issueUpdate?.issue;
  if (!data.issueUpdate?.success || !issue) throw new Error(onErrorMessage);
  return issue;
}
export async function updateIssueState(
  issueId: string,
  stateId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Issue["state"]> {
  const issue = await runIssueUpdate<{ state: Issue["state"] }>(
    updateIssueStateMutation,
    { id: issueId, stateId },
    apiKey,
    signal,
    "Linear could not update this issue's status. Try again.",
  );
  return issue.state;
}
// `dueDate` must be an ISO date string (YYYY-MM-DD) or null to clear it.
export async function updateIssueDueDate(
  issueId: string,
  dueDate: string | null,
  apiKey: string,
  signal: AbortSignal,
): Promise<string | null> {
  const issue = await runIssueUpdate<{ dueDate: string | null }>(
    updateIssueDueDateMutation,
    { id: issueId, dueDate },
    apiKey,
    signal,
    "Linear could not update this issue's due date. Try again.",
  );
  return issue.dueDate;
}
// `priority` is 0-4 (No priority, Urgent, High, Medium, Low) — Linear's fixed set.
export async function updateIssuePriority(
  issueId: string,
  priority: number,
  apiKey: string,
  signal: AbortSignal,
): Promise<Pick<Issue, "priority" | "priorityLabel">> {
  return runIssueUpdate<Pick<Issue, "priority" | "priorityLabel">>(
    updateIssuePriorityMutation,
    { id: issueId, priority },
    apiKey,
    signal,
    "Linear could not update this issue's priority. Try again.",
  );
}
// `assigneeId` may be null to unassign.
export async function updateIssueAssignee(
  issueId: string,
  assigneeId: string | null,
  apiKey: string,
  signal: AbortSignal,
): Promise<Issue["assignee"]> {
  const issue = await runIssueUpdate<{ assignee: Issue["assignee"] }>(
    updateIssueAssigneeMutation,
    { id: issueId, assigneeId },
    apiKey,
    signal,
    "Linear could not update this issue's assignee. Try again.",
  );
  return issue.assignee;
}
// `projectId` may be null to remove the issue from its project.
export async function updateIssueProject(
  issueId: string,
  projectId: string | null,
  apiKey: string,
  signal: AbortSignal,
): Promise<Issue["project"]> {
  const issue = await runIssueUpdate<{ project: Issue["project"] }>(
    updateIssueProjectMutation,
    { id: issueId, projectId },
    apiKey,
    signal,
    "Linear could not update this issue's project. Try again.",
  );
  return issue.project;
}
