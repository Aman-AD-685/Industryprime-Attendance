"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser, type AuthUser } from "@/lib/auth";

type Employee = {
  id?: string;
  employee_code: string;
  at_div_code?: string | null;
  name?: string | null;
  department?: string | null;
  designation?: string | null;
  email?: string | null;
  salary_monthly?: number | null;
};

type EmployeeForm = {
  name: string;
  at_div_code: string;
  email: string;
  department: string;
  designation: string;
  salary_monthly: string;
};

const emptyForm: EmployeeForm = {
  name: "",
  at_div_code: "",
  email: "",
  department: "",
  designation: "",
  salary_monthly: "",
};

function formFromEmployee(row: Employee): EmployeeForm {
  return {
    name: row.name || "",
    at_div_code: row.at_div_code || "",
    email: row.email || "",
    department: row.department || "",
    designation: row.designation || "",
    salary_monthly: row.salary_monthly == null ? "" : String(row.salary_monthly),
  };
}

function isValidForm(form: EmployeeForm) {
  if (!form.name.trim()) return false;
  if (!form.at_div_code.trim()) return false;
  if (form.email.trim() && !form.email.includes("@")) return false;
  if (form.salary_monthly.trim() && Number(form.salary_monthly) < 0) return false;
  return true;
}

function toPayload(form: EmployeeForm) {
  return {
    name: form.name.trim(),
    at_div_code: form.at_div_code.trim(),
    email: form.email.trim() || null,
    department: form.department.trim() || null,
    designation: form.designation.trim() || null,
    salary_monthly: form.salary_monthly.trim() ? Number(form.salary_monthly) : null,
  };
}

