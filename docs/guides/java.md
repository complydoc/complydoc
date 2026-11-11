# From Java

[complydoc4j](https://github.com/complydoc/complydoc4j) is complydoc for Java. It audits a
folder of documents, or observes a LangChain4j ingestion, and writes the same report JSON
as complydoc. So `complydoc ui` opens a Java run, `complydoc check` runs your policies on it,
and the GitHub Action reads it.

It reads the same `sensitive.yaml` and `hidden.yaml` this package ships, byte for byte. Its
answers are checked against this package's on every change to either project.

## Observe a LangChain4j ingestion

Change `EmbeddingStoreIngestor.builder()` to `observation.ingestor()`:

```java
try (Observation observation = Observation.start("contracts-ingest")) {
    List<Document> documents = observation.load("FileSystemDocumentLoader",
            () -> FileSystemDocumentLoader.loadDocuments(folder, parser));
    observation.ingestor()
            .documentSplitter(DocumentSplitters.recursive(800, 80))
            .embeddingModel(model)
            .embeddingStore(store)
            .build()
            .ingest(documents);
}
```

Each loader, transformer, splitter, embedding call and store becomes a stage, as in
[Observe a pipeline](/complydoc/docs/guides/observe-a-pipeline/). When the block closes,
the report is written to `.complydoc/contracts-ingest-<time>.json`. Run `complydoc ui` in
the same folder to open it.

## Audit a folder

```java
Report report = Complydoc4j.audit(Path.of("contracts"));
Complydoc4j.write(report, Path.of(".complydoc/contracts.json"));
```

It reads PDF, Word, Excel, text and Markdown files and checks each one for:

- identifiers, validated and masked as here;
- text the file's formatting hides: white, under 1pt, off the page, in an invisible
  render mode or under an image in a PDF; hidden runs in Word; hidden sheets, rows, columns
  and cells in Excel;
- passages written as instructions to a model.

It also checks the folder's [evals file](/complydoc/docs/guides/evals/), with near misses
scored as complydoc scores them.

## What is the same, and what is not yet

The findings are the same. For the same document, both find the same identifiers, under
the same fingerprints, masked the same way. They find the same hidden passages for the
same reasons, and give an eval the same score. That makes `complydoc find` and an
ignore file work across reports from either.

complydoc4j does not produce these yet:

- **Names and organisations.** These need a name model. The report lists them as not looked
  for, as complydoc does when its name model isn't installed.
- **Cost, readiness and routing.** Those sections are empty, so a policy rule on readiness
  has nothing to check in a Java report.
- **HTML, email, PowerPoint and images.** A folder audit lists these files under `skipped`.
  It doesn't run OCR.
- **Where an embedding call went.** complydoc sees this from inside its network guard.
  complydoc4j reads it from the endpoint in the model's settings, and its report says so.

`run.tool_version` starts with `complydoc4j`, so you can tell which project wrote a report.

## How the two are kept together

`src/scripts/java_conformance.py` runs this package over a set of fixtures and writes what
it answered:

- every validator's verdict on about 7,800 values;
- the scans, masking and hidden-text findings on each text fixture;
- the report `cd.observe` writes for a pipeline both projects build the same way;
- a security audit of a folder of PDF, Word and Excel files, with its evals.

complydoc4j's test suite has to give the same answers. CI runs it against each pull
request here, so a change on this side that complydoc4j has not followed shows up before
it is released.
