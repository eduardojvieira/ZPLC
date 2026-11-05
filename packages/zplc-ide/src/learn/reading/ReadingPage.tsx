/**
 * The renderer of a lesson reading page (LRN-040, LRN-041): the parsed blocks as React elements. Text is always a React text
 * node, so a line that looks like HTML is shown as text; nothing here sets inner HTML.
 */
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import type { ReadingAlign, ReadingBlock, ReadingCalloutKind, ReadingInline } from '../readingTypes';
import { LdFigure } from './LdFigure';
import { LdTry } from './LdTry';
import { Quiz } from './Quiz';
import { TimingDiagram } from './TimingDiagram';

export interface ReadingPageProps {
  lessonId: string;
  blocks: ReadingBlock[];
  /** Package-relative path to file text, for every file a live block references. */
  files: Record<string, string>;
  /** The URL of a package image, or undefined when the package does not have it. */
  resolveImage: (src: string) => string | undefined;
}

function Inlines({ nodes }: { nodes: ReadingInline[] }): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return <strong key={index}>{<Inlines nodes={node.children} />}</strong>;
      case 'emphasis':
        return <em key={index}>{<Inlines nodes={node.children} />}</em>;
      case 'code':
        return (
          <code key={index} className="rounded bg-[var(--tone-neutral-bg)] px-1 font-mono text-[0.9em]">
            {node.value}
          </code>
        );
    }
  });
}

const ALIGN: Record<NonNullable<ReadingAlign>, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };
const CALLOUT_TONE: Record<ReadingCalloutKind, string> = {
  note: 'border-[var(--tone-info-border)] bg-[var(--tone-info-bg)]',
  tip: 'border-[var(--tone-success-border)] bg-[var(--tone-success-bg)]',
  warning: 'border-[var(--tone-warning-border)] bg-[var(--tone-warning-bg)]',
};

function Blocks({ blocks, page }: { blocks: ReadingBlock[]; page: ReadingPageProps }): ReactNode {
  return blocks.map((block, index) => <BlockView key={index} block={block} page={page} />);
}

function BlockView({ block, page }: { block: ReadingBlock; page: ReadingPageProps }) {
  const { t } = useT();
  switch (block.type) {
    case 'heading': {
      const Heading = block.depth === 2 ? 'h2' : 'h3';
      return (
        <Heading className={`${block.depth === 2 ? 'mt-8 text-xl' : 'mt-6 text-lg'} font-semibold text-[var(--text-primary)]`}>
          <Inlines nodes={block.children} />
        </Heading>
      );
    }
    case 'paragraph':
      return (
        <p className="my-3">
          <Inlines nodes={block.children} />
        </p>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List className={`my-3 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, index) => (
            <li key={index} className="my-1">
              <Blocks blocks={item} page={page} />
            </li>
          ))}
        </List>
      );
    }
    case 'table':
      return (
        <div className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.header.map((cell, column) => (
                  <th
                    key={column}
                    scope="col"
                    className={`border-b border-[var(--border-color)] px-2 py-1 ${ALIGN[block.align[column] ?? 'left']}`}
                  >
                    <Inlines nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column} className={`border-b border-[var(--border-color)] px-2 py-1 ${ALIGN[block.align[column] ?? 'left']}`}>
                      <Inlines nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout':
      return (
        <div
          role="note"
          aria-label={t(`learnReading.callout.${block.kind}`)}
          data-callout={block.kind}
          className={`my-4 rounded border-l-4 p-3 ${CALLOUT_TONE[block.kind]}`}
        >
          <p className="m-0 font-semibold">{t(`learnReading.callout.${block.kind}`)}</p>
          <Blocks blocks={block.children} page={page} />
        </div>
      );
    case 'code':
      return (
        <pre className="my-4 overflow-x-auto rounded bg-[var(--tone-neutral-bg)] p-3 font-mono text-sm" data-lang={block.lang || undefined}>
          <code>{block.value}</code>
        </pre>
      );
    case 'image': {
      const url = page.resolveImage(block.src);
      return (
        <figure className="my-4" data-reading-block="image">
          {url === undefined ? (
            <p data-image-missing className="italic text-[var(--text-secondary)]">
              {block.alt}
            </p>
          ) : (
            <img src={url} alt={block.alt} className="h-auto max-w-full" />
          )}
        </figure>
      );
    }
    case 'rule':
      return <hr className="my-6 border-[var(--border-color)]" />;
    case 'directive': {
      const { directive } = block;
      switch (directive.kind) {
        case 'ld-figure':
          return <LdFigure data={directive.data} files={page.files} />;
        case 'ld-try':
          return <LdTry data={directive.data} files={page.files} />;
        case 'timing':
          return <TimingDiagram data={directive.data} />;
        case 'quiz':
          return <Quiz data={directive.data} />;
      }
    }
  }
}

export function ReadingPage(props: ReadingPageProps) {
  return (
    <div data-reading-page={props.lessonId} className="mx-auto w-full max-w-[70ch] leading-7 text-[var(--text-primary)]">
      <Blocks blocks={props.blocks} page={props} />
    </div>
  );
}
