"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  salary_effective_month?: number | null;
  salary_effective_year?: number | null;
  previous_salary_monthly?: number | null;
  previous_salary_effective_until_month?: number | null;
  previous_salary_effective_until_year?: number | null;
  professional_tax?: number | null;
  pf_employee_monthly?: number | null;
  income_tax_tds_monthly?: number | null;
  hra_monthly?: number | null;
  conveyance_monthly?: number | null;
  special_allowance_monthly?: number | null;
  employment_status?: "current" | "left" | null;
  left_effective_month?: number | null;
  left_effective_year?: number | null;
};

type EmployeeForm = {
  name: string;
  at_div_code: string;
  email: string;
  department: string;
  designation: string;
  salary_monthly: string;
  salary_effective_month: string;
  salary_effective_year: string;
  professional_tax: string;
  pf_employee_monthly: string;
  income_tax_tds_monthly: string;
  hra_monthly: string;
  conveyance_monthly: string;
  special_allowance_monthly: string;
};

const emptyForm: EmployeeForm = {
  name: "",
  at_div_code: "",
  email: "",
  department: "",
  designation: "",
  salary_monthly: "",
  salary_effective_month: "",
  salary_effective_year: "",
  professional_tax: "",
  pf_employee_monthly: "",
  income_tax_tds_monthly: "",
  hra_monthly: "",
  conveyance_monthly: "",
  special_allowance_monthly: "",
};

function numToStr(v: number | null | undefined) {
  if (v == null || v === undefined) return "";
  return String(v);
}

function strToNumNullable(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function currentMonthYear() {
  const now = new Date();
  return { month: String(now.getMonth() + 1), year: String(now.getFullYear()) };
}

function formFromEmployee(row: Employee): EmployeeForm {
  const { month, year } = currentMonthYear();
  return {
    name: row.name || "",
    at_div_code: row.at_div_code || "",
    email: row.email || "",
    department: row.department || "",
    designation: row.designation || "",
    salary_monthly: numToStr(row.salary_monthly),
    salary_effective_month: row.salary_effective_month != null ? String(row.salary_effective_month) : month,
    salary_effective_year: row.salary_effective_year != null ? String(row.salary_effective_year) : year,
    professional_tax: numToStr(row.professional_tax),
    pf_employee_monthly: numToStr(row.pf_employee_monthly),
    income_tax_tds_monthly: numToStr(row.income_tax_tds_monthly),
    hra_monthly: numToStr(row.hra_monthly),
    conveyance_monthly: numToStr(row.conveyance_monthly),
    special_allowance_monthly: numToStr(row.special_allowance_monthly),
  };
}

function salaryAmountChanged(original: Employee, form: EmployeeForm): boolean {
  const before = original.salary_monthly ?? null;
  const after = form.salary_monthly.trim() ? Number(form.salary_monthly) : null;
  if (before == null && after == null) return false;
  if (before == null || after == null) return true;
  return Math.round(before * 100) !== Math.round(after * 100);
}

function monthYearLabel(month?: number | null, year?: number | null) {
  if (!month || !year) return "";
  return new Date(year, month - 1, 1).toLocaleString("en", { month: "short", year: "numeric" });
}

function formatOldSalary(row: Employee) {
  if (row.previous_salary_monthly == null) return "—";
  const until = monthYearLabel(row.previous_salary_effective_until_month, row.previous_salary_effective_until_year);
  return (
    <div>
      <div className="font-semibold text-zinc-700 dark:text-zinc-200">
        {Number(row.previous_salary_monthly).toLocaleString()}
      </div>
      {until ? <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Effective until {until}</div> : null}
    </div>
  );
}

function isValidForm(form: EmployeeForm, original?: Employee) {
  if (!form.name.trim()) return false;
  if (!form.at_div_code.trim()) return false;
  if (form.email.trim() && !form.email.includes("@")) return false;
  if (form.salary_monthly.trim() && Number(form.salary_monthly) < 0) return false;
  if (original && salaryAmountChanged(original, form)) {
    const m = Number(form.salary_effective_month);
    const y = Number(form.salary_effective_year);
    if (!Number.isInteger(m) || m < 1 || m > 12) return false;
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return false;
  }
  return true;
}

function toPayload(form: EmployeeForm, original?: Employee) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    at_div_code: form.at_div_code.trim(),
    email: form.email.trim() || null,
    department: form.department.trim() || null,
    designation: form.designation.trim() || null,
    salary_monthly: form.salary_monthly.trim() ? Number(form.salary_monthly) : null,
    professional_tax: strToNumNullable(form.professional_tax),
    pf_employee_monthly: strToNumNullable(form.pf_employee_monthly),
    income_tax_tds_monthly: strToNumNullable(form.income_tax_tds_monthly),
    hra_monthly: strToNumNullable(form.hra_monthly),
    conveyance_monthly: strToNumNullable(form.conveyance_monthly),
    special_allowance_monthly: strToNumNullable(form.special_allowance_monthly),
  };
  if (original && salaryAmountChanged(original, form)) {
    payload.salary_effective_month = Number(form.salary_effective_month);
    payload.salary_effective_year = Number(form.salary_effective_year);
  } else if (!original && form.salary_monthly.trim()) {
    const m = Number(form.salary_effective_month);
    const y = Number(form.salary_effective_year);
    if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y)) {
      payload.salary_effective_month = m;
      payload.salary_effective_year = y;
    }
  }
  return payload;
}

