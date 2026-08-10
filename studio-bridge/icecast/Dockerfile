FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends icecast2 \
    && rm -rf /var/lib/apt/lists/*

COPY icecast.xml /etc/icecast2/icecast.xml
RUN chown root:icecast /etc/icecast2/icecast.xml && chmod 640 /etc/icecast2/icecast.xml

EXPOSE 8000
USER icecast2
CMD ["icecast2", "-c", "/etc/icecast2/icecast.xml"]
