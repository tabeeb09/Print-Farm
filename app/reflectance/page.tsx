import PaperArticle from "@/components/PaperArticle";
import { papers } from "@/src/lib/papers";

export const metadata = {
  title: papers.reflectance.title,
};

export default function ReflectancePage() {
  return <PaperArticle paper={papers.reflectance} />;
}
