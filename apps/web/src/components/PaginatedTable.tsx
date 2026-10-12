import React from "react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
}

interface PaginatedTableProps<T> {
  caption: string;
  columns: ColumnDef<T>[];
  items: T[];
  getRowKey: (item: T) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (newPage: number) => void;
  emptyMessage?: string;
}

export function PaginatedTable<T>({
  caption,
  columns,
  items,
  getRowKey,
  page,
  pageSize,
  total,
  onPageChange,
  emptyMessage = "No matching records found.",
}: PaginatedTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (items.length === 0) {
    return (
      <div className="p-6 text-center bg-white rounded-lg border border-slate-200 text-sm text-slate-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" aria-label={caption}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
              {columns.map((col) => (
                <th key={col.key} scope="col" className="px-4 py-3">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm text-slate-800">
            {items.map((item) => (
              <tr key={getRowKey(item)} className="hover:bg-slate-50/80">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 align-middle">
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
        <span>
          Showing page <strong className="text-slate-900">{page}</strong> of{" "}
          <strong className="text-slate-900">{totalPages}</strong> ({total}{" "}
          total records)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-100"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-100"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

