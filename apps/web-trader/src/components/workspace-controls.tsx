"use client";
import { useEffect, useState } from "react";
import type { WorkspaceControls as Controls } from "@/lib/use-workspaces";
import { message } from "@/lib/api";
import { notify } from "@/lib/notifications";
import { Icon } from "./icons";
type Action = "new" | "rename" | "duplicate" | "delete" | "reset";
export function WorkspaceControls({ controls }: { controls: Controls }) {
  const [menu, setMenu] = useState(false);
  const [action, setAction] = useState<Action>();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const open = (value: Action) => {
    setMenu(false);
    setAction(value);
    setName(
      value === "rename"
        ? controls.workspace?.name || ""
        : value === "duplicate"
          ? `${controls.workspace?.name || "Workspace"} copy`
          : "New workspace",
    );
    setError("");
  };
  useEffect(() => {
    const handler = () => open("new");
    window.addEventListener("azuriya:new-workspace", handler);
    return () => window.removeEventListener("azuriya:new-workspace", handler);
  }, [controls.workspace?.name]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setMenu(false);
        setAction(undefined);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [pending]);
  return (
    <div className="workspace-controls">
      <Icon name="grid" size={15} />
      <select
        aria-label="Workspace"
        value={controls.workspace?.id || ""}
        onChange={(event) => void controls.switchWorkspace(event.target.value)}
      >
        {controls.list.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <span
        className={`save-state ${controls.error ? "negative" : ""}`}
        title={controls.error || "Workspace settings are saved to your account"}
      >
        {controls.error
          ? "Save failed"
          : controls.saving
            ? "Saving…"
            : controls.dirty
              ? "Unsaved"
              : "Saved"}
      </span>
      <button
        className="icon-button"
        aria-label="Save workspace"
        title="Save workspace now"
        disabled={controls.saving}
        onClick={() =>
          void controls
            .save()
            .then(() => notify("Workspace saved."))
            .catch((error) => notify(message(error), "error"))
        }
      >
        <Icon name="save" size={15} />
      </button>
      <button
        className="icon-button"
        aria-label="Workspace menu"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        <Icon name="chevron" size={14} />
      </button>
      {menu && (
        <div className="workspace-menu">
          {(["new", "rename", "duplicate", "reset", "delete"] as Action[]).map(
            (value) => (
              <button key={value} onClick={() => open(value)}>
                {value[0].toUpperCase() + value.slice(1)} workspace
              </button>
            ),
          )}
        </div>
      )}
      {action && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-dialog-title"
          >
            <div className="dialog-heading">
              <h2 id="workspace-dialog-title">
                {action[0].toUpperCase() + action.slice(1)} workspace
              </h2>
              <button
                className="icon-button"
                aria-label="Close workspace dialog"
                onClick={() => setAction(undefined)}
                disabled={pending}
              >
                <Icon name="close" />
              </button>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setPending(true);
                setError("");
                try {
                  await controls.change(action, name.trim());
                  setAction(undefined);
                } catch (failure) {
                  setError(message(failure));
                } finally {
                  setPending(false);
                }
              }}
            >
              {action === "delete" || action === "reset" ? (
                <p className="muted">
                  {action === "delete"
                    ? "Remove this workspace's saved layout and preferences? Your positions and orders remain in your account. A usable workspace is always retained."
                    : "Restore this workspace's default layout, chart settings, and watchlist?"}
                </p>
              ) : (
                <label>
                  Workspace name
                  <input
                    autoFocus
                    aria-label="Workspace name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
              )}
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAction(undefined)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={pending}>
                  {pending
                    ? "Saving…"
                    : action === "delete"
                      ? "Delete workspace"
                      : action === "reset"
                        ? "Reset workspace"
                        : "Save workspace"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
