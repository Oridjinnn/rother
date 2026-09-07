"use client";

import { ScrapeSchedule } from "@/components/dashboard/scrape-schedule";

export default function ScrapeScheduleFeature() {
  return (
    <div className="space-y-3">
      <ScrapeSchedule />
      {process.env.NODE_ENV !== "development" && (
        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Dev only
        </p>
      )}
    </div>
  );
}
