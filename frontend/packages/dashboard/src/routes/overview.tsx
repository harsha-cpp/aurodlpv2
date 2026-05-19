import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Shield, Ban, Lock, Activity } from 'lucide-react';

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-md p-2 ${accent}`}>{icon}</div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
}

export default function Overview() {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">Overview</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total scans"
          value="0"
          icon={<Shield className="h-5 w-5 text-emerald-600" />}
          accent="bg-emerald-50"
        />
        <StatCard
          label="Blocked"
          value="0"
          icon={<Ban className="h-5 w-5 text-red-600" />}
          accent="bg-red-50"
        />
        <StatCard
          label="Quarantined"
          value="0"
          icon={<Lock className="h-5 w-5 text-orange-600" />}
          accent="bg-orange-50"
        />
        <StatCard
          label="Avg risk score"
          value="—"
          icon={<Activity className="h-5 w-5 text-blue-600" />}
          accent="bg-blue-50"
        />
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Daily scan trend (last 7 days)</h3>
        <div className="flex h-72 items-center justify-center">
          <div className="text-center text-gray-400">
            <Activity className="mx-auto h-8 w-8 mb-2" />
            <p className="text-sm">No scan data yet</p>
            <p className="text-xs mt-1">Data will appear once scans start processing</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Recent decisions</h3>
        </div>
        <div className="border-t py-12 text-center text-sm text-gray-400">
          <p>No decisions recorded yet</p>
          <p className="text-xs mt-1">Scan results will appear here</p>
        </div>
      </div>
    </section>
  );
}
