import {
  getPreferenceValues,
  Icon,
  launchCommand,
  LaunchType,
  LocalStorage,
  MenuBarExtra,
  openExtensionPreferences,
  showHUD,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { configuredViews, currentView, storageKey, View } from "./views";
export default function Command() {
  const preferences = getPreferenceValues<Record<string, string>>();
  const { views, errors } = configuredViews(preferences);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    LocalStorage.getItem<string>(storageKey)
      .then(setSelected)
      .catch(() => showHUD("Could not load the last view"))
      .finally(() => setLoading(false));
  }, []);
  const current = currentView(views, selected, preferences.defaultView);
  async function showView(view: View) {
    setLoading(true);
    try {
      await LocalStorage.setItem(storageKey, view.url);
      setSelected(view.url);
      await launchCommand({ name: "show-view", type: LaunchType.UserInitiated, context: { viewUrl: view.url } });
    } catch {
      await showHUD("Unable to open Linear Views");
    } finally {
      setLoading(false);
    }
  }
  return (
    <MenuBarExtra
      icon={{ source: { light: "linear-icon-dark.png", dark: "linear-icon-light.png" } }}
      title={current ? current.name : "Linear Views"}
      tooltip="View your Linear tasks in Raycast"
      isLoading={loading}
    >
      <MenuBarExtra.Section title="Views">
        {views.map((view) => (
          <MenuBarExtra.Item
            key={view.slot}
            title={view.name}
            icon={view.url === current?.url ? Icon.Checkmark : Icon.List}
            onAction={() => showView(view)}
          />
        ))}
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        {current && (
          <MenuBarExtra.Item
            title={`Show ${current.name}`}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={() => showView(current)}
          />
        )}
        <MenuBarExtra.Item title="Configure Views…" icon={Icon.Gear} onAction={openExtensionPreferences} />
      </MenuBarExtra.Section>
      {errors.map((error) => (
        <MenuBarExtra.Item key={error} title={error} icon={Icon.ExclamationMark} onAction={openExtensionPreferences} />
      ))}
    </MenuBarExtra>
  );
}
