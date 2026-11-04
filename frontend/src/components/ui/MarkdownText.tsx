import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownTextProps {
  readonly text?: string | null;
  readonly className?: string;
}

/**
 * Renders markdown (app and task descriptions) with GFM support, so tables,
 * lists, and autolinked URLs survive. Styled by the .fg-markdown block in
 * index.css. For plain-text summaries in list views, use summarizeMarkdown
 * from @/utils/markdown instead.
 */
export default function MarkdownText({ text, className }: MarkdownTextProps) {
  if (!text) {
    return null;
  }
  return (
    <div className={`fg-markdown text-foreground ${className ?? ''}`}>
      <Markdown
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} rel="noopener noreferrer" target="_blank" />
          )
        }}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </Markdown>
    </div>
  );
}
