import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COOKIE_NAME,
  SESSION_COOKIE,
  SESSION_TIMESTAMP_KEY,
  TOKEN_KEY,
  USER_KEY,
  type AuthUser,
} from "@/lib/auth";

vi.mock("@/lib/envApi", () => ({
  directBrowserApiBase: () => "http://test.local/api",
}));

const sampleUser = (role: AuthUser["role"]): AuthUser => ({
  id: "user-1",
  name: "Test User",
  email: "test@company.com",
  role,
});

function mockLoginResponse(role: AuthUser["role"], token = "jwt-token-abc") {
  return {
    access_token: token,
    token_type: "bearer",
    user: sampleUser(role),
  };
}

function readCookie(name: string): string | null {
  const safe = name.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp(`(?:^|; )${safe}=([^;]*)`));
  return m ? decodeURIComponent(m[1].trim()) : null;
}

function clearAllCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
    }
  }
}

async function loadAuthModule() {
  return import("@/lib/auth");
}

/** Mirrors login page submit handler — hard navigation after login() resolves. */
async function loginPageSubmit(
  auth: Awaited<ReturnType<typeof loadAuthModule>>,
  location: { assign: (path: string) => void },
  email: string,
  password: string,
) {
  const signedIn = await auth.login(email, password);
  auth.navigateAfterAuth(auth.dashboardPathForRole(signedIn.role), { force: true });
  void location.assign;
}

describe("auth login flow", () => {
  const locationAssign = vi.fn();
  const locationHrefSetter = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    clearAllCookies();
    locationAssign.mockReset();
    locationHrefSetter.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("location", {
      assign: locationAssign,
      replace: vi.fn(),
      pathname: "/login",
      href: "http://localhost/login",
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        assign: locationAssign,
        replace: vi.fn(),
        get pathname() {
          return "/login";
        },
        set href(v: string) {
          locationHrefSetter(v);
        },
        get href() {
          return "http://localhost/login";
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Scenario 1 — happy path: storage populated before navigateAfterAuth", async () => {
    const auth = await loadAuthModule();
    const payload = mockLoginResponse("admin");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    let tokenAtRedirect: string | null = null;
    let cookieAtRedirect: string | null = null;
    locationAssign.mockImplementation(() => {
      tokenAtRedirect = localStorage.getItem(TOKEN_KEY);
      cookieAtRedirect = readCookie(COOKIE_NAME);
    });

    await auth.login("test@company.com", "password123");
    auth.navigateAfterAuth("/dashboard", { force: true });

    expect(tokenAtRedirect).toBe("jwt-token-abc");
    expect(cookieAtRedirect).toBe("jwt-token-abc");
    expect(readCookie(SESSION_COOKIE)).toBe("1");
    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(payload.user));
    expect(locationAssign).toHaveBeenCalledOnce();
    expect(locationAssign).toHaveBeenCalledWith("/dashboard");
  });

  it("Scenario 2 — role redirects", async () => {
    const auth = await loadAuthModule();
    expect(auth.dashboardPathForRole("user")).toBe("/dashboard/user");
    expect(auth.dashboardPathForRole("admin")).toBe("/dashboard");
    expect(auth.dashboardPathForRole("master_admin")).toBe("/dashboard");
    expect(auth.dashboardPathForRole("unknown")).toBe("/login");
    expect(auth.dashboardPathForRole("")).toBe("/login");
  });

  it("Scenario 3 — 401 failure: no storage writes, no redirect", async () => {
    const auth = await loadAuthModule();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid email or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(loginPageSubmit(auth, { assign: locationAssign }, "bad@company.com", "wrongpass1")).rejects.toThrow();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(readCookie(COOKIE_NAME)).toBeNull();
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it("Scenario 4 — 429 rate limit: no storage, no redirect, exact message", async () => {
    const auth = await loadAuthModule();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Too many attempts. Please wait a minute and try again." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(loginPageSubmit(auth, { assign: locationAssign }, "test@company.com", "password123")).rejects.toThrow(
      "Too many attempts. Please wait a minute and try again.",
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(readCookie(COOKIE_NAME)).toBeNull();
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it("Scenario 5 — network timeout: no redirect", async () => {
    const auth = await loadAuthModule();

    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    vi.mocked(fetch).mockRejectedValueOnce(abortErr);

    await expect(loginPageSubmit(auth, { assign: locationAssign }, "test@company.com", "password123")).rejects.toThrow(
      /timed out/i,
    );
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it("Scenario 6 — double-submit lock: second click blocked while first in flight", async () => {
    const auth = await loadAuthModule();
    const payload = mockLoginResponse("user");
    let resolveFetch!: (value: Response) => void;

    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = auth.login("test@company.com", "password123");
    const second = auth.login("test@company.com", "password123");

    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const [u1, u2] = await Promise.all([first, second]);
    expect(u1).toEqual(u2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("Scenario 7 — AppShell session hydration and TTL", async () => {
    const auth = await loadAuthModule();
    const user = sampleUser("admin");

    await auth.storeAuth("hydrate-token", user);

    expect(localStorage.getItem(TOKEN_KEY)).toBe("hydrate-token");
    expect(localStorage.getItem(USER_KEY)).toBe(JSON.stringify(user));
    expect(readCookie(COOKIE_NAME)).toBe("hydrate-token");
    expect(auth.getStoredToken()).toBe("hydrate-token");
    expect(auth.getStoredUser()).toEqual(user);
    expect(auth.isSessionFresh()).toBe(true);

    const fourMinutesAgo = String(Date.now() - 4 * 60 * 1000);
    localStorage.setItem(SESSION_TIMESTAMP_KEY, fourMinutesAgo);
    expect(auth.isSessionFresh()).toBe(true);

    const sixMinutesAgo = String(Date.now() - 6 * 60 * 1000);
    localStorage.setItem(SESSION_TIMESTAMP_KEY, sixMinutesAgo);
    expect(auth.isSessionFresh()).toBe(false);

    const guardRedirect = () => {
      if (!auth.getStoredToken()) locationAssign("/login");
    };
    auth.clearAuth();
    guardRedirect();
    expect(locationAssign).toHaveBeenCalledWith("/login");
  });

  it("Scenario 8 — logout clears all storage and redirects to login", async () => {
    const auth = await loadAuthModule();

    await auth.storeAuth("logout-token", sampleUser("user"));
    expect(localStorage.getItem(TOKEN_KEY)).not.toBeNull();

    auth.clearAuth();
    auth.navigateAfterAuth("/login");

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_TIMESTAMP_KEY)).toBeNull();
    expect(readCookie(COOKIE_NAME)).toBeNull();
    expect(readCookie(SESSION_COOKIE)).toBeNull();
    expect(locationAssign).toHaveBeenCalledWith("/login");
  });

  it("Scenario 10 — navigateAfterAuth no-op without session", async () => {
    const auth = await loadAuthModule();
    auth.navigateAfterAuth("/dashboard");
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it("Scenario 9 — forgot password returns same generic message for any email", async () => {
    const auth = await loadAuthModule();
    const generic =
      "If an account exists, a password reset link will be sent.";

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, message: generic, email: "real@company.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, message: generic, email: "fake@nope.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const realMsg = await auth.forgotPassword("real@company.com");
    const fakeMsg = await auth.forgotPassword("fake@nope.com");

    expect(realMsg).toBe(generic);
    expect(fakeMsg).toBe(generic);
    expect(realMsg).toBe(fakeMsg);
  });
});
