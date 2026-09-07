"use client";

import * as React from "react";

import { BranchComparisonSection } from "@/components/dashboard/branch-comparison-section";
import { useBranches } from "@/lib/gbp/use-branches";

export default function CompareFeature() {
  const { data, loading, error } = useBranches();
  return (
    <BranchComparisonSection
      data={data}
      loading={loading}
      error={error}
      refreshKey={0}
    />
  );
}
