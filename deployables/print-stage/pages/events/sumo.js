import { EventBlogPost } from "../../components/EventBlogPost";

const markdown = `
## Placeholder event notes

SUMO will use this page for robot battle photos, competition notes, and a short write-up from Bath Makerspace.

- Replace this placeholder with final match details.
- Add team names, brackets, and build documentation when ready.
- Keep the content markdown-first so it is easy to update.
`;

export default function SumoEventPage() {
  return (
    <EventBlogPost
      title="SUMO"
      heroImage="/makerspace-design/assets/events/image37259.png"
      heroAlt="SUMO event at Bath Makerspace"
      markdown={markdown}
    />
  );
}
