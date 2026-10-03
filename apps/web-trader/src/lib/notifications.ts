import { create } from "zustand";
export interface Notification {
  id: string;
  message: string;
  kind: "success" | "error" | "info";
  created: number;
}
export const useNotifications = create<{
  items: Notification[];
  dismiss: (id: string) => void;
}>((set) => ({
  items: [],
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));
let notificationSequence = 0;
export function notify(
  message: string,
  kind: Notification["kind"] = "success",
  id?: string,
) {
  const key = id || `notice-${++notificationSequence}`;
  useNotifications.setState((state) => ({
    items: [
      ...state.items.filter((item) => item.id !== key),
      { id: key, message, kind, created: Date.now() },
    ].slice(-4),
  }));
}
