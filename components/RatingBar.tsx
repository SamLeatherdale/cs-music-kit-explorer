import { useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { listenDotLabel } from '../lib/listening';
import type { ListenProgress, Rating } from '../lib/types';
import './rating-bar.css';

const RATING_COLORS: Record<Rating, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#3b82f6',
  5: '#22c55e',
};

interface RatingBarProps {
  value: Rating | null;
  owned: boolean;
  listened?: ListenProgress | null;
  onRatingChange: (value: Rating | null) => void;
  onOwnedChange: (owned: boolean) => void;
  onLayout?: (height: number) => void;
}

export function RatingBar({
  value,
  owned,
  listened = null,
  onRatingChange,
  onOwnedChange,
  onLayout,
}: RatingBarProps) {
  const [hover, setHover] = useState<Rating | null>(null);
  const shown = hover ?? value;

  return (
    <div
      className="mkr-bar"
      style={{ '--mkr-color': shown ? RATING_COLORS[shown] : '#475569' } as CSSProperties}
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
      <div className="mkr-stars" aria-label="Your rating">
        {([1, 2, 3, 4, 5] as Rating[]).map((star) => (
          <button
            key={star}
            className={`mkr-star ${shown !== null && star <= shown ? 'is-on' : ''}`}
            type="button"
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            aria-pressed={value === star}
            onMouseEnter={() => setHover(star)}
            onClick={(event) => {
              stopEvent(event);
              onRatingChange(value === star ? null : star);
            }}
          >
            ★
          </button>
        ))}
      </div>
      <button
        className={`mkr-owned ${owned ? 'is-on' : ''}`}
        type="button"
        aria-pressed={owned}
        onClick={(event) => {
          stopEvent(event);
          onOwnedChange(!owned);
        }}
      >
        Owned
      </button>
    </div>
  );
}

function stopEvent(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}
