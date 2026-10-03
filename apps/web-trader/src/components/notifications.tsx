"use client";
import { useEffect } from "react";
import { useNotifications } from "@/lib/notifications";
import { Icon } from "./icons";
export function Notifications() {
  const items = useNotifications((state) => state.items);
  const dismiss = useNotifications((state) => state.dismiss);
  useEffect(() => {
    const timer = setInterval(() => {
      items
        .filter((item) => Date.now() - item.created > 6000)
        .forEach((item) => dismiss(item.id));
    }, 1000);
    return () => clearInterval(timer);
  }, [items, dismiss]);
  return (
    <div className="notifications" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <div className={`toast ${item.kind}`} key={item.id}>
          <Icon name={item.kind === "success" ? "check" : "info"} size={16} />
          <span>{item.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => dismiss(item.id)}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
