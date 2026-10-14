export type SchoolPortalRole = 'admin' | 'teacher' | 'student'

export function schoolRolePath(slug: string, role: SchoolPortalRole | string): string {
  return `/cbt/${encodeURIComponent(slug)}/${encodeURIComponent(role.toLowerCase())}`
}
