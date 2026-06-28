import { useAppRoute } from './appRouteContext';
import { buildPrivacyScreenSummary, buildShortcutGroups } from './settings-screens';

interface SettingsDestination {
  readonly label: string;
  readonly href?: string;
  readonly description: string;
  readonly status?: string;
}

const settingsDestinations: readonly SettingsDestination[] = [
  {
    label: 'Audio',
    href: '/settings/audio',
    description: 'Microphone, recording mode, input test, and calibration.',
  },
  {
    label: 'Appearance',
    description: 'Uses your system appearance. No separate theme preference is implemented yet.',
    status: 'System',
  },
  {
    label: 'Storage',
    href: '/settings/storage',
    description: 'Speech model downloads and local data management.',
  },
  {
    label: 'Privacy',
    href: '/settings/privacy',
    description: 'Local data controls and privacy notes.',
  },
  {
    label: 'Keyboard shortcuts',
    href: '/settings/shortcuts',
    description: 'Keyboard controls for recording and navigation.',
  },
  {
    label: 'Diagnostics',
    href: '/settings/diagnostics',
    description: 'Browser, runtime, benchmark, and support-bundle details.',
  },
  {
    label: 'About',
    href: '/about',
    description: 'Version, source, licenses, and acknowledgements.',
  },
];

export function SettingsPanel() {
  const route = useAppRoute();

  if (route.routeId === 'settings-privacy') {
    return <PrivacyScreen />;
  }

  if (route.routeId === 'settings-shortcuts') {
    return <ShortcutsScreen />;
  }

  if (route.routeId !== 'settings-index') {
    return null;
  }

  return (
    <section className="settings-screen panel" aria-labelledby="settings-title">
      <div className="section-heading settings-screen__heading">
        <p className="eyebrow">Settings</p>
        <h2 id="settings-title">Settings</h2>
      </div>

      <div className="settings-list" aria-label="Settings sections">
        {settingsDestinations.map((destination) => (
          <article className="settings-list-row" key={destination.label}>
            <div>
              <h3>{destination.label}</h3>
              <p>{destination.description}</p>
            </div>
            {destination.href ? (
              <a
                aria-label={`Open ${destination.label}`}
                className="button secondary"
                href={destination.href}
              >
                Open
              </a>
            ) : (
              <span className="settings-list-row__status">{destination.status}</span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function PrivacyScreen() {
  const summary = buildPrivacyScreenSummary();

  return (
    <section className="settings-screen privacy-screen panel" aria-labelledby="privacy-title">
      <div className="section-heading settings-screen__heading">
        <p className="eyebrow">Privacy</p>
        <h2 id="privacy-title">Privacy</h2>
        <p>{summary.statement}</p>
      </div>

      <div className="privacy-actions" aria-label="Privacy controls">
        {summary.controls.map((action) => (
          <article className="privacy-action-card" key={action.label} data-kind={action.kind}>
            <div>
              <h3>{action.label}</h3>
              <p>{action.description}</p>
            </div>
            <a
              aria-label={action.kind === 'docs' ? action.label : `Open ${action.label}`}
              className="button secondary"
              href={action.href}
              rel={action.kind === 'docs' ? 'noreferrer noopener' : undefined}
              target={action.kind === 'docs' ? '_blank' : undefined}
            >
              Open
            </a>
          </article>
        ))}
      </div>

      <article className="privacy-network-result" aria-labelledby="privacy-network-title">
        <p className="eyebrow">Network isolation</p>
        <h3 id="privacy-network-title">{summary.networkIsolation.label}</h3>
        <p>{summary.networkIsolation.detail}</p>
      </article>

      <section className="privacy-boundaries" aria-labelledby="privacy-boundaries-title">
        <h3 id="privacy-boundaries-title">Local data boundaries</h3>
        <ul>
          {summary.visibleBoundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function ShortcutsScreen() {
  const groups = buildShortcutGroups();

  return (
    <section className="settings-screen shortcuts-screen panel" aria-labelledby="shortcuts-title">
      <div className="section-heading settings-screen__heading">
        <p className="eyebrow">Keyboard shortcuts</p>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <p>Shortcuts work only in their listed scope.</p>
      </div>

      <div className="shortcuts-list" aria-label="Keyboard shortcut groups">
        {groups.map((group) => (
          <section
            className="shortcuts-group"
            aria-labelledby={`shortcut-${slugify(group.title)}`}
            key={group.title}
          >
            <h3 id={`shortcut-${slugify(group.title)}`}>{group.title}</h3>
            <dl>
              {group.shortcuts.map((shortcut) => (
                <div
                  className="shortcut-row"
                  key={`${group.title}-${shortcut.keys.join('-')}-${shortcut.action}`}
                >
                  <dt>
                    {shortcut.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>
                    <span>{shortcut.action}</span>
                    <small>{shortcut.scope}</small>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
