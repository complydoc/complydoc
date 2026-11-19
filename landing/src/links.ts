/** Where the page points. The docs site is built from docs/ by docs-site/. */
const DOCS = "https://complydoc.io/docs";
const REPO = "https://github.com/complydoc/complydoc";

export const VERSION = "0.8.1";

export const links = {
  docs: `${DOCS}/`,
  github: REPO,
  changelog: `${REPO}/blob/main/src/complydoc/CHANGELOG.md`,
  discussions: `${REPO}/discussions`,
  playground: "https://github.com/complydoc/playground",
  pypi: "https://pypi.org/project/complydoc/",
  viewer: `${REPO}/tree/main/viewer`,
  viewerGuide: `${DOCS}/guides/viewer/`,
  cli: `${DOCS}/reference/cli/`,
  api: `${DOCS}/reference/api/`,
  reportSchema: `${DOCS}/reference/report/`,
  offline: `${DOCS}/explanation/offline/`,
  assistant: `${DOCS}/guides/assistant-mcp/`,
  accuracy: `${DOCS}/explanation/accuracy/`,
  hiddenContent: `${DOCS}/explanation/hidden-content/`,
  routing: `${DOCS}/guides/routing/`,
  policy: `${DOCS}/guides/policy/`,
  action: `${DOCS}/guides/github-action/`,
  compareLoaders: `${DOCS}/guides/compare-loaders/`,
  compareFileTypes: `${DOCS}/guides/compare-loaders/#several-file-types`,
  chunks: `${DOCS}/guides/inspect-chunks/`,
  evals: `${DOCS}/guides/evals/`,
  findValue: `${DOCS}/guides/find-a-value/`,
  observe: `${DOCS}/guides/observe-a-pipeline/`,
  container: `${DOCS}/guides/container/`,
  team: `${DOCS}/guides/team/`,
  identifiers: `${DOCS}/reference/identifiers/`,
  java: `${DOCS}/guides/java/`,
  contributing: `${REPO}/blob/main/CONTRIBUTING.md`,
  goodFirstIssues: `${REPO}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`,
  newIssue: `${REPO}/issues/new`,
  image: "https://github.com/complydoc/complydoc/pkgs/container/complydoc",
} as const;
