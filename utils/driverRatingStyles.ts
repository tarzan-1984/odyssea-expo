export type RatingStyle = {
  backgroundColor: string;
  color: string;
};

export function getDriverRatingStyle(
  rating: number | null | undefined
): RatingStyle {
  if (rating == null || rating <= 0 || Number.isNaN(rating)) {
    return { backgroundColor: '#616161', color: '#FFFFFF' };
  }
  if (rating >= 4) {
    return { backgroundColor: '#2E7D32', color: '#FFFFFF' };
  }
  if (rating >= 3) {
    return { backgroundColor: '#FBC02D', color: '#000000' };
  }
  if (rating >= 2) {
    return { backgroundColor: '#EF6C00', color: '#FFFFFF' };
  }
  return { backgroundColor: '#C62828', color: '#FFFFFF' };
}

export function formatRatingButtonValue(
  avgRating: number | null | undefined
): string {
  if (avgRating == null || Number.isNaN(Number(avgRating)) || Number(avgRating) <= 0) {
    return '—';
  }
  return String(Math.round(Number(avgRating)));
}
