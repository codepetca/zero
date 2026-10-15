import { LearnTheme } from "../learn/LearnTheme";
import { GetStarted } from "@/components/GetStarted";
import { projectForLesson, publishedTutorialTemplate } from "@/lib/learning.mjs";
import "../../.generated/learn-theme.css";
import "../learn/learn.css";
import "./get-started.css";

export const metadata = { title: "Get started with Zero" };

export default function GetStartedPage() {
  const project = projectForLesson("0");
  if (!project) throw new Error("The first tutorial project is missing.");
  return <LearnTheme active="">
    <GetStarted template={publishedTutorialTemplate(project.id)} />
  </LearnTheme>;
}
