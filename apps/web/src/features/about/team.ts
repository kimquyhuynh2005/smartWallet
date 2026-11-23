/**
 * EDIT HERE: placeholder team. Replace `name` with the real member names
 * (role titles are translated in locales/{vi,en}/about.json under team.roles.<role>).
 */
export type TeamRole = 'pm' | 'backend' | 'frontend' | 'design' | 'tester';

export const TEAM: ReadonlyArray<{ role: TeamRole; name: string }> = [
  { role: 'pm', name: 'Nguyễn Minh Anh' },
  { role: 'backend', name: 'Trần Quốc Bảo' },
  { role: 'frontend', name: 'Lê Thu Hà' },
  { role: 'design', name: 'Phạm Ngọc Linh' },
  { role: 'tester', name: 'Võ Đức Khoa' },
];
