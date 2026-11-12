export function projectTitleParts(data: {
  title: string;
  year?: number | null;
  yearEnd?: number | null;
}): { title: string; years?: string };

export function projectLabel(data: {
  title: string;
  year?: number | null;
  yearEnd?: number | null;
}): string;

export function yearRange(start?: number | null, end?: number | null): string | undefined;
