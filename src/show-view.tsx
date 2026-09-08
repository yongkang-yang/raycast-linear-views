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
import { fetchView, Issue, ViewResult } from "./linear-client";
import { configuredViews, currentView, storageKey } from "./views";
function SettingsAction() {
  return <Action title="Configure Linear Views" icon={Icon.Gear} onAction={openExtensionPreferences} />;
}
function IssueDetails({ issue }: { issue: Issue }) {
  return (
    <Detail
      navigationTitle={issue.identifier}
      markdown={`# ${issue.identifier}: ${issue.title}\n\n${issue.description || "No description."}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={issue.state.name} />
          <Detail.Metadata.Label title="Priority" text={issue.priorityLabel} />
          <Detail.Metadata.Label title="Due" text={issue.dueDate ?? "No due date"} />
          <Detail.Metadata.Label title="Assignee" text={issue.assignee?.name ?? "Unassigned"} />
          <Detail.Metadata.Label title="Project" text={issue.project?.name ?? "No project"} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Issue Link" content={issue.url} />
          <Action.OpenInBrowser
            title="Open Issue in Browser"
            url={issue.url}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
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
  const issues = (result?.issues ?? []).filter((issue) =>
    [issue.identifier, issue.title, issue.state.name, issue.project?.name, issue.assignee?.name].some((value) =>
      value?.toLocaleLowerCase().includes(query),
    ),
  );
  const actions = (
    <ActionPanel>
      <Action
        title="Refresh View"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={() => setRefresh((value) => value + 1)}
      />
      <SettingsAction />
    </ActionPanel>
  );
  return (
    <List
      navigationTitle={result ? `${result.name} · ${result.issues.length} issues` : current?.name}
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
              <Action.Push title="Show Issue Details" icon={Icon.Document} target={<IssueDetails issue={issue} />} />
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
              <SettingsAction />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
