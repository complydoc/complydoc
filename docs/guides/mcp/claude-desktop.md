# complydoc in Claude Desktop

1. Download `complydoc.mcpb` from the [latest release](https://github.com/complydoc/complydoc/releases/latest).
2. Open it. Claude Desktop shows the extension; click **Install**.
3. Turn the extension on in **Settings, Extensions** if it shows as off.
4. Ask: *I want to send you a file.* A box appears in the chat: drop the file in it, then
   say *open it*. Or ask the assistant to choose a file, and pick it in your computer's
   file dialog. Do not attach it with the paperclip: that sends the original, unmasked.

Folders are optional. To work on a whole folder, add it in the extension's settings or ask
the assistant to choose a folder.

Claude Desktop sets up Python and complydoc by itself, so nothing else is installed. The
first time it starts, the extension downloads the model that finds names (about 700 MB).
Until it is on disk, every reading says names are not masked yet; ask again afterwards.

If you installed `complydoc-names.mcpb` from an earlier release, remove it first.

**If it does not work.** Settings, Extensions, complydoc shows the logs. Make sure only one
complydoc extension is installed.
