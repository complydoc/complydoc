/** Where the page points. The docs site is built from docs/ by mkdocs. */
const DOCS = "https://complydoc.github.io/complydoc/docs";
const REPO = "https://github.com/complydoc/complydoc";

export const VERSION = "0.5.1";

export const links = {
  docs: `${DOCS}/`,
  github: REPO,
  changelog: `${REPO}/blob/main/src/complydoc/CHANGELOG.md`,
  discussions: `${REPO}/discussions`,
  playground: "https://github.com/complydoc/playground",
  pypi: "https://pypi.org/project/complydoc/",
  viewer: `${REPO}/tree/main/viewer`,
  cli: `${DOCS}/reference/cli/`,
  api: `${DOCS}/reference/api/`,
  reportSchema: `${DOCS}/reference/report/`,
  offline: `${DOCS}/explanation/offline/`,
  accuracy: `${DOCS}/explanation/accuracy/`,
  hiddenContent: `${DOCS}/explanation/hidden-content/`,
  routing: `${DOCS}/guides/routing/`,
  policy: `${DOCS}/guides/policy/`,
  action: `${DOCS}/guides/github-action/`,
  compareLoaders: `${DOCS}/guides/compare-loaders/`,
  chunks: `${DOCS}/guides/inspect-chunks/`,
  identifiers: `${DOCS}/reference/identifiers/`,
} as const;
