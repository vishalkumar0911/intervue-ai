"use client";

import { useEffect, useState } from "react";
import RequireRole from "@/components/auth/RequireRole";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { api, type Health } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AdminHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const h = await api.health();
      setData(h);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <RequireRole roles={["Admin"]} mode="redirect">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Server health</h1>
            <p className="text-muted-foreground">Basic status & file info from FastAPI.</p>
          </div>
          <Button variant="secondary" onClick={load} isLoading={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <Card>
          {!data ? (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          ) : (
            <div className="p-4 space-y-4 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <p><span className="text-muted-foreground">Mode:</span> <b>{data.mode ?? "unknown"}</b></p>
                  <p><span className="text-muted-foreground">Server time:</span> {new Date((data.server_time ?? 0) * 1000).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="truncate"><span className="text-muted-foreground">Questions file:</span> {data.questions_file}</p>
                  <p className="truncate"><span className="text-muted-foreground">Attempts file:</span> {data.attempts_file}</p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <p><span className="text-muted-foreground">Questions size:</span> {data.questions_size ?? 0} bytes</p>
                <p><span className="text-muted-foreground">Attempts size:</span> {data.attempts_size ?? 0} bytes</p>
              </div>

              <div>
                <p className="font-medium mb-2">Roles & question counts</p>
                {Object.keys(data.counts || {}).length === 0 ? (
                  <p className="text-muted-foreground">No roles loaded.</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {Object.entries(data.counts).map(([role, count]) => (
                      <li key={role}><b>{role}</b>: {count}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </RequireRole>
  );
}
