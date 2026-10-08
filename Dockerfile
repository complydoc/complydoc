# syntax=docker/dockerfile:1
#
# complydoc in a container: audit a folder of documents, and serve the viewer on the
# reports to a team. It reaches no network when it runs, unless you give it a bucket to
# write reports to or read them from.
#
#   docker build -t complydoc .                        # audits and the viewer
#   docker build -t complydoc:names --target names .   # the same, with a name model
#
#   docker run --rm -v "$PWD/documents:/documents:ro" -v "$PWD/reports:/reports" \
#     complydoc audit /documents --out /reports
#   docker run --rm -p 8500:8500 -v "$PWD/reports:/reports:ro" complydoc
#
# Run with no command, it serves the viewer on /reports, read-only.

# The React viewer, which `complydoc ui` serves from inside the package.
FROM node:22-slim AS viewer
WORKDIR /viewer
COPY viewer/package.json viewer/package-lock.json ./
RUN npm ci
COPY viewer/ ./
RUN VITE_SAMPLES=false npm run build

# The wheel, with the viewer in it, as a release builds it.
FROM python:3.12-slim AS wheel
RUN pip install --no-cache-dir build
WORKDIR /src
COPY pyproject.toml README.md LICENSE ./
COPY src/complydoc ./src/complydoc
COPY --from=viewer /viewer/dist ./src/complydoc/viewer/dist
RUN python -m build --wheel --outdir /wheels

FROM python:3.12-slim AS plain
LABEL org.opencontainers.image.title="complydoc" \
      org.opencontainers.image.description="Observability for AI ingestion pipelines: audits and the report viewer" \
      org.opencontainers.image.source="https://github.com/complydoc/complydoc" \
      org.opencontainers.image.licenses="MIT"
# What the OCR engine's image library loads at run time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
# Which optional parts to install, as in `pip install "complydoc[ocr]"`.
ARG EXTRAS="ocr,s3"
RUN --mount=type=bind,from=wheel,source=/wheels,target=/wheels \
    pip install --no-cache-dir "$(ls /wheels/complydoc-*.whl)[${EXTRAS}]"
# Not root: it reads documents and writes reports, nothing else. The home folder is
# open so that `--user "$(id -u):$(id -g)"`, which makes the reports yours, also works.
RUN useradd --create-home --uid 1000 complydoc \
    && mkdir -p /documents /reports \
    && chown complydoc:complydoc /reports \
    && chmod 1777 /home/complydoc /reports
ENV HOME=/home/complydoc
USER complydoc
WORKDIR /reports
VOLUME ["/documents", "/reports"]
EXPOSE 8500
ENTRYPOINT ["complydoc"]
CMD ["ui", "/reports", "--host", "0.0.0.0"]

# With a name model, so person and organisation names are found. English; the model is
# in the image, so a run downloads nothing.
FROM plain AS names
USER root
ARG SPACY_MODEL="https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
RUN --mount=type=bind,from=wheel,source=/wheels,target=/wheels \
    pip install --no-cache-dir "$(ls /wheels/complydoc-*.whl)[ocr,ner,s3]" "${SPACY_MODEL}"
USER complydoc

# `docker build .` with no --target gives the plain image.
FROM plain
