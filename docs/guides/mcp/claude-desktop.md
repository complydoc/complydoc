# complydoc in Claude Desktop

1. Download `complydoc.mcpb` from the [latest release](https://github.com/complydoc/complydoc/releases/latest).
2. Open it. Claude Desktop shows the extension; click **Install**.
3. Choose the folders with your documents.
4. Ask: *Open the Acme proposal and summarise it.*

Claude Desktop sets up Python and complydoc by itself, so nothing else is installed. The
first time it starts, the extension downloads the model that finds names (about 700 MB).
Until it is on disk, every reading says names are not masked yet; ask again afterwards.

If you installed `complydoc-names.mcpb` from an earlier release, remove it first.

**If it does not work.** Settings, Extensions, complydoc shows the logs. Make sure only one
complydoc extension is installed.
