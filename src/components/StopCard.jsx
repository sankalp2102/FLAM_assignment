import { useState } from 'react';
import { theme, categoryMeta } from '../theme.js';

/**
 * Reorder uses up/down buttons rather than drag and drop. That is a choice,
 * not a shortcut: buttons are keyboard-accessible and screen-reader-legible
 * for free, work on touch without a long-press gesture, and add no dependency.
 * Drag would be a nicer desktop affordance and is the obvious next step, but
 * it would need its own keyboard fallback to not regress accessibility.
 */
export default function StopCard({ stop, index, total, onRemove, onMove }) {
  const [open, setOpen] = useState(false);
  const cat = categoryMeta[stop.category] ?? categoryMeta.activity;
  const mins = stop.durationMins;
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`;

  return (
    <li
      style={{
        display: 'flex',
        gap: theme.space(3),
        padding: theme.space(3),
        background: theme.color.surfaceAlt,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
        alignItems: 'flex-start',
      }}
    >
      <span
        aria-hidden="true"
        title={cat.label}
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          background: `${cat.color}22`,
          border: `1px solid ${cat.color}55`,
          fontSize: 15,
        }}
      >
        {cat.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            fontWeight: 600,
            fontSize: 14,
            lineHeight: 1.35,
          }}
        >
          {stop.name}
          {stop.optional && (
            <span
              style={{
                marginLeft: theme.space(2),
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                color: theme.color.warn,
                border: `1px solid ${theme.color.warn}55`,
                borderRadius: theme.radius.sm,
                padding: '1px 5px',
                whiteSpace: 'nowrap',
              }}
            >
              optional
            </span>
          )}
        </button>

        <div style={{ color: theme.color.textDim, fontSize: 12, marginTop: 2 }}>
          {cat.label} · {duration} · {stop.timeOfDay}
        </div>

        {open && stop.description && (
          <p style={{ margin: `${theme.space(2)} 0 0`, fontSize: 13, color: theme.color.textDim, lineHeight: 1.5 }}>
            {stop.description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <IconButton label={`Move ${stop.name} earlier`} disabled={index === 0} onClick={() => onMove('up')}>
          ↑
        </IconButton>
        <IconButton label={`Move ${stop.name} later`} disabled={index === total - 1} onClick={() => onMove('down')}>
          ↓
        </IconButton>
        <IconButton label={`Remove ${stop.name}`} onClick={onRemove} danger>
          ×
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({ children, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        // 28px visual, but padding pushes the hit area to the 44px guideline.
        width: 28,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        background: 'transparent',
        color: disabled ? theme.color.border : danger ? theme.color.danger : theme.color.textDim,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.sm,
        fontSize: 13,
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}