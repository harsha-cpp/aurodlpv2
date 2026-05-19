import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Inbox } from 'lucide-react';
import type { Severity } from '@aurodlpv2/shared';

interface QuarantineItem {
  id: string;
  timestamp: string;
  sender: string;
  subject: string;
  severity: Severity;
  entitiesCount: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

const items: QuarantineItem[] = [];

const tabs = ['All', 'Pending', 'Approved', 'Rejected'] as const;
type Tab = (typeof tabs)[number];

export default function Quarantine() {
  const activeTab: Tab = 'All';

  const columns = useMemo<ColumnDef<QuarantineItem>[]>(
    () => [
      { accessorKey: 'timestamp', header: 'Timestamp' },
      { accessorKey: 'sender', header: 'Sender' },
      { accessorKey: 'subject', header: 'Subject' },
      { accessorKey: 'severity', header: 'Severity' },
      { accessorKey: 'entitiesCount', header: 'Entities' },
      { accessorKey: 'status', header: 'Status' },
    ],
    [],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Quarantine review</h2>

      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-gray-600"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
          <Inbox className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No items in quarantine</p>
          <p className="text-xs mt-1">Emails flagged for review will appear here</p>
        </div>
      </div>
    </section>
  );
}
