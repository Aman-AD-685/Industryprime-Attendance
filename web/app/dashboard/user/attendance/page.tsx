import Link from "next/link";

export default function UserAttendanceCalendarPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-900">My attendance</h1>
      <p className="text-sm text-zinc-500">Full-month calendar view will live here. Use Attendance for day-level detail today.</p>
      <Link href="/attendance" className="text-sm font-semibold text-emerald-500 underline">
        Open Attendance
      </Link>
    </div>
  );
}
