import { useEffect, useMemo, useState } from 'react';
import packageMetadata from '../../package.json';
import {
  activatePwaUpdate,
  getPwaLifecycleSnapshot,
  subscribePwaLifecycle,
  type PwaLifecycleSnapshot,
} from './pwa-lifecycle';
import { buildAboutScreenModel } from './about-screen';

export function AboutPanel() {
  const [pwa, setPwa] = useState<PwaLifecycleSnapshot>(() => getPwaLifecycleSnapshot());
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const about = useMemo(
    () => buildAboutScreenModel({ appVersion: packageMetadata.version, pwa }),
    [pwa],
  );

  useEffect(() => subscribePwaLifecycle(setPwa), []);

  async function handleUpdate() {
    try {
      await activatePwaUpdate();
      setUpdateStatus('Update requested. The app will reload when the new shell is ready.');
    } catch {
      setUpdateStatus('Update needs attention. Reload the app when active work is safe.');
    }
  }

  return (
    <section className="about-screen" aria-labelledby="about-title">
      <div className="section-heading">
        <p className="eyebrow">App information</p>
        <h2 id="about-title">About</h2>
        <p>Version, source, licenses, model provenance, acknowledgements, and update state.</p>
      </div>

      <div className="about-summary" aria-label="Application summary">
        <div>
          <span className="about-label">Version</span>
          <strong>{about.version}</strong>
        </div>
        <div>
          <span className="about-label">Source</span>
          <a href={about.sourceRepository.href} target="_blank" rel="noreferrer noopener">
            {about.sourceRepository.label}
          </a>
        </div>
        <div>
          <span className="about-label">Code license</span>
          <a href={about.codeLicense.href} target="_blank" rel="noreferrer noopener">
            {about.codeLicense.label}
          </a>
        </div>
      </div>

      <section className="about-update" aria-labelledby="about-update-title">
        <h3 id="about-update-title">Update state</h3>
        <p>
          <strong>{about.updateState.label}</strong> — {about.updateState.detail}
        </p>
        {about.updateState.actionLabel ? (
          <button type="button" onClick={() => void handleUpdate()}>
            {about.updateState.actionLabel}
          </button>
        ) : null}
        {updateStatus ? <p role="status">{updateStatus}</p> : null}
      </section>

      <div className="about-grid">
        <section className="about-card" aria-labelledby="about-models-title">
          <h3 id="about-models-title">Models and provenance</h3>
          <ul>
            {about.modelProvenance.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer noopener">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="about-card" aria-labelledby="about-acknowledgements-title">
          <h3 id="about-acknowledgements-title">Acknowledgements</h3>
          <ul>
            {about.acknowledgements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
