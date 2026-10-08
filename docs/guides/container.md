# Run it in a container

The repository builds a container image that audits a folder of documents and
serves the [viewer](viewer.md) on the reports. It is how complydoc runs where
nothing is installed by hand: a server your team shares, or a job in your own
infrastructure. Nothing in the image reaches the network when it runs.

## Build the image

```bash
git clone https://github.com/complydoc/complydoc
cd complydoc
docker build -t complydoc .
```

That image reads documents, with OCR for scanned pages, and serves the viewer.
A second one adds a name model, so person and organisation names are found:

```bash
docker build -t complydoc:names --target names .
```

The name model is the small English one, and it is inside the image, so a run
downloads nothing. [Name detection models](name-detection-models.md) says what
it finds and what it misses.

## Audit a folder

Give it the documents to read and a folder to write the reports in:

```bash
docker run --rm \
  -v "$PWD/documents:/documents:ro" \
  -v "$PWD/reports:/reports" \
  complydoc audit /documents --out /reports
```

The documents are mounted read-only: an audit never changes them. Everything
after the image's name is a complydoc command, so `check`, `diff` and the rest
run the same way.

The image runs as its own user, not as root. If the reports folder is yours and
that user cannot write to it, run it as you:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/documents:/documents:ro" \
  -v "$PWD/reports:/reports" \
  complydoc audit /documents --out /reports
```

To be sure nothing leaves the machine, take the network away. An audit does not
need one:

```bash
docker run --rm --network none \
  -v "$PWD/documents:/documents:ro" \
  -v "$PWD/reports:/reports" \
  complydoc audit /documents --out /reports
```

## Serve the viewer to a team

Run with no command, the image serves the viewer on `/reports`:

```bash
docker run -d --name complydoc -p 8500:8500 \
  -v "$PWD/reports:/reports:ro" \
  complydoc
```

Everyone who can reach port 8500 on that machine opens the same reports, and a
report written into the folder appears when the page is reloaded. Served this
way the viewer is [read-only](viewer.md#serve-it-to-a-team): it has no sign-in
of its own, so it changes no file, and the reports can be mounted read-only as
above.

Put it behind the proxy that already signs your people in and serves HTTPS, and
tell it the name the proxy serves it under:

```bash
docker run -d --name complydoc -p 8500:8500 \
  -v "$PWD/reports:/reports:ro" \
  complydoc ui /reports --host 0.0.0.0 --allowed-host reports.example.com
```

## What is in the image

| | `complydoc` | `complydoc:names` |
| --- | --- | --- |
| Audits, checks, the viewer | yes | yes |
| OCR for scanned pages | yes | yes |
| Person and organisation names | no, and the report says so | yes, English |
| Runs as | its own user | its own user |
| Reaches the network | never | never |
