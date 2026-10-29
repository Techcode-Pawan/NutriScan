export const SORTS: Array<{ key: string; label: string; order?: 'asc' | 'desc' }> = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'rating', label: 'INR rating', order: 'desc' },
  { key: 'name', label: 'Name', order: 'asc' },
  { key: 'sugar', label: 'Lowest sugar', order: 'asc' },
  { key: 'sodium', label: 'Lowest sodium', order: 'asc' },
  { key: 'saturatedFat', label: 'Lowest sat. fat', order: 'asc' },
  { key: 'protein', label: 'Most protein', order: 'desc' },
  { key: 'fiber', label: 'Most fibre', order: 'desc' },
];
