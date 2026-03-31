import { useState } from 'react';
import type { Session } from '@paws/domain-session';
import { useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Copyable } from './CopyButton.js';
import { RelativeTime } from './RelativeTime.js';
import { StatusBadge } from './StatusBadge.js';

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const columnHelper = createColumnHelper<Session>();

const columns = [
  columnHelper.accessor('sessionId', {
    header: 'ID',
    cell: (info) => (
      <Copyable value={info.getValue()}>
        <span className="font-mono">{truncateId(info.getValue())}</span>
      </Copyable>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('worker', {
    header: 'Worker',
    cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? '-'}</span>,
  }),
  columnHelper.accessor('durationMs', {
    header: 'Duration',
    cell: (info) => (
      <span className="text-muted-foreground">{formatDuration(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor('startedAt', {
    header: 'Started',
    cell: (info) => <RelativeTime timestamp={info.getValue()} className="text-muted-foreground" />,
    sortingFn: 'datetime',
  }),
];

export function SessionTable({ sessions }: { sessions: Session[] }) {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'startedAt', desc: true }]);

  const table = useReactTable({
    data: sessions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (sessions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">No sessions found.</div>
    );
  }

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                onClick={header.column.getToggleSortingHandler()}
                className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
              >
                <div className="flex items-center gap-1">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getCanSort() && (
                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            onClick={() => void navigate({ to: `/sessions/${row.original.sessionId}` })}
            className="cursor-pointer"
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
