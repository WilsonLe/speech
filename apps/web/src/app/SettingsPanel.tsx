import { useAppRoute } from './appRouteContext';

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
