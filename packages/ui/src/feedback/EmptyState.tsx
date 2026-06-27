import { type HTMLAttributes, type ReactNode } from 'react';
import { mergeClassNames, useResolvedId } from './shared';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly title: ReactNode;
  readonly titleId?: string;
}

export function EmptyState({
  actions,
  children,
  className,
  description,
  title,
  titleId,
  ...props
}: EmptyStateProps) {
  const resolvedTitleId = useResolvedId(titleId, 'empty-title');

  return (
    <section
      {...props}
      aria-labelledby={resolvedTitleId}
      className={mergeClassNames('speech-empty-state', className)}
    >
      <div className="speech-empty-state__content">
        <h2 className="speech-empty-state__title" id={resolvedTitleId}>
          {title}
        </h2>
        {description ? <p className="speech-empty-state__description">{description}</p> : null}
        {children ? <div className="speech-empty-state__body">{children}</div> : null}
      </div>
      {actions ? <div className="speech-empty-state__actions">{actions}</div> : null}
    </section>
  );
}
