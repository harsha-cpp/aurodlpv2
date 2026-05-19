import { useState } from 'react';
import { Globe, Plus } from 'lucide-react';

export default function Domains() {
  const [input, setInput] = useState('');

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Allowed domains</h2>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. apollo-hospitals.com"
            className="w-full rounded-md border py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          <Plus className="h-4 w-4" />
          Add Domain
        </button>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
          <Globe className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No approved partner domains</p>
          <p className="text-xs mt-1">
            Add domain names of trusted healthcare organizations
          </p>
        </div>
      </div>
    </section>
  );
}
