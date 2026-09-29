import { useState } from 'react';
import type { CSSProperties, MouseEvent, SyntheticEvent } from 'react';
import { listenDotLabel } from '../lib/listening';
import type { KitStatus, ListenProgress, Rating } from '../lib/types';
import './rating-bar.css';

const RATING_COLORS = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#3b82f6',
  5: '#22c55e',
} as const;

function ratingColor(value: Rating): string {
  return RATING_COLORS[Math.ceil(value) as keyof typeof RATING_COLORS];
}

function ratingFromPointer(star: number, event: MouseEvent<HTMLButtonElement>): Rating {
  const bounds = event.currentTarget.getBoundingClientRect();
  const leftHalf = event.clientX - bounds.left < bounds.width / 2;
  return (leftHalf ? star - 0.5 : star) as Rating;
}

function starFill(star: number, shown: Rating | null): string {
  if (shown == null) return '';
  if (shown >= star) return 'is-on';
  if (shown + 0.5 >= star) return 'is-half';
  return '';
}

const STATUSES: { value: KitStatus | ''; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'owned', label: 'Owned' },
  { value: 'wishlisted', label: 'Wishlisted' },
  { value: 'sold', label: 'Sold' },
];

interface RatingBarProps {
  value: Rating | null;
  status: KitStatus | null;
  listened?: ListenProgress | null;
  onRatingChange: (value: Rating | null) => void;
  onStatusChange: (status: KitStatus | null) => void;
  onLayout?: (height: number) => void;
}

export function RatingBar({
  value,
  status,
  listened = null,
  onRatingChange,
  onStatusChange,
  onLayout,
}: RatingBarProps) {
  const [hover, setHover] = useState<Rating | null>(null);
  const shown = hover ?? value;

  return (
    <div
      className="mkr-bar"
      style={{ '--mkr-color': shown ? ratingColor(shown) : '#475569' } as CSSProperties}
      ref={(node) => {
        if (node) onLayout?.(node.offsetHeight);
      }}
      onMouseLeave={() => setHover(null)}
      onMouseDown={stopEvent}
      onClick={stopEvent}
    >
      <span
        className={`mkr-listen mkr-listen--${listened ?? 'empty'}`}
        title={listenDotLabel(listened)}
        aria-label={listenDotLabel(listened)}
      />
      <div
        className="mkr-stars"
        aria-label={shown == null ? 'Your rating' : `Your rating, ${shown} stars`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            className={`mkr-star ${starFill(star, shown)}`}
            type="button"
            aria-label={`${star - 0.5} or ${star} stars`}
            aria-pressed={value === star || value === star - 0.5}
            onMouseMove={(event) => setHover(ratingFromPointer(star, event))}
            onClick={(event) => {
              stopEvent(event);
              const next = ratingFromPointer(star, event);
              onRatingChange(value === next ? null : next);
            }}
          >
            <span className="mkr-star__glyph" aria-hidden="true">
              ★
            </span>
            <span className="mkr-star__fill" aria-hidden="true">
              <span>★</span>
            </span>
          </button>
        ))}
      </div>
      <select
        className={`mkr-status mkr-status--${status ?? 'none'}`}
        aria-label="Collection status"
        value={status ?? ''}
        onChange={(event) => {
          stopEvent(event);
          const next = event.target.value;
          onStatusChange(next === '' ? null : (next as KitStatus));
        }}
      >
        {STATUSES.map((option) => (
          <option key={option.value || 'none'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function stopEvent(event: SyntheticEvent) {
  event.stopPropagation();
  if ((event.target as HTMLElement | null)?.closest('select')) return;
  event.preventDefault();
}
