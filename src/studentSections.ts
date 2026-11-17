export const STUDENT_SECTIONS = [
  'SSS 1 Science',
  'SSS 1 Art',
  'SSS 1 Commercial',
  'SSS 2 Science',
  'SSS 2 Art',
  'SSS 2 Commercial',
  'SSS 3 Science',
  'SSS 3 Art',
  'SSS 3 Commercial'
] as const

export function isStudentSection(value: string) {
  return STUDENT_SECTIONS.some((section) => section.toLowerCase() === value.trim().toLowerCase())
}
