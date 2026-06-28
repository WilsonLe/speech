import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedInstalledBaseModel } from './model-setup-fixture';

const gatesUrl = new URL(
  '../../../docs/planning/v0.6.0-content-budget-accessible-name-gates.json',
  import.meta.url,
);

let cachedGates: ContentBudgetAccessibleNameGates | undefined;

test('critical v0.6 surfaces stay within copy budgets', async ({ page }) => {
  const gates = await loadGates();
  for (const budgetCase of gates.criticalCopyBudgetCases) {
    await prepareBudgetRoute(page, budgetCase);
    const surface = page.locator(budgetCase.selector).first();
    await expect(surface, `${budgetCase.id} should render`).toBeVisible();

    const wordCount = await countVisibleInterfaceWords(surface);
    expect(
      wordCount,
      `${budgetCase.id} exceeded ${budgetCase.budgetSurface} budget: ${wordCount} > ${budgetCase.maxVisibleInterfaceWords}`,
    ).toBeLessThanOrEqual(budgetCase.maxVisibleInterfaceWords);
  }
});

test('critical primary actions have visible, accessible names', async ({ page }) => {
  const gates = await loadGates();
  for (const actionCase of gates.primaryActionCases) {
    if (actionCase.setup === 'seed-installed-base-model') {
      await seedInstalledBaseModel(page);
    } else {
      await page.goto(actionCase.route);
    }

    const control = page.getByRole(actionCase.role as 'button' | 'link', {
      name: actionCase.name,
      exact: true,
    });
    await expect(control, `${actionCase.route} should expose ${actionCase.name}`).toBeVisible();
    await expect(control).toHaveAccessibleName(actionCase.name);
  }
});

test('interactive controls are named across task routes', async ({ page }) => {
  const gates = await loadGates();
  for (const route of gates.accessibleNameRoutes) {
    await page.goto(route);
    const unnamedControls = await collectUnnamedControls(page);
    expect(unnamedControls, `${route} has unnamed interactive controls`).toEqual([]);
  }
});

test('default workflows avoid unexplained internal terminology', async ({ page }) => {
  const gates = await loadGates();
  const forbidden = gates.forbiddenDefaultWorkflowTerms.map(
    (term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i'),
  );

  for (const route of gates.defaultWorkflowRoutesForTerminologyScan) {
    if (route === '/') {
      await seedInstalledBaseModel(page);
    } else {
      await page.goto(route);
    }
    const visibleText = normalizeVisibleText(await page.locator('main').innerText());
    const hits = gates.forbiddenDefaultWorkflowTerms.filter((term, index) =>
      forbidden[index]?.test(visibleText),
    );
    expect(hits, `${route} exposes internal terminology by default`).toEqual([]);
  }
});

async function loadGates(): Promise<ContentBudgetAccessibleNameGates> {
  cachedGates ??= JSON.parse(await readFile(gatesUrl, 'utf8')) as ContentBudgetAccessibleNameGates;
  return cachedGates;
}

async function prepareBudgetRoute(page: Page, budgetCase: CriticalCopyBudgetCase): Promise<void> {
  if (budgetCase.setup === 'seed-installed-base-model') {
    await seedInstalledBaseModel(page);
    return;
  }
  await page.goto(budgetCase.route);
}

async function countVisibleInterfaceWords(locator: Locator): Promise<number> {
  const text = normalizeVisibleText(await locator.innerText());
  if (!text) return 0;
  return (text.match(/[0-9]+(?:[.,][0-9]+)?|[\p{L}]+(?:['’.-][\p{L}]+)*/gu) ?? []).length;
}

async function collectUnnamedControls(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    function textFromIds(ids: string | null): string {
      return (ids ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
    }

    function controlName(element: Element): string {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const ariaLabelledBy = textFromIds(element.getAttribute('aria-labelledby'));
      if (ariaLabelledBy) return ariaLabelledBy;
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        const labels = [...element.labels]
          .map((label) => label.textContent?.trim() ?? '')
          .join(' ')
          .trim();
        if (labels) return labels;
      }
      return (element as HTMLElement).innerText?.trim() ?? element.textContent?.trim() ?? '';
    }

    function isVisibleInteractive(element: Element): boolean {
      if (element.closest('details:not([open])')) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return element.getClientRects().length > 0;
    }

    const interactiveSelector = [
      'button:not([aria-hidden="true"])',
      'a[href]:not([aria-hidden="true"])',
      'input:not([type="hidden"]):not([aria-hidden="true"])',
      'select:not([aria-hidden="true"])',
      'textarea:not([aria-hidden="true"])',
    ].join(',');

    return [...document.querySelectorAll(interactiveSelector)]
      .filter((element) => !element.hasAttribute('disabled'))
      .filter(isVisibleInteractive)
      .filter((element) => controlName(element).length === 0)
      .map((element) => element.outerHTML.slice(0, 180));
  });
}

function normalizeVisibleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ContentBudgetAccessibleNameGates {
  readonly criticalCopyBudgetCases: readonly CriticalCopyBudgetCase[];
  readonly primaryActionCases: readonly PrimaryActionCase[];
  readonly accessibleNameRoutes: readonly string[];
  readonly defaultWorkflowRoutesForTerminologyScan: readonly string[];
  readonly forbiddenDefaultWorkflowTerms: readonly string[];
}

interface CriticalCopyBudgetCase {
  readonly id: string;
  readonly route: string;
  readonly selector: string;
  readonly budgetSurface: string;
  readonly maxVisibleInterfaceWords: number;
  readonly setup?: string;
}

interface PrimaryActionCase {
  readonly route: string;
  readonly role: 'button' | 'link';
  readonly name: string;
  readonly setup?: string;
}
