/**
 * Theme picker (P13b): the three themes as clickable preview cards. Each card sets its own
 * `data-theme`, so it shows that theme's real tokens whatever the page's theme is. A radio group
 * underneath, so it works with the keyboard (arrow keys) and screen readers.
 * Used on the Settings tab and on the welcome page.
 */
import { THEMES, THEME_IDS, type ThemeId } from './themes';
import CategoryChip from './CategoryChip';
import { CheckIcon } from './icons';
import { useTheme } from './use-theme';

function Preview() {
  return (
    <div className="sl-preview" aria-hidden="true">
      <div className="sl-preview-head">
        <img src="/icon/32.png" alt="" width={18} height={18} className="sl-logo" />
        <strong>StudyLens</strong>
      </div>
      <div className="sl-preview-body">
        <div className="sl-preview-title">Ready to focus?</div>
        <div className="sl-preview-btn">Start focus session</div>
        <div className="sl-row" style={{ flexWrap: 'wrap', gap: 4 }}>
          <CategoryChip category="study" />
          <CategoryChip category="neutral" />
          <CategoryChip category="distraction" />
        </div>
        <div className="sl-track" style={{ display: 'flex', gap: 2 }}>
          <div className="sl-fill sl-fill-study" style={{ flex: 6 }} />
          <div className="sl-fill sl-fill-neutral" style={{ flex: 2 }} />
          <div className="sl-fill sl-fill-distraction" style={{ flex: 2 }} />
        </div>
      </div>
    </div>
  );
}

export default function ThemePicker({ onPicked }: { onPicked?: (theme: ThemeId) => void }) {
  const { theme, setTheme, saveError } = useTheme();
  return (
    <div>
      <div className="sl-theme-grid" role="radiogroup" aria-label="Theme">
        {THEME_IDS.map((id) => {
          const t = THEMES[id];
          const checked = theme === id;
          return (
            <label key={id} className="sl-theme-card" data-theme={id} data-checked={checked}>
              <input
                type="radio"
                name="sl-theme"
                value={id}
                checked={checked}
                onChange={() => {
                  setTheme(id);
                  onPicked?.(id);
                }}
                aria-describedby={`sl-theme-${id}-desc`}
              />
              <Preview />
              <span className="sl-theme-name">
                {t.name}
                {checked && (
                  <span className="sl-theme-check">
                    <CheckIcon /> Selected
                  </span>
                )}
              </span>
              <span id={`sl-theme-${id}-desc`} className="sl-theme-tagline">
                {t.tagline}
              </span>
            </label>
          );
        })}
      </div>
      {saveError && (
        <p role="alert" className="sl-error">
          {saveError}
        </p>
      )}
    </div>
  );
}
