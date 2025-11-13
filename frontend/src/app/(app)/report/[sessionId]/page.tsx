// frontend/src/app/(app)/report/[sessionId]/page.tsx
"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type AnalysisResult } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/Button";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

/**
 * A simple pill for showing the score
 */
function ScoreBadge({ score }: { score: number }) {
  const scoreClass =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-700 ring-emerald-400/30 dark:text-emerald-200"
      : score >= 50
      ? "bg-amber-500/15 text-amber-700 ring-amber-400/30 dark:text-amber-200"
      : "bg-rose-500/15 text-rose-700 ring-rose-400/30 dark:text-rose-200";
  
  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ring-1 ${scoreClass}`}
    >
      {score}
    </span>
  );
}

/**
 * The content of the report page
 */
function ReportContent({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  
  // 1. Fetch all analysis data for this session
  const {
    data: analysisEvents,
    loading,
    error,
  } = useApi<AnalysisResult[]>(
    ["analysis", sessionId],
    () => api.analysis.listBySession(sessionId),
    { revalidateOnFocus: false }
  );

  // 2. Calculate aggregate stats
  const { avgScore, chartData } = useMemo(() => {
    if (!analysisEvents || analysisEvents.length === 0) {
      return { avgScore: 0, chartData: [] };
    }
    
    // Data comes newest-first, so reverse to get chronological order
    const chronologicalEvents = [...analysisEvents].reverse();

    const totalScore = chronologicalEvents.reduce((acc, event) => acc + event.score, 0);
    const avgScore = Math.round(totalScore / chronologicalEvents.length);
    
    const chartData = chronologicalEvents.map((event, i) => ({
      name: `Q${i + 1}`,
      score: event.score,
    }));
    
    return { avgScore, chartData };
  }, [analysisEvents]);

  // 3. Render loading/error/empty states
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="h-12 w-12 animate-spin text-brand-500" />
        <p className="text-xl text-muted-foreground">Generating your report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-2xl w-full p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h2 className="mt-4 text-xl font-semibold">Could not load report</h2>
        <p className="mt-2 text-muted-foreground">{error.message}</p>
        <Button onClick={() => router.push("/dashboard")} variant="secondary" className="mt-6">
          Back to Dashboard
        </Button>
      </Card>
    );
  }
  
  if (!analysisEvents || analysisEvents.length === 0) {
    return (
       <Card className="mx-auto max-w-2xl w-full p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="mt-4 text-xl font-semibold">No data found</h2>
        <p className="mt-2 text-muted-foreground">
          No analysis data was found for this session.
        </p>
        <Button onClick={() => router.push("/dashboard")} variant="secondary" className="mt-6">
          Back to Dashboard
        </Button>
      </Card>
    );
  }

  // 4. Render the full report
  // We reverse the events again to show newest first (or Q1 at top)
  const displayEvents = [...analysisEvents].reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" onClick={() => router.push("/dashboard")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Overall Score</p>
          <p className="text-4xl font-bold text-foreground">{avgScore}</p>
        </div>
      </div>
      
      {/* --- Score per Question Chart --- */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Score Per Question</h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--popover-foreground))",
                  borderRadius: "12px",
                }}
              />
              <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="score" position="top" fill="hsl(var(--foreground))" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      
      {/* --- Detailed Breakdown --- */}
      <h2 className="text-lg font-semibold pt-4">Detailed Breakdown</h2>
      <div className="space-y-4">
        {displayEvents.map((event, i) => (
          <Card key={event.id} className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Score */}
              <div className="flex-shrink-0">
                <ScoreBadge score={event.score} />
              </div>
              
              {/* Q & A */}
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Question {i + 1}</p>
                  {/* Note: The question text isn't saved in the analysis record yet. */}
                  {/* We are showing the AI's summary/rationale instead. */}
                  {/* To show the *actual* question, we'd need to save it with the analysis. */}
                  <p className="text-lg font-semibold text-foreground">
                    {/* Placeholder: We need to store the question text in the analysis record */}
                    {event.summary || "AI Analysis Summary"}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Your Answer (Transcript)</p>
                  {/* Placeholder: Transcript text isn't saved in analysis. */}
                  <p className="text-muted-foreground italic">
                    [Transcript text would appear here. The current analysis record doesn't store the full transcript.]
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-muted-foreground">AI Review</p>
                  <p className="text-foreground">{event.rationale}</p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {event.keywords.map(k => (
                    <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{k}</span>
                  ))}
                  {event.key_phrases.map(k => (
                    <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{k}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Main Page wrapper to get params
 */
export default function ReportPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;

  return (
    <main className="max-w-4xl mx-auto py-6">
      {sessionId ? (
        <ReportContent sessionId={sessionId} />
      ) : (
        <p>Invalid session ID.</p>
      )}
    </main>
  );
}