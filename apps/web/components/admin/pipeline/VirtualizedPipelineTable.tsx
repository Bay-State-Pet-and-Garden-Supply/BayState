"use client"

import * as React from "react"
import { useVirtualizer, type VirtualItem, type Virtualizer } from "@tanstack/react-virtual"
import {
  Table,
  TableBody,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface VirtualizedPipelineTableProps<T> {
  /**
   * The items to render in the table
   */
  items: T[]
  /**
   * Function to estimate the size of a row
   */
  estimateSize: (index: number) => number
  /**
   * Function to render a row. Should return a TableRow component.
   * @param item The item data
   * @param index The index in the items array
   * @param virtualRow The virtual row metadata from @tanstack/react-virtual
   */
  renderRow: (item: T, index: number, virtualRow: VirtualItem) => React.ReactNode
  /**
   * Props to pass to the Table component. 
   * Use tableProps.children to pass the TableHeader.
   */
  tableProps?: React.ComponentProps<typeof Table>
  /**
   * Additional classes for the scroll container
   */
  containerClassName?: string
}

export interface VirtualizedPipelineTableHandle {
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void;
  getVirtualizer: () => Virtualizer<HTMLDivElement, Element>;
  container: HTMLDivElement | null;
}

interface VirtualizedPipelineTableComponent {
  <T>(
    props: VirtualizedPipelineTableProps<T> & { ref?: React.Ref<VirtualizedPipelineTableHandle> }
  ): React.ReactElement | null;
}

/**
 * A reusable virtualized table component for the pipeline views.
 * Abstracts @tanstack/react-virtual (v3) logic and wraps global Table primitives.
 * 
 * Adheres to the "Modern Farm Utilitarian" brand with heavy borders and blocky shadows
 * while ensuring high-performance scrolling for large datasets.
 */
export const VirtualizedPipelineTable = React.forwardRef(
  function VirtualizedPipelineTableInternal<T>(
    {
      items,
      estimateSize,
      renderRow,
      tableProps,
      containerClassName,
    }: VirtualizedPipelineTableProps<T>,
    ref: React.ForwardedRef<VirtualizedPipelineTableHandle>
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null)

    const virtualizer = useVirtualizer({
      count: items.length,
      getScrollElement: () => containerRef.current,
      estimateSize,
      overscan: 10,
    })

    React.useImperativeHandle(ref, () => ({
      scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, options),
      getVirtualizer: () => virtualizer,
      container: containerRef.current,
    }))

    const virtualItems = virtualizer.getVirtualItems()
    const totalSize = virtualizer.getTotalSize()

    // Extract children (header) from tableProps to render them outside TableBody
    const { children: tableChildren, className: tableClassName, ...restTableProps } = tableProps || {}

    // We use the spacer approach for virtualization as it's most compatible with 
    // standard table tags and the "Modern Farm Utilitarian" styling which uses 
    // border-separate and border-spacing-0.
    const paddingTop = virtualItems.length > 0 ? virtualItems?.[0]?.start || 0 : 0
    const paddingBottom =
      virtualItems.length > 0
        ? totalSize - (virtualItems?.[virtualItems.length - 1]?.end || 0)
        : 0

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-auto min-h-0 flex-1",
          // CRITICAL: Padding ensures the heavy border-4 and shadow-8px 
          // from the Table primitive are not clipped by this scroll container.
          "p-1 pr-4 pb-4 [&_[data-slot=table-container]]:overflow-visible", 
          containerClassName
        )}
        data-slot="virtualized-pipeline-table-scroll-container"
      >
        <Table 
          className={cn("border-separate border-spacing-0", tableClassName)} 
          {...restTableProps}
        >
          {tableChildren}
          <TableBody>
            {paddingTop > 0 && (
              <tr style={{ border: 0 }}>
                <td 
                  style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} 
                  colSpan={999} 
                />
              </tr>
            )}
            {virtualItems.map((virtualRow) => (
              <React.Fragment key={virtualRow.key}>
                {renderRow(items[virtualRow.index], virtualRow.index, virtualRow)}
              </React.Fragment>
            ))}
            {paddingBottom > 0 && (
              <tr style={{ border: 0 }}>
                <td 
                  style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} 
                  colSpan={999} 
                />
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
    )
  }
) as VirtualizedPipelineTableComponent;
