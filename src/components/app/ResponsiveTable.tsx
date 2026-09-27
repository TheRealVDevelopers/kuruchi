import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** becomes the card title on mobile; exactly one column should set this */
  primary?: boolean;
  /** rendered beneath the title on mobile instead of as a label/value pair */
  subtitle?: boolean;
  /** dropped entirely from the mobile card */
  hideOnMobile?: boolean;
  align?: "left" | "right";
  /** fixed column width, e.g. "w-24" — keeps columns from dancing between rows */
  width?: string;
  className?: string;
}

/**
 * The terminal grid: compact rows, ruled columns, a header that stays put.
 *
 * Vertical rules matter more than they look like they should. In a 40-row table
 * without them the eye loses which column it is in halfway down, and people
 * start widening the window instead of reading. Below `md` the same data
 * becomes stacked cards, because a ruled grid on a phone is unusable.
 */
export function ResponsiveTable<T>({
  data,
  columns,
  keyOf,
  empty = "Nothing here yet.",
  onRowClick,
  footer,
  minWidth = "min-w-[720px]",
  maxHeight,
}: {
  data: T[];
  columns: Column<T>[];
  keyOf: (row: T) => string;
  empty?: string;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
  minWidth?: string;
  /** turns on a scrolling body with a pinned header, e.g. "max-h-[32rem]" */
  maxHeight?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const subtitles = columns.filter((c) => c.subtitle);
  const rest = columns.filter((c) => c !== primary && !c.subtitle && !c.hideOnMobile);

  return (
    <>
      {/* ------------------------------------------------------- desktop */}
      <div
        className={cn(
          "hidden overflow-auto rounded border bg-card md:block",
          maxHeight
        )}
        style={maxHeight ? undefined : undefined}
      >
        <table className={cn("grid-table", minWidth)}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(c.align === "right" && "text-right", c.width)}
                  scope="col"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyOf(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      c.align === "right" && "num",
                      c.width,
                      c.className
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>

      {/* -------------------------------------------------------- mobile */}
      <ul className="space-y-2 md:hidden">
        {data.map((row) => (
          <li
            key={keyOf(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "rounded border bg-card p-3",
              onRowClick && "cursor-pointer active:bg-sunken"
            )}
          >
            <div className="font-bold leading-tight">{primary.cell(row)}</div>
            {subtitles.map((c) => (
              <div key={c.key} className="mt-0.5 text-[13px] text-muted-foreground">
                {c.cell(row)}
              </div>
            ))}
            {rest.length > 0 && (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2.5">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="eyebrow">{c.header}</dt>
                    <dd className="mt-0.5 text-[13px]">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
