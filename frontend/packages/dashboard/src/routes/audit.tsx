import { FileText } from 'lucide-react';

export default function Audit() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Audit log</h2>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
          <FileText className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No audit events yet</p>
          <p className="text-xs mt-1">All scan decisions and admin actions will be recorded here</p>
        </div>
      </div>
    </section>
  );
}
