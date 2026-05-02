"use client";

type Option = { id: string; name?: string | null; employee_code: string };

type Props = {
  options: Option[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function EmployeeSelect({ options, value, onChange, disabled, loading }: Props) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        Select user
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <option value="">{loading ? "Loading…" : "Choose an employee"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {[o.name, o.employee_code].filter(Boolean).join(" · ") || o.id}
          </option>
        ))}
      </select>
    </label>
  );
}
