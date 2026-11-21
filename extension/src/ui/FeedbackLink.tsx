/**
 * "Send feedback" (P13b): opens the feedback form in a new tab. Renders nothing while
 * FEEDBACK_URL is empty. `rel="noopener noreferrer"` so the form site gets no referrer and no
 * handle on the extension page.
 */
import { feedbackLink } from './feedback';
import { ChatIcon } from './icons';

export default function FeedbackLink({ url }: { url?: string }) {
  const href = feedbackLink(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="sl-row"
      style={{ display: 'inline-flex', gap: 5 }}
    >
      <ChatIcon />
      Send feedback
    </a>
  );
}
