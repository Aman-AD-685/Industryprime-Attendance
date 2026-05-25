/** Token-based email approve/reject routes — no app session required. */
export function isLeaveEmailPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/leave/decision") ||
    pathname.startsWith("/leave/reject") ||
    (pathname.startsWith("/leaves/") && pathname.endsWith("/decide")) ||
    (pathname.startsWith("/leave/requests/") && pathname.endsWith("/decide"))
  );
}
