import { EventBlogPost } from "../../components/EventBlogPost";

const markdown = `
## Placeholder event notes

Halloween at Bath Makerspace will use this page for photos, build notes, and a short write-up from the team.

- Replace this placeholder with the final event summary.
- Add links to project files, booking forms, or photo galleries when ready.
- Keep the page as a lightweight markdown-driven event post.
`;

export default function HalloweenEventPage() {
  return (
    <EventBlogPost
      title="Halloween"
      heroImage="/makerspace-design/assets/events/image38001.png"
      heroAlt="Halloween event at Bath Makerspace"
      markdown={markdown}
    />
  );
}
