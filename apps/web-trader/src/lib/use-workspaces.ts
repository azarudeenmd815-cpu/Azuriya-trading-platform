"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "@azuriya/api-types";
import { api, message, post } from "./api";
import { useTerminal } from "./store";
import { configFromWorkspace, defaultWorkspaceConfig } from "./workspace-model";
import { notify } from "./notifications";
export function useWorkspaces(userId?: string) {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["workspaces", userId],
    queryFn: () => api<Workspace[]>("/workspaces"),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const workspace = useTerminal((state) => state.workspace);
  const version = useTerminal((state) => state.configVersion);
  const saved = useTerminal((state) => state.savedVersion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Promise<void> | undefined>(undefined);
  const remember = useCallback(
    (item: Workspace) => {
      useTerminal.getState().loadWorkspace(item);
      if (userId) localStorage.setItem(`azuriya:workspace:${userId}`, item.id);
    },
    [userId],
  );
  useEffect(() => {
    if (!userId || !list.data?.length || workspace) return;
    const preferred = localStorage.getItem(`azuriya:workspace:${userId}`);
    remember(list.data.find((item) => item.id === preferred) || list.data[0]);
  }, [userId, list.data, workspace, remember]);
  const save = useCallback(async () => {
    if (pending.current) await pending.current;
    const state = useTerminal.getState();
    if (!state.workspace || state.configVersion === state.savedVersion) return;
    const current = state.workspace,
      savingVersion = state.configVersion;
    setSaving(true);
    setError("");
    const operation = (async () => {
      try {
        const result = await api<Workspace>(`/workspaces/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...state.config, revision: current.revision }),
        });
        useTerminal.getState().saveAcknowledged(result, savingVersion);
        client.setQueryData<Workspace[]>(["workspaces", userId], (previous) =>
          previous?.map((item) => (item.id === result.id ? result : item)),
        );
      } catch (failure) {
        setError(message(failure));
        throw failure;
      } finally {
        setSaving(false);
        pending.current = undefined;
      }
    })();
    pending.current = operation;
    return operation;
  }, [client, userId]);
  useEffect(() => {
    if (!workspace || version === saved) return;
    const timer = setTimeout(() => {
      void save().catch(() => undefined);
    }, 650);
    return () => clearTimeout(timer);
  }, [workspace?.id, version, saved, save]);
  const refresh = async (selectId?: string) => {
    const data = await list.refetch();
    if (data.data?.length)
      remember(data.data.find((item) => item.id === selectId) || data.data[0]);
  };
  const switchWorkspace = async (id: string) => {
    try {
      await save();
      const item = await api<Workspace>(`/workspaces/${id}`);
      remember(item);
      setError("");
    } catch (failure) {
      notify(message(failure), "error");
    }
  };
  const change = async (
    action: "new" | "rename" | "duplicate" | "delete" | "reset",
    name?: string,
  ) => {
    await save();
    const current = useTerminal.getState().workspace;
    let result: Workspace | undefined;
    if (action === "new")
      result = await post<Workspace>("/workspaces", {
        ...defaultWorkspaceConfig(),
        selected_account: useTerminal.getState().accountId,
        name,
      });
    else if (current && action === "duplicate")
      result = await post<Workspace>(`/workspaces/${current.id}/duplicate`, {
        name,
      });
    else if (current && action === "rename")
      result = await api<Workspace>(`/workspaces/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, revision: current.revision }),
      });
    else if (current && action === "reset")
      result = await post<Workspace>(`/workspaces/${current.id}/reset`, {});
    else if (current && action === "delete")
      await api<void>(`/workspaces/${current.id}`, { method: "DELETE" });
    if (result) remember(result);
    await refresh(result?.id);
    notify(
      action === "delete"
        ? "Workspace deleted. A usable workspace remains available."
        : `Workspace ${action === "new" ? "created" : action === "reset" ? "reset" : action === "rename" ? "renamed" : "duplicated"}.`,
    );
  };
  return {
    list,
    workspace,
    saving,
    dirty: version !== saved,
    error: error || (list.error ? message(list.error) : ""),
    save,
    switchWorkspace,
    change,
  };
}
export type WorkspaceControls = ReturnType<typeof useWorkspaces>;