export default function EmployeesPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editForm, setEditForm] = useState<EmployeeForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canManageEmployees = currentUser?.role === "master_admin" || currentUser?.role === "admin";

  async function loadEmployees() {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await apiFetch<Employee[]>("/employees?status=active"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCurrentUser(getStoredUser());
    void loadEmployees();
    const onAuthChange = () => setCurrentUser(getStoredUser());
    window.addEventListener("industryprime-auth-change", onAuthChange);
    return () => window.removeEventListener("industryprime-auth-change", onAuthChange);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((row) =>
      [row.employee_code, row.at_div_code, row.name, row.email, row.department, row.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [employees, query]);

  async function createEmployee(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidForm(form)) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const created = await apiFetch<Employee>("/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      setEmployees((rows) => [...rows, created]);
      setForm(emptyForm);
      setShowAddForm(false);
      setInfo(`${created.name || created.employee_code} added successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add employee");
    } finally {
      setSaving(false);
    }
  }

  async function saveEmployee(row: Employee) {
    if (!row.id || !isValidForm(editForm)) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await apiFetch<Employee>(`/employees/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm)),
      });
      setEmployees((rows) => rows.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setEditForm(emptyForm);
      setInfo(`${updated.name || updated.employee_code} updated successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update employee");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: Employee) {
    if (!row.id) return;
    setEditingId(row.id);
    setEditForm(formFromEmployee(row));
    setInfo(null);
    setError(null);
  }

  const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Employees</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Enterprise directory (Supabase-backed).</p>
        </div>
        <div className="flex w-full flex-col gap-3 md:max-w-[560px] md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Search</label>
            <input type="text" placeholder="Search by code, AT-Div-Code, name..." value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100" />
          </div>
          {canManageEmployees && <button type="button" onClick={() => setShowAddForm((value) => !value)} className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md">{showAddForm ? "Close" : "Add Employee"}</button>}
        </div>
      </div>

      {showAddForm && canManageEmployees && (
        <form onSubmit={createEmployee} className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-zinc-800/70 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add Working Employee</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Code is auto generated. Salary and all employee details can be edited later.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Code"><div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">Auto generated</div></Field>
            <Field label="AT-Div-Code"><FormInput value={form.at_div_code} placeholder="AT-DIV-001" onChange={(value) => setForm((state) => ({ ...state, at_div_code: value }))} /></Field>
            <Field label="Name"><FormInput value={form.name} placeholder="Employee name" onChange={(value) => setForm((state) => ({ ...state, name: value }))} /></Field>
            <Field label="Email"><FormInput type="email" value={form.email} placeholder="employee@company.com" onChange={(value) => setForm((state) => ({ ...state, email: value }))} /></Field>
            <Field label="Department"><FormInput value={form.department} placeholder="Operations" onChange={(value) => setForm((state) => ({ ...state, department: value }))} /></Field>
            <Field label="Salary"><FormInput type="number" value={form.salary_monthly} placeholder="35000" onChange={(value) => setForm((state) => ({ ...state, salary_monthly: value }))} /></Field>
          </div>
          <div className="mt-4"><Field label="Designation"><FormInput value={form.designation} placeholder="Supervisor" onChange={(value) => setForm((state) => ({ ...state, designation: value }))} /></Field></div>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => { setForm(emptyForm); setShowAddForm(false); }} className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200">Cancel</button>
            <button type="submit" disabled={!isValidForm(form) || saving} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Adding..." : "Save Employee"}</button>
          </div>
        </form>
      )}

      {info && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{info}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200" role="alert">{error}</div>}

      {loading ? <LoadingCard /> : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"><tr>{["Code", "AT-Div-Code", "Employee", "Email", "Department", "Salary", "Actions"].map((title) => <th key={title} className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">{title}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((row) => {
                const editing = editingId === row.id;
                return <tr key={row.id || row.employee_code} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3 align-top font-mono text-xs">{row.employee_code}</td>
                  <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} value={editForm.at_div_code} onChange={(e) => setEditForm((state) => ({ ...state, at_div_code: e.target.value }))} /> : <span className="font-mono text-xs">{row.at_div_code || "-"}</span>}</td>
                  <td className="px-4 py-3 align-top">{editing ? <div className="space-y-2"><input className={inputClass} value={editForm.name} onChange={(e) => setEditForm((state) => ({ ...state, name: e.target.value }))} /><input className={inputClass} placeholder="Designation" value={editForm.designation} onChange={(e) => setEditForm((state) => ({ ...state, designation: e.target.value }))} /></div> : <div><div className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name || "-"}</div><div className="text-xs text-zinc-500 dark:text-zinc-400">{row.designation || "-"}</div></div>}</td>
                  <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} type="email" value={editForm.email} onChange={(e) => setEditForm((state) => ({ ...state, email: e.target.value }))} /> : row.email || "-"}</td>
                  <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} value={editForm.department} onChange={(e) => setEditForm((state) => ({ ...state, department: e.target.value }))} /> : row.department || "-"}</td>
                  <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} type="number" min="0" value={editForm.salary_monthly} onChange={(e) => setEditForm((state) => ({ ...state, salary_monthly: e.target.value }))} /> : row.salary_monthly != null ? <span className="font-semibold text-emerald-700 dark:text-emerald-300">{Number(row.salary_monthly).toLocaleString()}</span> : "-"}</td>
                  <td className="px-4 py-3 align-top">{canManageEmployees && editing ? <div className="flex gap-2"><button type="button" disabled={!isValidForm(editForm) || saving} onClick={() => void saveEmployee(row)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">Save</button><button type="button" onClick={() => setEditingId(null)} className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Cancel</button></div> : canManageEmployees ? <button type="button" onClick={() => startEdit(row)} className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Edit</button> : "-"}</td>
                </tr>;
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">No results</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{label}</label><div className="mt-1">{children}</div></div>;
}

function FormInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string; }) {
  return <input type={type} min={type === "number" ? "0" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100" />;
}

function LoadingCard() {
  return <div className="rounded-3xl border border-zinc-200/70 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40"><div className="h-8 w-52 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/60" /><div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-9 w-full animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-800/50" />)}</div></div>;
}
