"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Trash2, CheckCircle2, AlertCircle, Info, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type NotificationType = "info" | "success" | "warning" | "error";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}

export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    } finally {
      setLoading(false);
    }
  };

  const generateDemo = async () => {
    try {
      const res = await fetch("/api/notifications/demo", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNotifications((prev) => [data.notification, ...prev]);
      }
    } catch (err) {
      console.error("Failed to generate demo", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      );
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const markAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getTypeConfig = (type: NotificationType) => {
    switch (type) {
      case "success": return { icon: <CheckCircle2 size={16} />, colorClass: "text-rx-green", bgClass: "bg-rx-green-dim" };
      case "warning": return { icon: <AlertCircle size={16} />, colorClass: "text-rx-amber", bgClass: "bg-rx-amber-dim" };
      case "error": return { icon: <AlertCircle size={16} />, colorClass: "text-rx-red", bgClass: "bg-rx-red-dim" };
      default: return { icon: <Info size={16} />, colorClass: "text-rx-blue", bgClass: "bg-rx-blue-dim" };
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative p-2 rounded-lg hover:bg-rx-overlay text-rx-text-secondary transition-colors focus:outline-none">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rx-red animate-pulse" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 md:w-96 p-0 bg-rx-surface border border-border shadow-2xl mr-4 mt-1 rounded-xl" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-rx-text-primary text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rx-blue-dim text-rx-blue text-[10px] font-mono">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
             <button 
              onClick={generateDemo}
              title="Generate demo notification"
              className="p-1 rounded text-rx-text-muted hover:text-rx-text-secondary hover:bg-rx-overlay transition-colors"
            >
              <Zap size={14} />
            </button>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-xs font-body text-rx-blue hover:text-rx-blue/80 transition-colors flex items-center gap-1"
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-rx-overlay animate-[skeleton-pulse_2s_ease-in-out_infinite] shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-3/4 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                    <div className="h-3 w-1/2 bg-rx-overlay rounded animate-[skeleton-pulse_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center p-6 text-rx-text-muted">
              <Bell size={32} className="mb-4 opacity-20" />
              <p className="text-sm font-heading">You're all caught up</p>
              <p className="text-xs font-body mt-1 opacity-70">No new notifications right now.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => {
                const typeConfig = getTypeConfig(n.type);
                return (
                  <div 
                    key={n.id} 
                    className={cn(
                      "group flex items-start gap-3 p-4 border-b border-border/50 last:border-0 hover:bg-rx-overlay/30 transition-colors relative",
                      !n.isRead && "bg-rx-overlay/10"
                    )}
                  >
                    {!n.isRead && (
                      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-rx-blue" />
                    )}
                    
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", typeConfig.bgClass, typeConfig.colorClass)}>
                      {typeConfig.icon}
                    </div>

                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className={cn("text-sm font-heading font-medium truncate", !n.isRead ? "text-rx-text-primary" : "text-rx-text-secondary")}>
                          {n.title}
                        </h4>
                        <span className="text-[10px] font-body text-rx-text-muted whitespace-nowrap shrink-0">
                          {formatTime(n.createdAt)}
                        </span>
                      </div>
                      <p className={cn("text-xs font-body line-clamp-2", !n.isRead ? "text-rx-text-secondary" : "text-rx-text-muted")}>
                        {n.message}
                      </p>
                    </div>

                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 items-center bg-rx-surface/80 backdrop-blur-sm p-1 rounded-md border border-border/50 shadow-sm">
                      {!n.isRead && (
                        <button 
                          onClick={(e) => markAsRead(e, n.id)}
                          className="p-1 text-rx-text-muted hover:text-rx-blue transition-colors rounded tooltip-trigger"
                          title="Mark as read"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => deleteNotification(e, n.id)}
                        className="p-1 text-rx-text-muted hover:text-rx-red transition-colors rounded tooltip-trigger"
                         title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-border bg-rx-overlay/20 text-center rounded-b-xl">
           <p className="text-[11px] font-body text-rx-text-muted">Showing recent notifications</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
