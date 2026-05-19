import { Users } from 'lucide-react';

export default function UsersPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Users &amp; roles</h2>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
          <Users className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No users yet</p>
          <p className="text-xs mt-1">
            Organization members will appear here once they sign in
          </p>
        </div>
      </div>
    </section>
  );
}
