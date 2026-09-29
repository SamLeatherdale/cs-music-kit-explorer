import type { KitStatus, MusicKit, UserKitState } from '../lib/types';
import { RatingBar } from './RatingBar';

interface KitCardProps {
  kit: MusicKit;
  state: UserKitState;
  onRatingChange: (stars: UserKitState['stars']) => void;
  onStatusChange: (status: KitStatus | null) => void;
}

export function KitCard({ kit, state, onRatingChange, onStatusChange }: KitCardProps) {
  return (
    <article className="kit-card">
      <RatingBar
        value={state.stars}
        status={state.status}
        listened={state.listened}
        onRatingChange={onRatingChange}
        onStatusChange={onStatusChange}
      />
      <a className="kit-card__image-link" href={kit.url} target="_blank" rel="noreferrer">
        {kit.imageUrl ? (
          <img className="kit-card__image" src={kit.imageUrl} alt={`${kit.title} album art`} />
        ) : (
          <div className="kit-card__image kit-card__image--empty">No cover</div>
        )}
      </a>

      <div className="kit-card__body">
        <div className="kit-card__heading">
          <span className="kit-card__artist">{kit.artist}</span>
          <a href={kit.url} target="_blank" rel="noreferrer">
            <h2>{kit.name}</h2>
          </a>
        </div>

        <div className="kit-card__tags">
          <span>{kit.rarity}</span>
          {kit.stattrakPrice !== null && <span>StatTrak</span>}
        </div>

        <div className="kit-card__prices">
          <span>
            Normal <strong>{formatPrice(kit.normalPrice)}</strong>
          </span>
          <span>
            StatTrak <strong>{formatPrice(kit.stattrakPrice)}</strong>
          </span>
        </div>

        <div className="kit-card__meta">
          <span>{formatCount(kit.offers)} offers</span>
          <span>{formatCount(kit.markets)} markets</span>
          {kit.communityRating !== null && <span>Community {kit.communityRating.toFixed(1)} ★</span>}
        </div>
      </div>
    </article>
  );
}

function formatPrice(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(2)}`;
}

function formatCount(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}K`;
  return value.toLocaleString();
}
