/** Common target roles for the interview role picker, with keywords used to suggest roles from a resume. */
export const ROLE_GROUPS: Array<{ group: string; roles: Array<{ name: string; keywords: string[] }> }> = [
  {
    group: "Software engineering",
    roles: [
      { name: "Frontend Developer", keywords: ["react", "javascript", "typescript", "html", "css", "vue", "angular", "next", "tailwind"] },
      { name: "Backend Developer", keywords: ["node", "express", "java", "spring", "django", "flask", "api", "sql", "postgres", "mongodb", "go"] },
      { name: "Full Stack Developer", keywords: ["react", "node", "mongodb", "express", "next", "full stack", "mern"] },
      { name: "Software Engineer", keywords: ["java", "c++", "python", "data structures", "algorithms", "oop"] },
      { name: "Android Developer", keywords: ["android", "kotlin", "java", "jetpack"] },
      { name: "iOS Developer", keywords: ["ios", "swift", "swiftui", "xcode"] },
      { name: "Flutter / Mobile Developer", keywords: ["flutter", "dart", "react native", "mobile"] },
      { name: "QA / Test Engineer", keywords: ["testing", "selenium", "jest", "cypress", "qa", "automation"] },
    ],
  },
  {
    group: "Data & AI",
    roles: [
      { name: "Data Analyst", keywords: ["excel", "power bi", "tableau", "sql", "pandas", "analytics"] },
      { name: "Data Scientist", keywords: ["machine learning", "pandas", "numpy", "scikit", "statistics", "python"] },
      { name: "Machine Learning Engineer", keywords: ["tensorflow", "pytorch", "deep learning", "ml", "nlp", "computer vision"] },
      { name: "AI / LLM Engineer", keywords: ["llm", "openai", "langchain", "rag", "gemini", "generative"] },
      { name: "Data Engineer", keywords: ["spark", "airflow", "etl", "kafka", "hadoop", "bigquery"] },
    ],
  },
  {
    group: "Cloud & infrastructure",
    roles: [
      { name: "DevOps Engineer", keywords: ["docker", "kubernetes", "ci/cd", "jenkins", "terraform", "linux"] },
      { name: "Cloud Engineer", keywords: ["aws", "azure", "gcp", "cloud"] },
      { name: "Cybersecurity Analyst", keywords: ["security", "network", "penetration", "owasp", "cyber"] },
    ],
  },
  {
    group: "Product & design",
    roles: [
      { name: "UI/UX Designer", keywords: ["figma", "ui", "ux", "design", "prototype"] },
      { name: "Product Manager", keywords: ["product", "roadmap", "stakeholder", "agile", "jira"] },
      { name: "Business Analyst", keywords: ["business", "requirements", "excel", "stakeholder", "analysis"] },
    ],
  },
];

/** Up to 3 roles whose keywords best match the resume's skills and text. */
export function suggestRoles(resumeText: string): string[] {
  const t = resumeText.toLowerCase();
  return ROLE_GROUPS.flatMap((g) => g.roles)
    .map((r) => ({ name: r.name, score: r.keywords.filter((k) => t.includes(k)).length }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.name);
}
