export function projectTitleParts(data) {
  const years = yearRange(data?.year, data?.yearEnd);
  return years ? { title: data.title, years } : { title: data.title };
}

export function projectLabel(data) {
  const { title, years } = projectTitleParts(data);
  return years ? `${title}, ${years}` : title;
}

export function yearRange(start, end) {
  if (start == null) return end == null ? undefined : String(end);
  if (end == null || end === start) return String(start);
  return `${start} \u2013 ${end}`;
}
