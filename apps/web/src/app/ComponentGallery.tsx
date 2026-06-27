import {
  auditSpeechPrimitiveInteractionCoverage,
  speechPrimitiveAccessibilityExamples,
  speechPrimitiveInteractionRequirements,
  speechPrimitiveTestingUsageGuide,
} from '@speech/ui/testing';
import '@speech/ui/primitives.css';
import '@speech/ui/feedback.css';
import './ComponentGallery.css';

const usageRules = [
  'Use the gallery only in local development through the #ui-gallery hash route.',
  'Keep examples synthetic and task-focused; do not add domain workers, storage, audio, archive, encryption, profile, transcript, or vocabulary fixtures.',
  'Required actions, blockers, privacy consequences, destructive consequences, and recovery text must stay visible outside tooltips, menus, toasts, and collapsed panels.',
  'Prefer native semantics and the repository-owned primitives before creating one-off application controls.',
  'When a primitive changes, update @speech/ui/testing examples before updating feature-screen fixtures.',
] as const;

const contentRules = [
  'Visible gallery copy should identify a control, state, consequence, or accessibility rule.',
  'Default UI examples use v0.6 terminology such as Voice model, Speech model, Vocabulary, Quality check, and Device storage.',
  'Technical implementation terms belong in diagnostics or advanced sections, not ordinary workflow examples.',
] as const;

export function ComponentGallery() {
  const coverage = auditSpeechPrimitiveInteractionCoverage();

  return (
    <main className="component-gallery" aria-labelledby="component-gallery-title">
      <header className="component-gallery__header">
        <p className="component-gallery__eyebrow">Development only</p>
        <h1 id="component-gallery-title">Component gallery</h1>
        <p>
          Repository-owned examples for the v0.6 task-first primitives. This route is not linked
          from production navigation and should remain outside the default Dictate path.
        </p>
      </header>

      <section className="component-gallery__section" aria-labelledby="component-gallery-rules">
        <h2 id="component-gallery-rules">Usage rules</h2>
        <div className="component-gallery__columns">
          <div>
            <h3>Component use</h3>
            <ul>
              {usageRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Content style</h3>
            <ul>
              {contentRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Accessibility constraints</h3>
            <ul>
              {speechPrimitiveTestingUsageGuide.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="component-gallery__section" aria-labelledby="component-gallery-coverage">
        <h2 id="component-gallery-coverage">Interaction coverage</h2>
        <dl className="component-gallery__metrics">
          <div>
            <dt>Primitive examples</dt>
            <dd>{coverage.exampleCount}</dd>
          </div>
          <div>
            <dt>Covered requirements</dt>
            <dd>{coverage.coveredRequirements.length}</dd>
          </div>
          <div>
            <dt>Missing requirements</dt>
            <dd>{coverage.missingRequirements.length}</dd>
          </div>
        </dl>
        <ul className="component-gallery__chips" aria-label="Required interaction categories">
          {speechPrimitiveInteractionRequirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </section>

      <section className="component-gallery__section" aria-labelledby="component-gallery-examples">
        <h2 id="component-gallery-examples">Primitive examples</h2>
        <div className="component-gallery__grid">
          {speechPrimitiveAccessibilityExamples.map((example) => (
            <article className="component-gallery__card" key={example.id}>
              <div className="component-gallery__card-header">
                <div>
                  <h3>{example.primitive}</h3>
                  <p>{example.purpose}</p>
                </div>
                <span>{example.id}</span>
              </div>
              <div className="component-gallery__preview">{example.element}</div>
              <dl className="component-gallery__example-meta">
                <div>
                  <dt>Keyboard</dt>
                  <dd>{example.keyboardKeys?.join(', ') || 'Native semantics'}</dd>
                </div>
                <div>
                  <dt>CSS entry</dt>
                  <dd>{example.cssEntry}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default ComponentGallery;
