import { Shield } from 'lucide-react';

export default function Policies() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Policies</h2>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
          <Shield className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No policies configured</p>
          <p className="text-xs mt-1">
            Create DLP rules to control how PHI/PII is handled in outgoing emails
          </p>
        </div>
      </div>
    </section>
  );
}
