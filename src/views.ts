export type View = { name: string; url: string; slot: number };
export const storageKey = "selected-view-url";
export const sortKeyStorageKey = "issue-sort-key";
export const hideDoneStorageKey = "hide-done-issues";
export function viewSlug(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "linear.app" || url.username || url.password)
    throw new Error("Use an https://linear.app/ URL.");
  const match = url.pathname.match(/^\/[^/]+\/view\/([^/]+)\/?$/);
  if (!match) throw new Error("Use a saved Linear custom View URL.");
  if (url.search) throw new Error("Save temporary filters in Linear and use the saved View URL.");
  return decodeURIComponent(match[1]);
}
export function configuredViews(preferences: Record<string, string>) {
  const views: View[] = [];
  const errors: string[] = [];
  for (let slot = 1; slot <= 8; slot++) {
    const name = preferences[`view${slot}Name`]?.trim();
    const url = preferences[`view${slot}Url`]?.trim();
    if (!name && !url) continue;
    try {
      if (!name || !url) throw new Error();
      viewSlug(url);
      views.push({ name, url: new URL(url).href, slot });
    } catch {
      errors.push(`Check View ${slot}: enter a name and a saved Linear View URL without temporary filters.`);
    }
  }
  return { views, errors };
}
export function currentView(views: View[], selected: string | undefined, defaultSlot: string) {
  return (
    views.find((view) => view.url === selected) ?? views.find((view) => view.slot === Number(defaultSlot)) ?? views[0]
  );
}
