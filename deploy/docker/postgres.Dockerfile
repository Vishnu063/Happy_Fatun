# Lab only: upstream PostgreSQL entrypoint/data layout, without a root-only helper.
FROM postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
RUN rm /usr/local/bin/gosu
USER 70:70
