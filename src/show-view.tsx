import {
  Action,
  ActionPanel,
  Color,
  Detail,
  getPreferenceValues,
  Icon,
  launchCommand,
  LaunchProps,
  LaunchType,
  List,
  LocalStorage,
  openExtensionPreferences,
  showToast,
  Toast,
  Keyboard,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import {
  fetchTeamStates,
  fetchView,
  Issue,
  updateIssueDueDate,
  updateIssueState,
  ViewResult,
  WorkflowState,
} from "./linear-client";
import { configuredViews, currentView, hideDoneStorageKey, sortKeyStorageKey, storageKey } from "./views";
function toTimelessDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function SettingsAction() {
  return <Action title="Configure Linear Views" icon={Icon.Gear} onAction={openExtensionPreferences} />;
}
type SortKey = "manual" | "dueDate" | "status" | "priority" | "title";
const SORT_OPTIONS: { key: SortKey; title: string }[] = [
  { key: "manual", title: "View Order" },
  { key: "dueDate", title: "Due Date" },
  { key: "status", title: "Status" },
  { key: "priority", title: "Priority" },
  { key: "title", title: "Title" },
];
// Workflow stage order, earliest-to-latest, so "Sort by Status" reads like a pipeline.
const STATUS_RANK: Record<string, number> = {
  triage: 0,
  backlog: 1,
  unstarted: 2,
  started: 3,
  completed: 4,
  canceled: 5,
};
const DONE_STATE_TYPES = new Set(["completed", "canceled"]);
function compareIssues(a: Issue, b: Issue, sortKey: SortKey): number {
  switch (sortKey) {
    case "dueDate":
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    case "status":
      return (STATUS_RANK[a.state.type] ?? 99) - (STATUS_RANK[b.state.type] ?? 99);
    case "priority": {
      // No priority (0) sorts last, not first.
      const rank = (issue: Issue) => (issue.priority === 0 ? 99 : issue.priority);
      return rank(a) - rank(b);
    }
    case "title":
      return a.title.localeCompare(b.title);
    default:
      return 0;
  }
}
function SortAndFilterActions({
  sortKey,
  setSortKey,
  hideDone,
  setHideDone,
}: {
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  hideDone: boolean;
  setHideDone: (value: boolean) => void;
}) {
  return (
    <ActionPanel.Section title="Sort & Filter">
      <ActionPanel.Submenu title="Sort by" icon={Icon.ArrowUp}>
        {SORT_OPTIONS.map((option) => (
          <Action
            key={option.key}
            title={option.title}
            icon={sortKey === option.key ? Icon.Checkmark : Icon.Circle}
            onAction={() => setSortKey(option.key)}
          />
        ))}
      </ActionPanel.Submenu>
      <Action
        title={hideDone ? "Show Completed & Canceled" : "Hide Completed & Canceled"}
        icon={hideDone ? Icon.Eye : Icon.EyeDisabled}
        onAction={() => setHideDone(!hideDone)}
      />
    </ActionPanel.Section>
  );
}
function IssueDetails({
  issue,
  apiKey,
  onUpdate,
}: {
  issue: Issue;
  apiKey: string;
  onUpdate: (updated: Pick<Issue, "id" | "state" | "dueDate">) => void;
}) {
  const [current, setCurrent] = useState(issue);
  const [states, setStates] = useState<WorkflowState[]>();
  const [statesError, setStatesError] = useState<string>();
  const [updating, setUpdating] = useState(false);
  async function loadStates() {
    if (states || statesError) return; // Fetched once per detail view; the list opens a fresh one anyway.
    try {
      setStates(await fetchTeamStates(current.team.id, apiKey, new AbortController().signal));
    } catch (error) {
      setStatesError(error instanceof Error ? error.message : "Could not load statuses.");
    }
  }
  async function changeState(state: WorkflowState) {
    if (state.id === current.state.id) return;
    setUpdating(true);
    try {
      const updatedState = await updateIssueState(current.id, state.id, apiKey, new AbortController().signal);
      const updated = { ...current, state: updatedState };
      setCurrent(updated);
      onUpdate(updated);
      await showToast({ style: Toast.Style.Success, title: `Status Set to ${updatedState.name}` });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could Not Update Status",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUpdating(false);
    }
  }
  async function changeDueDate(date: Date | null) {
    setUpdating(true);
    try {
      const dueDate = date ? toTimelessDate(date) : null;
      const updatedDueDate = await updateIssueDueDate(current.id, dueDate, apiKey, new AbortController().signal);
      const updated = { ...current, dueDate: updatedDueDate };
      setCurrent(updated);
      onUpdate(updated);
      await showToast({
        style: Toast.Style.Success,
        title: updatedDueDate ? `Due Date Set to ${updatedDueDate}` : "Due Date Cleared",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could Not Update Due Date",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUpdating(false);
    }
  }
  return (
    <Detail
      isLoading={updating}
      navigationTitle={current.identifier}
      markdown={`# ${current.identifier}: ${current.title}\n\n${current.description || "No description."}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={current.state.name} />
          <Detail.Metadata.Label title="Priority" text={current.priorityLabel} />
          <Detail.Metadata.Label title="Due" text={current.dueDate ?? "No due date"} />
          <Detail.Metadata.Label title="Assignee" text={current.assignee?.name ?? "Unassigned"} />
          <Detail.Metadata.Label title="Project" text={current.project?.name ?? "No project"} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open Issue in Browser" url={current.url} />
          <Action.CopyToClipboard
            title="Copy Issue Link"
            content={current.url}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
          <ActionPanel.Section title="Edit">
            <ActionPanel.Submenu title="Change Status…" icon={Icon.CircleFilled} onOpen={loadStates}>
              {statesError && <Action title={statesError} icon={Icon.ExclamationMark} />}
              {!states && !statesError && <Action title="Loading Statuses…" icon={Icon.CircleProgress} />}
              {states?.map((state) => (
                <Action
                  key={state.id}
                  title={state.name}
                  icon={{
                    source: state.id === current.state.id ? Icon.CheckCircle : Icon.Circle,
                    tintColor: state.color,
                  }}
                  onAction={() => changeState(state)}
                />
              ))}
            </ActionPanel.Submenu>
            <Action.PickDate title="Set Due Date…" type={Action.PickDate.Type.Date} onChange={changeDueDate} />
            {current.dueDate && (
              <Action title="Clear Due Date" icon={Icon.XMarkCircle} onAction={() => changeDueDate(null)} />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
export default function Command({ launchContext }: LaunchProps<{ launchContext: { viewUrl?: string } }>) {
  const preferences = getPreferenceValues<Record<string, string>>();
  const { views, errors } = configuredViews(preferences);
  const [selected, setSelected] = useState(launchContext?.viewUrl);
  const [selectionLoading, setSelectionLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [request, setRequest] = useState<{ url: string; result?: ViewResult; error?: string }>();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [hideDone, setHideDone] = useState(false);
  const selectionVersion = useRef(0);
  const selectionWrites = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    LocalStorage.getItem<string>(storageKey)
      .then((value) => {
        if (active) setSelected(launchContext?.viewUrl ?? value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSelectionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [launchContext?.viewUrl]);
  useEffect(() => {
    let active = true;
    Promise.all([LocalStorage.getItem<string>(sortKeyStorageKey), LocalStorage.getItem<string>(hideDoneStorageKey)])
      .then(([storedSortKey, storedHideDone]) => {
        if (!active) return;
        if (SORT_OPTIONS.some((option) => option.key === storedSortKey)) setSortKey(storedSortKey as SortKey);
        if (storedHideDone !== undefined) setHideDone(storedHideDone === "true");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  function changeSortKey(value: SortKey) {
    setSortKey(value);
    LocalStorage.setItem(sortKeyStorageKey, value).catch(() => undefined);
  }
  function changeHideDone(value: boolean) {
    setHideDone(value);
    LocalStorage.setItem(hideDoneStorageKey, String(value)).catch(() => undefined);
  }
  // Reflects an edit made in the detail view back into the list, so popping
  // back shows the new status/due date without a full refetch.
  function updateIssueInPlace(updated: Pick<Issue, "id" | "state" | "dueDate">) {
    setRequest((prev) => {
      if (!prev?.result) return prev;
      return {
        ...prev,
        result: {
          ...prev.result,
          issues: prev.result.issues.map((issue) => (issue.id === updated.id ? { ...issue, ...updated } : issue)),
        },
      };
    });
  }
  const current = currentView(views, selected, preferences.defaultView);
  const url = current?.url;
  const apiKey = preferences.apiKey?.trim();
  useEffect(() => {
    if (selectionLoading || !url || !apiKey) return;
    const controller = new AbortController();
    setLoading(true);
    setRequest(undefined);
    fetchView(url, apiKey, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRequest({ url, result });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setRequest({
            url,
            error: error instanceof Error ? error.message : "Could not reach Linear. Try refreshing.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, apiKey, refresh, selectionLoading]);
  async function switchView(value: string) {
    if (selectionLoading || value === current?.url) return;
    const version = ++selectionVersion.current;
    setSelected(value);
    setSearch("");
    try {
      selectionWrites.current = selectionWrites.current
        .catch(() => undefined)
        .then(() => LocalStorage.setItem(storageKey, value));
      await selectionWrites.current;
      if (version === selectionVersion.current)
        await launchCommand({ name: "linear-views", type: LaunchType.Background });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Could not update the menu bar" });
    }
  }
  if (!views.length)
    return (
      <Detail
        markdown={`# Configure your views\n\n${errors.join("\n\n") || "Add a name and URL for at least one Linear issue view in preferences."}`}
        actions={
          <ActionPanel>
            <SettingsAction />
          </ActionPanel>
        }
      />
    );
  if (!apiKey)
    return (
      <Detail
        markdown={
          "# Connect Linear\n\nAdd a **Linear API Key** in this extension’s preferences to see your views’ tasks here.\n\nCreate a personal key in Linear → Settings → Security & access. A key with read access to the teams in your views is enough.\n\nYour saved views are ready. After saving the key, reopen **Show Linear View**."
        }
        actions={
          <ActionPanel>
            <SettingsAction />
          </ActionPanel>
        }
      />
    );
  const visibleRequest = request?.url === url ? request : undefined;
  const result = visibleRequest?.result;
  const query = search.trim().toLocaleLowerCase();
  const issues = (result?.issues ?? [])
    .filter((issue) => !hideDone || !DONE_STATE_TYPES.has(issue.state.type))
    .filter((issue) =>
      [issue.identifier, issue.title, issue.state.name, issue.project?.name, issue.assignee?.name].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      ),
    )
    .sort((a, b) => compareIssues(a, b, sortKey));
  const actions = (
    <ActionPanel>
      <Action
        title="Refresh View"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={() => setRefresh((value) => value + 1)}
      />
      <SortAndFilterActions
        sortKey={sortKey}
        setSortKey={changeSortKey}
        hideDone={hideDone}
        setHideDone={changeHideDone}
      />
      <SettingsAction />
    </ActionPanel>
  );
  return (
    <List
      navigationTitle={result ? `${result.name} · ${issues.length} issues` : current?.name}
      isLoading={selectionLoading || loading}
      searchBarPlaceholder="Search all issues in this view…"
      searchText={search}
      onSearchTextChange={setSearch}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown tooltip="Linear View" value={current?.url} onChange={switchView}>
          {views.map((view) => (
            <List.Dropdown.Item key={view.slot} value={view.url} title={view.name} />
          ))}
        </List.Dropdown>
      }
      actions={actions}
    >
      <List.EmptyView
        title={
          visibleRequest?.error
            ? "Unable to Load View"
            : loading || selectionLoading
              ? "Loading View…"
              : query
                ? "No Matching Issues"
                : "No Issues in This View"
        }
        description={
          visibleRequest?.error ?? (query ? "Try another title, identifier, status, project, or assignee." : undefined)
        }
        icon={visibleRequest?.error ? Icon.ExclamationMark : Icon.List}
        actions={actions}
      />
      {issues.map((issue) => (
        <List.Item
          key={issue.id}
          title={issue.title}
          subtitle={issue.identifier}
          icon={{ source: Icon.CircleFilled, tintColor: issue.state.color || Color.SecondaryText }}
          accessories={[
            { text: issue.state.name },
            ...(issue.dueDate ? [{ text: issue.dueDate, tooltip: "Due date" }] : []),
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Show Issue Details"
                icon={Icon.Document}
                target={<IssueDetails issue={issue} apiKey={apiKey} onUpdate={updateIssueInPlace} />}
              />
              <Action
                title="Refresh View"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={() => setRefresh((value) => value + 1)}
              />
              <Action.CopyToClipboard title="Copy Issue Link" content={issue.url} />
              <Action.OpenInBrowser
                title="Open Issue in Browser"
                url={issue.url}
                shortcut={Keyboard.Shortcut.Common.Open}
              />
              <SortAndFilterActions
                sortKey={sortKey}
                setSortKey={changeSortKey}
                hideDone={hideDone}
                setHideDone={changeHideDone}
              />
              <SettingsAction />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
