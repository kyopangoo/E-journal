import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon } from '../components/Icons.jsx';
import { Hero, Notice, Panel, Split } from '../components/ui.jsx';

const FALLBACK_ACCENTS = [
  { name: 'Yellow', value: '#FFEB3B' },
  { name: 'Red', value: '#FF5252' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Violet', value: '#BA68C8' },
];

export default function AppearancePage() {
  const { preferences, applyPreferences } = useAuth();

  const [draft, setDraft] = useState(preferences);
  const [accents, setAccents] = useState(FALLBACK_ACCENTS);
  const [state, setState] = useState({ busy: false, error: '', success: '' });

  useEffect(() => {
    let active = true;
    api
      .get('/appearance')
      .then((data) => {
        if (active) setAccents(data.accents ?? FALLBACK_ACCENTS);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function update(patch) {
    const next = { ...draft, ...patch };
    setDraft(next);
    applyPreferences(next);
    setState((current) => ({ ...current, success: '' }));
  }

  async function save(event) {
    event.preventDefault();
    setState({ busy: true, error: '', success: '' });
    try {
      const data = await api.put('/appearance', draft);
      applyPreferences(data.preferences);
      setDraft((current) => ({ ...current, ...data.preferences }));
      setState({ busy: false, error: '', success: 'Preferences saved.' });
    } catch (error) {
      setState({ busy: false, error: error.message, success: '' });
    }
  }

  return (
    <>
      <Hero
        eyebrow="Preferences"
        title="Appearance"
        lead="Tune the workspace to how you like to read and work. Changes preview instantly across every page, then save to your profile."
        chips={['Theme', 'Accent', 'Text size', 'Density']}
        actions={
          <button type="submit" form="appearance-form" className="btn btn--primary" disabled={state.busy}>
            {state.busy ? 'Saving…' : 'Save preferences'}
          </button>
        }
      />

      <Split
        railWide
        aside={
          <Panel title="Live preview" subtitle="This panel is drawn with your current settings.">
            <div className="stage">
              <div className="stage__bar">
                <span className="stage__dot stage__dot--brand" />
                <span className="stage__dot" />
                <span className="stage__dot" />
                <span className="stage__caption">
                  {draft.theme} · {Math.round(draft.fontScale * 100)}% · {draft.density}
                </span>
              </div>

              <div className="stage__mini">
                <p className="hero__eyebrow">Workspace</p>
                <p className="stage__mini-title">E-Journey</p>
                <p className="stage__mini-text">
                  Focal bands, cards, and controls all derive from your accent colour.
                </p>
              </div>

              <div className="stage__tiles">
                <div className="stage__tile">
                  <p className="stage__tile-value">24</p>
                  <p className="stage__tile-label">stat tile</p>
                </div>
                <div className="stage__tile">
                  <span className="badge badge--admin">admin</span>
                  <p className="stage__tile-label" style={{ marginTop: 8 }}>
                    badge
                  </p>
                </div>
              </div>

              <div className="progress-bar">
                <div className="progress-bar__fill" style={{ width: '62%' }} />
              </div>

              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn--primary btn--sm">
                  Primary
                </button>
                <button type="button" className="btn btn--outline btn--sm">
                  Outline
                </button>
                <button type="button" className="btn btn--ghost btn--sm">
                  Ghost
                </button>
              </div>
            </div>
          </Panel>
        }
      >
        <Panel title="Preferences" subtitle="Changes preview instantly and save to your profile.">
          <Notice tone="error">{state.error}</Notice>
          <Notice tone="success">{state.success}</Notice>

          <form id="appearance-form" onSubmit={save}>
            <div className="field">
              <span className="field__label">Colour mode</span>
              <div className="segmented">
                {['light', 'dark'].map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    className={draft.theme === theme ? 'is-active' : ''}
                    onClick={() => update({ theme })}
                  >
                    <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
                    <span style={{ marginLeft: 6 }}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field__label">Accent colour</span>
              <div className="swatches">
                {accents.map((accent) => (
                  <button
                    type="button"
                    key={accent.value}
                    className={`swatch${draft.accent.toLowerCase() === accent.value.toLowerCase() ? ' is-active' : ''}`}
                    style={{ background: accent.value }}
                    onClick={() => update({ accent: accent.value })}
                    title={accent.name}
                    aria-label={`Use ${accent.name} accent`}
                  >
                    {draft.accent.toLowerCase() === accent.value.toLowerCase() ? (
                      <Icon name="check" size={16} />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span className="field__label">Text size — {Math.round(draft.fontScale * 100)}%</span>
              <input
                type="range"
                min="0.85"
                max="1.35"
                step="0.05"
                value={draft.fontScale}
                onChange={(event) => update({ fontScale: Number(event.target.value) })}
              />
            </label>

            <div className="field">
              <span className="field__label">Density</span>
              <div className="segmented">
                {['comfortable', 'compact'].map((density) => (
                  <button
                    type="button"
                    key={density}
                    className={draft.density === density ? 'is-active' : ''}
                    onClick={() => update({ density })}
                  >
                    {density}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="btn btn--primary" disabled={state.busy}>
              {state.busy ? 'Saving…' : 'Save preferences'}
            </button>
          </form>
        </Panel>
      </Split>

      <button
        type="button"
        className="scroll-to-bottom"
        title="Scroll to bottom"
        onClick={() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }}
      >
        <Icon name="down" size={16} />
      </button>
    </>
  );
}