export default function EmployeesPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editForm, setEditForm] = useState<EmployeeForm>(emptyForm);
  const [editOriginal, setEditOriginal] = useState<Employee | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canManageEmployees = currentUser?.role === "master_admin" || currentUser?.role === "admin";

  async function updateEmploymentStatus(row: Employee, employment_status: "current" | "left") {
    if (!row.id || !canManageEmployees) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await apiFetch<Employee>(`/employees/${row.id}/employment-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employment_status }),
      });
      setEmployees((rows) => rows.map((item) => (item.id === updated.id ? updated : item)));
      setInfo(
        employment_status === "left"
          ? `${updated.name || updated.employee_code} marked Left — hidden from Attendance/Payroll from next month.`
          : `${updated.name || updated.employee_code} marked Current Emp.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

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
    if (!row.id || !isValidForm(editForm, editOriginal ?? row)) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await apiFetch<Employee>(`/employees/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm, editOriginal ?? row)),
      });
      setEmployees((rows) => rows.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setEditOriginal(null);
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
    setEditOriginal(row);
    setEditForm(formFromEmployee(row));
    setInfo(null);
    setError(null);
  }

  function openAddForm() {
    const { month, year } = currentMonthYear();
    setForm({ ...emptyForm, salary_effective_month: month, salary_effective_year: year });
    setShowAddForm(true);
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
          {canManageEmployees && <button type="button" onClick={() => (showAddForm ? setShowAddForm(false) : openAddForm())} className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md">{showAddForm ? "Close" : "Add Employee"}</button>}
        </div>
      </div>

      {showAddForm && canManageEmployees && (
        <form onSubmit={createEmployee} className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-sm backdrop-blur transition hover:shadow-md dark:border-zinc-800/70 dark:bg-zinc-950/40">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add Working Employee</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Code is auto generated. Salary and payslip fields can be edited later.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Code"><div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">Auto generated</div></Field>
            <Field label="AT-Div-Code"><FormInput value={form.at_div_code} placeholder="AT-DIV-001" onChange={(value) => setForm((state) => ({ ...state, at_div_code: value }))} /></Field>
            <Field label="Name"><FormInput value={form.name} placeholder="Employee name" onChange={(value) => setForm((state) => ({ ...state, name: value }))} /></Field>
            <Field label="Email"><FormInput type="email" value={form.email} placeholder="employee@company.com" onChange={(value) => setForm((state) => ({ ...state, email: value }))} /></Field>
            <Field label="Department"><FormInput value={form.department} placeholder="Operations" onChange={(value) => setForm((state) => ({ ...state, department: value }))} /></Field>
            <Field label="Monthly salary"><FormInput type="number" value={form.salary_monthly} placeholder="35000" onChange={(value) => setForm((state) => ({ ...state, salary_monthly: value }))} /></Field>
            <Field label="Effective from (month)">
              <FormInput type="number" min="1" max="12" value={form.salary_effective_month} placeholder="7" onChange={(value) => setForm((state) => ({ ...state, salary_effective_month: value }))} />
            </Field>
            <Field label="Effective from (year)">
              <FormInput type="number" min="2000" max="2100" value={form.salary_effective_year} placeholder="2026" onChange={(value) => setForm((state) => ({ ...state, salary_effective_year: value }))} />
            </Field>
          </div>
          <div className="mt-4"><Field label="Designation"><FormInput value={form.designation} placeholder="Supervisor" onChange={(value) => setForm((state) => ({ ...state, designation: value }))} /></Field></div>
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Admin — statutory (optional)</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Professional tax (monthly)"><FormInput type="number" value={form.professional_tax} placeholder="Leave blank" onChange={(value) => setForm((s) => ({ ...s, professional_tax: value }))} /></Field>
              <Field label="PF deduction (monthly ₹)"><FormInput type="number" value={form.pf_employee_monthly} placeholder="Leave blank" onChange={(value) => setForm((s) => ({ ...s, pf_employee_monthly: value }))} /></Field>
              <Field label="Income tax / TDS (monthly)"><FormInput type="number" value={form.income_tax_tds_monthly} placeholder="Leave blank" onChange={(value) => setForm((s) => ({ ...s, income_tax_tds_monthly: value }))} /></Field>
            </div>
            <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              HRA, conveyance, and mobile allowance can be added after save using Edit on this table. If mobile allowance
              is set, monthly salary should exclude that amount. Mobile is paid in full each month on the payslip (not
              prorated by attendance).
            </div>
          </div>
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
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"><tr>{["Code", "AT-Div-Code", "Employee", "Status", "Email", "Department", "Monthly salary", "Old salary", "Effective from", "Actions"].map((title) => <th key={title} className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200">{title}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((row) => {
                const editing = editingId === row.id;
                const salaryChanged = editOriginal ? salaryAmountChanged(editOriginal, editForm) : false;
                return (
                  <Fragment key={row.id || row.employee_code}>
                    <tr className="text-zinc-800 dark:text-zinc-200">
                      <td className="px-4 py-3 align-top font-mono text-xs">{row.employee_code}</td>
                      <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} value={editForm.at_div_code} onChange={(e) => setEditForm((state) => ({ ...state, at_div_code: e.target.value }))} /> : <span className="font-mono text-xs">{row.at_div_code || "-"}</span>}</td>
                      <td className="px-4 py-3 align-top">{editing ? <div className="space-y-2"><input className={inputClass} value={editForm.name} onChange={(e) => setEditForm((state) => ({ ...state, name: e.target.value }))} /><input className={inputClass} placeholder="Designation" value={editForm.designation} onChange={(e) => setEditForm((state) => ({ ...state, designation: e.target.value }))} /></div> : <div><div className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name || "-"}</div><div className="text-xs text-zinc-500 dark:text-zinc-400">{row.designation || "-"}</div></div>}</td>
                      <td className="px-4 py-3 align-top">
                        {canManageEmployees ? (
                          <select
                            className={`rounded-xl border px-2 py-1.5 text-xs font-semibold outline-none focus:border-emerald-500/60 dark:bg-zinc-900 ${
                              (row.employment_status || "current") === "left"
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                            }`}
                            value={row.employment_status || "current"}
                            disabled={saving}
                            onChange={(e) => void updateEmploymentStatus(row, e.target.value as "current" | "left")}
                          >
                            <option value="current">Current Emp</option>
                            <option value="left">Left</option>
                          </select>
                        ) : (
                          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            {(row.employment_status || "current") === "left" ? "Left" : "Current Emp"}
                          </span>
                        )}
                        {(row.employment_status || "current") === "left" && row.left_effective_month && row.left_effective_year ? (
                          <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                            From {monthYearLabel(row.left_effective_month, row.left_effective_year)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} type="email" value={editForm.email} onChange={(e) => setEditForm((state) => ({ ...state, email: e.target.value }))} /> : row.email || "-"}</td>
                      <td className="px-4 py-3 align-top">{editing ? <input className={inputClass} value={editForm.department} onChange={(e) => setEditForm((state) => ({ ...state, department: e.target.value }))} /> : row.department || "-"}</td>
                      <td className="px-4 py-3 align-top">
                        {editing ? (
                          <input className={inputClass} type="number" min="0" value={editForm.salary_monthly} onChange={(e) => setEditForm((state) => ({ ...state, salary_monthly: e.target.value }))} />
                        ) : row.salary_monthly != null ? (
                          <div>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">{Number(row.salary_monthly).toLocaleString()}</span>
                            {row.salary_effective_month && row.salary_effective_year ? (
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">From {monthYearLabel(row.salary_effective_month, row.salary_effective_year)}</div>
                            ) : null}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">{editing ? "—" : formatOldSalary(row)}</td>
                      <td className="px-4 py-3 align-top">{editing ? "—" : monthYearLabel(row.salary_effective_month, row.salary_effective_year) || "—"}</td>
                      <td className="px-4 py-3 align-top">{canManageEmployees && editing ? <div className="flex gap-2"><button type="button" disabled={!isValidForm(editForm, editOriginal ?? row) || saving} onClick={() => void saveEmployee(row)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">Save</button><button type="button" onClick={() => { setEditingId(null); setEditOriginal(null); }} className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Cancel</button></div> : canManageEmployees ? <button type="button" onClick={() => startEdit(row)} className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Edit</button> : "-"}</td>
                    </tr>
                    {editing && canManageEmployees ? (
                      <tr className="bg-zinc-50/90 dark:bg-zinc-900/50">
                        <td colSpan={10} className="px-4 py-4">
                          {salaryChanged ? (
                            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">Salary change — effective from</div>
                              <p className="mt-1 text-xs text-amber-800 dark:text-amber-100">
                                Payroll will use the new amount from this month onward. Months before that keep the previous salary.
                              </p>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <Field label="Effective month (1–12)">
                                  <FormInput type="number" min="1" max="12" value={editForm.salary_effective_month} onChange={(v) => setEditForm((s) => ({ ...s, salary_effective_month: v }))} />
                                </Field>
                                <Field label="Effective year">
                                  <FormInput type="number" min="2000" max="2100" value={editForm.salary_effective_year} onChange={(v) => setEditForm((s) => ({ ...s, salary_effective_year: v }))} />
                                </Field>
                              </div>
                            </div>
                          ) : null}
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Payslip — admin fields</div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                            <Field label="Professional tax (monthly)"><FormInput type="number" value={editForm.professional_tax} placeholder="Blank" onChange={(v) => setEditForm((s) => ({ ...s, professional_tax: v }))} /></Field>
                            <Field label="PF (monthly ₹)"><FormInput type="number" value={editForm.pf_employee_monthly} placeholder="Blank" onChange={(v) => setEditForm((s) => ({ ...s, pf_employee_monthly: v }))} /></Field>
                            <Field label="TDS (monthly)"><FormInput type="number" value={editForm.income_tax_tds_monthly} placeholder="Blank" onChange={(v) => setEditForm((s) => ({ ...s, income_tax_tds_monthly: v }))} /></Field>
                            <Field label="HRA (monthly)"><FormInput type="number" value={editForm.hra_monthly} placeholder="Blank" onChange={(v) => setEditForm((s) => ({ ...s, hra_monthly: v }))} /></Field>
                            <Field label="Conveyance"><FormInput type="number" value={editForm.conveyance_monthly} placeholder="Blank" onChange={(v) => setEditForm((s) => ({ ...s, conveyance_monthly: v }))} /></Field>
                            <Field label="Mobile allowance">
                              <FormInput
                                type="number"
                                value={editForm.special_allowance_monthly}
                                placeholder="Blank"
                                onChange={(v) => setEditForm((s) => ({ ...s, special_allowance_monthly: v }))}
                              />
                            </Field>
                          </div>
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">These allowance fields are maintained here (admin).</p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">No results</td></tr>}
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

function FormInput({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type={type}
      min={type === "number" ? min : undefined}
      max={type === "number" ? max : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
    />
  );
}

function LoadingCard() {
  return <div className="rounded-3xl border border-zinc-200/70 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40"><div className="h-8 w-52 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/60" /><div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-9 w-full animate-pulse rounded-2xl bg-zinc-200/50 dark:bg-zinc-800/50" />)}</div></div>;
}
