"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ExportDashboardDialog } from "@/components/dashboard/export-dashboard-dialog";
import { useOverview } from "@/lib/gbp/use-overview";

export default function ExportFeature() {
  const { data } = useOverview();
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Export your data</h2>
        <p className="text-sm text-muted-foreground">
          Download reviews, competitors, branches and history as CSV or JSON.
        </p>
      </div>
      <Button onClick={() => setOpen(true)}>Open export</Button>
      <ExportDashboardDialog
        open={open}
        onOpenChange={setOpen}
        totalReviews={data?.totalReviews ?? 0}
        totalRuns={0}
        totalCompetitors={data?.totalCompetitors ?? 0}
        totalBranches={data?.totalBranches ?? 0}
      />
    </div>
  );
}
