"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquare,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { StarRating } from "./star-rating";
import { EmptyState } from "./empty-state";
import { ExportButtons } from "./export-buttons";
import { CopyButton } from "./copy-button";
import { cleanReviewerName } from "@/lib/gbp/format";
import type {
  BranchesResponse,
  BranchWithStats,
  Review,
  ReviewsResponse,
} from "@/lib/gbp/types";

interface ReviewsSectionProps {
  /** Bump to force a refetch (e.g. after a manual scrape). */
  refreshKey?: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

/** A single review row, enriched with display names. */
interface ReviewRow extends Review {
  reviewer_display: string;
  text_short: string;
  competitor_name: string;
  branch_name: string;
}

export function ReviewsSection({ refreshKey }: ReviewsSectionProps) {
  // ── Filter state ─────────────────────────────────────────────────────────
  const [branchId, setBranchId] = React.useState<string>("all");
  const [competitorId, setCompetitorId] = React.useState<string>("all");
  const [selectedRatings, setSelectedRatings] = React.useState<Set<number>>(
    new Set(),
  );
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  // ── Pagination state (server-driven) ────────────────────────────────────
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);

  // ── Sort state (client-side, applied to the current page) ───────────────
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility] = React.useState<VisibilityState>({});

  // ── Data ────────────────────────────────────────────────────────────────
  const [branches, setBranches] = React.useState<BranchesResponse | null>(null);
  const [rows, setRows] = React.useState<ReviewRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Reset to page 1 when any filter changes.
  React.useEffect(() => {
    setPage(1);
  }, [branchId, competitorId, selectedRatings, dateFrom, dateTo, debouncedSearch, pageSize]);

  // Debounce search input.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch branches tree once (for branch/competitor select options + name lookup).
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as BranchesResponse;
        if (!cancelled) setBranches(json);
      })
      .catch(() => {
        /* best-effort — names will just be IDs */
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Build a lookup map for competitor_id → {competitor_name, branch_name}.
  const nameLookup = React.useMemo(() => {
    const m = new Map<string, { competitor_name: string; branch_name: string }>();
    for (const b of branches?.branches ?? []) {
      for (const c of b.competitors) {
        m.set(c.competitor_id, {
          competitor_name: c.name,
          branch_name: b.branch_name,
        });
      }
    }
    return m;
  }, [branches]);

  // Build the competitor options for the currently-selected branch.
  const competitorOptions = React.useMemo(() => {
    if (!branches) return [];
    if (branchId === "all") {
      // Flatten all competitors across all branches.
      return branches.branches.flatMap((b: BranchWithStats) =>
        b.competitors.map((c) => ({
          competitor_id: c.competitor_id,
          name: c.name,
          branch_name: b.branch_name,
        })),
      );
    }
    const branch = branches.branches.find((b) => b.branch_id === branchId);
    return (branch?.competitors ?? []).map((c) => ({
      competitor_id: c.competitor_id,
      name: c.name,
      branch_name: branch?.branch_name ?? "",
    }));
  }, [branches, branchId]);

  // Fetch reviews whenever filters / page / refreshKey change.
  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (branchId !== "all") params.set("branch_id", branchId);
    if (competitorId !== "all") params.set("competitor_id", competitorId);
    if (selectedRatings.size > 0) {
      params.set("rating", Array.from(selectedRatings).sort().join(","));
    }
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    fetch(`/api/reviews?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as ReviewsResponse;
        if (cancelled) return;
        const enriched: ReviewRow[] = json.data.map((rv) => {
          const names = nameLookup.get(rv.competitor_id);
          return {
            ...rv,
            reviewer_display: cleanReviewerName(rv.reviewer_name),
            text_short: rv.text ?? "",
            competitor_name: names?.competitor_name ?? rv.competitor_id,
            branch_name: names?.branch_name ?? rv.branch_id,
          };
        });
        setRows(enriched);
        setTotal(json.total);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    branchId,
    competitorId,
    selectedRatings,
    dateFrom,
    dateTo,
    debouncedSearch,
    page,
    pageSize,
    refreshKey,
    nameLookup,
  ]);

  // When branch changes, reset competitor selection (it may no longer be valid).
  React.useEffect(() => {
    setCompetitorId("all");
  }, [branchId]);

  // Toggle a rating in the multi-select.
  const toggleRating = (r: number) => {
    setSelectedRatings((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  // ── Table definition ────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<ReviewRow>[]>(
    () => [
      {
        accessorKey: "reviewer_display",
        header: "Reviewer",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              {row.original.reviewer_display}
            </span>
            <CopyButton
              value={row.original.review_id}
              label={`Copy review ID: ${row.original.review_id}`}
              showText
              displayText={row.original.review_id}
              size="sm"
            />
          </div>
        ),
        sortingFn: "alphanumeric",
      },
      {
        accessorKey: "rating",
        header: "Rating",
        cell: ({ row }) => <StarRating rating={row.original.rating} size="sm" />,
        sortingFn: "basic",
      },
      {
        accessorKey: "text_short",
        header: "Review",
        enableSorting: false,
        cell: ({ row }) => <ReviewTextCell text={row.original.text} />,
      },
      {
        accessorKey: "relative_date",
        header: "When",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.relative_date ?? "—"}
          </span>
        ),
        sortingFn: "alphanumeric",
      },
      {
        accessorKey: "competitor_name",
        header: "Competitor",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground">
              {row.original.competitor_name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {row.original.branch_name}
            </span>
          </div>
        ),
        sortingFn: "alphanumeric",
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Pagination is server-driven; we let the table think all rows fit on the
    // current page so its internal pagination doesn't fight ours.
    pageCount: 1,
    manualPagination: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const hasActiveFilters =
    branchId !== "all" ||
    competitorId !== "all" ||
    selectedRatings.size > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0 ||
    debouncedSearch.trim().length > 0;

  const clearFilters = () => {
    setBranchId("all");
    setCompetitorId("all");
    setSelectedRatings(new Set());
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      <Card className="gbp-card-hover bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4 text-primary" aria-hidden="true" />
                All Reviews
              </CardTitle>
              <CardDescription>
                Searchable, filterable, paginated view across every competitor snapshot.
                {" "}
                <span className="font-semibold text-foreground">
                  {total.toLocaleString()}
                </span>{" "}
                review{total === 1 ? "" : "s"} match the current filters.
              </CardDescription>
            </div>
            <ExportButtons
              branchId={branchId === "all" ? undefined : branchId}
              competitorId={competitorId === "all" ? undefined : competitorId}
              ratings={Array.from(selectedRatings).sort()}
              search={debouncedSearch}
              disabled={total === 0 || loading}
              total={total}
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter bar */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Branch
              </label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches?.branches.map((b) => (
                    <SelectItem key={b.branch_id} value={b.branch_id}>
                      {b.branch_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Competitor
              </label>
              <Select value={competitorId} onValueChange={setCompetitorId}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="All competitors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All competitors</SelectItem>
                  {competitorOptions.map((c) => (
                    <SelectItem key={c.competitor_id} value={c.competitor_id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Rating
              </label>
              <div className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-transparent px-2">
                {RATING_OPTIONS.map((r) => {
                  const active = selectedRatings.has(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRating(r)}
                      aria-pressed={active}
                      aria-label={`Filter by ${r} star${r === 1 ? "" : "s"}`}
                      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {r}
                      <Star
                        className={`size-3 ${
                          active
                            ? "fill-primary-foreground text-primary-foreground"
                            : "fill-amber-400 text-amber-500"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-xs"
                aria-label="Date from"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-xs"
                aria-label="Date to"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Reviewer or text…"
                  className="h-8 pl-8 text-sm"
                  aria-label="Search reviews"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Active filters:</span>
                {branchId !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Branch:{" "}
                    {branches?.branches.find((b) => b.branch_id === branchId)
                      ?.branch_name ?? branchId}
                  </Badge>
                )}
                {competitorId !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Competitor:{" "}
                    {competitorOptions.find((c) => c.competitor_id === competitorId)
                      ?.name ?? competitorId}
                  </Badge>
                )}
                {selectedRatings.size > 0 && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    Ratings: {Array.from(selectedRatings).sort().join(", ")}★
                  </Badge>
                )}
                {dateFrom && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    From: {dateFrom}
                  </Badge>
                )}
                {dateTo && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    To: {dateTo}
                  </Badge>
                )}
                {debouncedSearch.trim() && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    “{debouncedSearch.trim()}”
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden="true" />
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="gbp-card-hover">
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-y-auto gbp-scrollbar-lg">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => {
                      const sortable = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead
                          key={header.id}
                          className="bg-card px-3 text-xs font-semibold uppercase tracking-wide"
                        >
                          {header.isPlaceholder ? null : sortable ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-primary"
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3" aria-hidden="true" />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3" aria-hidden="true" />
                              ) : (
                                <ArrowUpDown
                                  className="size-3 opacity-40"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                      {columns.map((_, j) => (
                        <TableCell key={j} className="px-3 py-3">
                          <Skeleton className="h-5 w-full max-w-[180px]" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="py-10">
                      <EmptyState
                        icon={hasActiveFilters ? Inbox : MessageSquare}
                        title={
                          hasActiveFilters
                            ? "No reviews match these filters"
                            : "No reviews yet"
                        }
                        description={
                          hasActiveFilters
                            ? "Try widening your filters or clearing them."
                            : "The scraper hasn't produced any snapshots yet. Click “Run Now” in the header to trigger a fixtures-mode scrape."
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} className="py-10">
                      <EmptyState
                        icon={AlertTriangle}
                        title="Couldn't load reviews"
                        description={error}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row, idx) => (
                    <TableRow
                      key={row.original.review_id}
                      className={idx % 2 === 1 ? "bg-muted/30" : ""}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-3 align-top">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:flex-row">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Showing{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}
                </span>
                –
                <span className="font-semibold tabular-nums text-foreground">
                  {Math.min(page * pageSize, total)}
                </span>{" "}
                of{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {total.toLocaleString()}
                </span>
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1.5">
                Per page:
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) =>
                    setPageSize(Number(v) as (typeof PAGE_SIZE_OPTIONS)[number])
                  }
                >
                  <SelectTrigger size="sm" className="h-7 w-[68px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || loading}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page{" "}
                <span className="font-semibold text-foreground">{page}</span> /{" "}
                {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={!canNext || loading}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Review text cell with click-to-expand for long text. */
function ReviewTextCell({ text }: { text: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!text) {
    return <span className="text-xs italic text-muted-foreground">(no text)</span>;
  }
  const MAX = 120;
  if (text.length <= MAX) {
    return <span className="text-sm leading-relaxed text-foreground/90">{text}</span>;
  }
  return (
    <div className="text-sm leading-relaxed text-foreground/90">
      {expanded ? text : `${text.slice(0, MAX).trimEnd()}…`}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="ml-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        aria-expanded={expanded}
      >
        {expanded ? "show less" : "expand"}
      </button>
    </div>
  );
}
