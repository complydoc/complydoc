# Run it for your team

One place where everyone opens the same reports: the pipelines and audits your
team runs write into a folder, and a viewer serves that folder, read-only,
behind the sign-in your organisation already has. Nothing leaves your
infrastructure, and complydoc itself reaches no network.

## How it fits together

```text
 your pipelines and CI jobs                your infrastructure
┌───────────────────────────┐      ┌──────────────────────────────────────┐
│ cd.observe(...)           │      │  reports folder                      │
│ complydoc audit ...       │ ───▶ │    ▲ read-only                       │
│   write reports           │      │  viewer  ◀── proxy ◀── HTTPS ◀── you │
└───────────────────────────┘      │  (no sign-in)  (signs you in)        │
                                   └──────────────────────────────────────┘
```

- **The reports folder** is the only state. A report is a JSON file, with a
  folder of parts beside it when it keeps page text or pictures. Copy it, back
  it up or delete it like any other folder.
- **The viewer** is `complydoc ui`, in a container. It reads the folder
  read-only, changes no file, and is never reachable on its own.
- **The proxy** is the only thing published. It signs people in with your
  identity provider and passes them through. complydoc has no accounts of its
  own, by design: who may see the reports is decided where you already decide
  such things.

## Set it up

You need Docker with Compose, an OpenID Connect client registered with your
identity provider, and a name with HTTPS in front of it.

```bash
git clone https://github.com/complydoc/complydoc
cd complydoc/deploy
cp .env.example .env
```

Fill in `.env`:

| Setting | What it is |
| --- | --- |
| `COMPLYDOC_HOST` | The name people open, such as `reports.example.com` |
| `COMPLYDOC_REPORTS` | The folder of reports to serve |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Your identity provider's client, registered for `https://<COMPLYDOC_HOST>/oauth2/callback` |
| `ALLOWED_EMAIL_DOMAINS` | Who may come in, of the people the provider signs in |
| `COOKIE_SECRET` | 32 random bytes that sign the session; the file says how to make them |

Then start it:

```bash
docker compose up -d
```

Point your load balancer, the one that serves HTTPS for `COMPLYDOC_HOST`, at
the proxy's port, 4180 unless you changed it. Open the name: you are sent to
sign in, and then see the reports.

The Compose file is `deploy/compose.yaml`. It runs the viewer with a read-only
file system and no added privileges, checks it is up through `/api/health`, and
starts the proxy only once it is. The sign-in proxy is
[oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/); its documentation
covers each identity provider.

## Get reports into the folder

Whatever runs your pipelines writes its reports there. A report written into
the folder shows up when the page is reloaded.

A pipeline you observe writes one report a run, named by the pipeline and the
time, so runs add up:

```python
import complydoc as cd

with cd.observe("contracts-ingest", out="/mnt/reports/contracts-ingest"):
    run_the_pipeline()
```

An audit writes `complydoc.json`, replacing the last one. Give each run a name
of its own to keep them all:

```bash
complydoc audit ./documents --out /mnt/reports/contracts --name "audit-$(date +%Y%m%d-%H%M%S)"
```

Each run records the [repository, branch and commit](viewer.md#which-change-a-run-came-from)
it came from, so the viewer says which change produced which run.

The folder can be anything every writer can reach and the viewer's machine can
mount: a network share or a volume. Or it can be a bucket.

### Reports in a bucket

Most infrastructure already has object storage that every job can reach. Give a
bucket folder wherever a folder goes, and install the `s3` extra
(`pip install "complydoc[s3]"`; the container images have it):

```python
with cd.observe("contracts-ingest", out="s3://team-reports/contracts-ingest"):
    run_the_pipeline()
```

```bash
complydoc audit ./documents --out s3://team-reports/contracts --name "audit-$(date +%Y%m%d-%H%M%S)"
complydoc ui s3://team-reports --host 0.0.0.0
```

- **Writing.** A run is written on the machine that ran it, as always, and its
  files are then copied to the bucket. Two pipeline runs in the same second get
  different names. If the bucket cannot be reached, a pipeline being observed
  carries on and the failure is reported; a command exits with an error.
- **Serving.** The viewer keeps a copy of the bucket folder's reports and looks
  again, at most every ten seconds, as pages are loaded. Page pictures and
  document text are fetched when a page asks for them, not before.
- **Credentials** are found the way the AWS tools find them: the environment, a
  profile, or the machine's role. Writers need to put objects; the viewer needs
  to list and get them. `AWS_ENDPOINT_URL` names another S3-compatible store.
- **What goes up is the report.** It holds masked values unless a run used
  `--reveal`. The documents are never uploaded.

This is the one case where complydoc reaches a network by itself, and it
reaches only the bucket you named. [Network isolation](../explanation/offline.md)
says how that is kept narrow.

To serve a bucket from the Compose file, change the viewer's command to
`ui s3://your-bucket/folder --host 0.0.0.0 --allowed-host <name>`, pass it the
credentials, and remove the reports volume.

## What to keep out of it

- **Run without `--reveal`.** A report holds masked values unless a run asked
  for the real ones. A report everyone opens is the wrong place for them.
- **Leave page pictures off unless you need them.** They are blacked out where
  identifiers were found, and a page with one that could not be placed has no
  picture; they are still the documents' pages.
- **Give the folder to the people who should have the documents' findings**,
  and no further. The proxy decides who signs in; the folder's own permissions
  decide who can read the files behind it.

## What it does not do yet

- There are no roles: everyone the proxy lets in sees every report in the
  folder. Serve separate folders from separate viewers to keep teams apart.
- It is read-only, so findings are not triaged together here. Ignore files and
  concepts live beside the documents, in the repository that owns them.
- The viewer's copy of a bucket lives in the container and is rebuilt when it
  restarts, which takes as long as downloading the reports does.
