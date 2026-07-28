import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { ScopeBanner } from "../../components/ScopeBanner";
import { getStats, listReviews } from "../../lib/api";
import type { Review, ReviewSortField, SortOrder } from "../../lib/types";
import { cn, dayKeyVn, dayRowToneClass, formatApiLevel, formatDate } from "../../lib/utils";

const columnHelper = createColumnHelper<Review>();

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="whitespace-nowrap" aria-label={`${stars} sao`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={index < stars ? "text-amber-300" : "text-slate-600"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function SortToggle({
  field,
  sortBy,
  sortOrder,
  onToggle,
}: {
  field: ReviewSortField;
  sortBy: ReviewSortField;
  sortOrder: SortOrder;
  onToggle: (field: ReviewSortField) => void;
}) {
  const active = sortBy === field;
  const Icon = active ? (sortOrder === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      aria-label={active ? "Đổi chiều sắp xếp" : "Sắp xếp cột này"}
      onClick={() => onToggle(field)}
      className={cn(
        "rounded p-0.5 transition-colors",
        active
          ? "bg-sky-500/20 text-sky-300"
          : "text-slate-500 hover:bg-white/5 hover:text-slate-300",
      )}
    >
      <Icon size={14} />
    </button>
  );
}

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

export function ReviewsTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<ReviewSortField>("lastModifiedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [pageSize, setPageSize] = useState<number>(50);

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: search.trim() || undefined,
      minRating: starFilter,
      maxRating: starFilter,
      sortBy,
      sortOrder,
    }),
    [page, pageSize, search, starFilter, sortBy, sortOrder],
  );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["reviews", filters],
    queryFn: () => listReviews(filters),
  });

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });

  const isRecentOnly = true; // live Play API window only

  function handleSortToggle(field: ReviewSortField) {
    if (sortBy === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("starRating", {
        header: "Sao",
        cell: (info) => <StarRating stars={info.getValue()} />,
      }),
      columnHelper.accessor("authorName", {
        header: "Tác giả",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("text", {
        header: "Nội dung",
        cell: (info) => (
          <p className="min-w-[240px] max-w-2xl whitespace-pre-wrap break-words leading-relaxed text-slate-200">
            {info.getValue()?.replace("\t", " — ") || "—"}
          </p>
        ),
      }),
      columnHelper.accessor("appVersionName", {
        header: "Version",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("device", {
        header: "Thiết bị",
        cell: (info) => {
          const device = info.getValue();
          const manufacturer = info.row.original.manufacturer;
          if (!device && !manufacturer) return "—";
          if (manufacturer && device) return `${manufacturer} ${device}`;
          return device || manufacturer || "—";
        },
      }),
      columnHelper.accessor("androidOsVersion", {
        header: "API level",
        cell: (info) => formatApiLevel(info.getValue()),
      }),
      columnHelper.accessor("hasDeveloperReply", {
        header: "Phản hồi",
        cell: (info) => {
          const hasReply = info.getValue();
          const replyText = info.row.original.developerReply;

          return (
            <div className="min-w-[180px] max-w-sm space-y-2">
              <span
                className={
                  hasReply
                    ? "inline-flex rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300"
                    : "inline-flex rounded-full bg-slate-500/15 px-2 py-1 text-xs text-slate-400"
                }
              >
                {hasReply ? "Đã phản hồi" : "Chưa phản hồi"}
              </span>
              {hasReply && replyText ? (
                <p className="whitespace-pre-wrap break-words border-l-2 border-emerald-500/30 pl-2 text-xs leading-relaxed text-emerald-100/90">
                  {replyText}
                </p>
              ) : hasReply ? (
                <p className="text-xs text-slate-500">Không có nội dung phản hồi</p>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("lastModifiedAt", {
        header: "Cập nhật",
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const dayToneByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.items ?? []) {
      const key = dayKeyVn(item.lastModifiedAt);
      if (!map.has(key)) {
        map.set(key, map.size);
      }
    }
    return map;
  }, [data?.items]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function renderHeaderLabel(columnId: string, label: string) {
    if (columnId === "starRating" || columnId === "lastModifiedAt") {
      return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {label}
          <SortToggle
            field={columnId}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggle={handleSortToggle}
          />
        </span>
      );
    }

    return label;
  }

  return (
    <div className="space-y-4">
      {statsQuery.data ? <ScopeBanner stats={statsQuery.data} /> : null}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo nội dung, author, reviewId..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-2 pl-10 pr-3 text-sm text-white outline-none ring-sky-500/30 focus:ring-2"
          />
        </div>
        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none"
          aria-label="Số dòng mỗi trang"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} dòng/trang
            </option>
          ))}
        </select>
        <select
          value={starFilter ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            setStarFilter(value ? Number(value) : undefined);
            setPage(1);
          }}
          className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none"
        >
          <option value="">Tất cả sao</option>
          {[5, 4, 3, 2, 1].map((stars) => (
            <option key={stars} value={stars}>
              {stars} sao
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {isLoading ? (
          <div className="p-8 text-slate-300">Đang tải reviews...</div>
        ) : error ? (
          <div className="p-8 text-red-200">{String(error)}</div>
        ) : (
          <div className={`overflow-x-auto ${isFetching ? "opacity-60" : ""}`}>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/40 text-slate-400">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={cn(
                          "px-4 py-3 font-medium whitespace-nowrap",
                          header.column.id === "text" && "min-w-[280px]",
                          header.column.id === "hasDeveloperReply" && "min-w-[200px]",
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : renderHeaderLabel(
                              header.column.id,
                              flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              ) as string,
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-slate-400">
                      Không có review phù hợp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const dayKey = dayKeyVn(row.original.lastModifiedAt);
                    const dayIndex = dayToneByKey.get(dayKey) ?? 0;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-t border-white/5 transition-colors",
                          dayRowToneClass(dayIndex),
                        )}
                        title={`Ngày ${dayKey}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-4 py-3 align-top text-slate-200",
                              cell.column.id !== "text" &&
                                cell.column.id !== "hasDeveloperReply" &&
                                "whitespace-nowrap",
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
        <span>
          Trang {page}/{totalPages} · {pageSize} dòng/trang · Tổng {data?.total ?? 0} reviews
          {starFilter ? ` · Lọc ${starFilter} sao` : ""}
          {isFetching ? " · Đang lọc..." : ""}
          {isRecentOnly ? " · dữ liệu live 7 ngày API" : ""}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
