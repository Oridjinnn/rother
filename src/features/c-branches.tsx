"use client";

import * as React from "react";

import { BranchesSection } from "@/components/dashboard/branches-section";
import { useBranches } from "@/lib/gbp/use-branches";

export default function BranchesFeature() {
  const { data, loading, error } = useBranches();
  return (
    <BranchesSection data={data} loading={loading} error={error} refreshKey={0} />
  );
}
