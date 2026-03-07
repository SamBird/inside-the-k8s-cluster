FROM python:3.12-slim

WORKDIR /app
COPY app.py /app/app.py

ENV PORT=8080 \
    APP_VERSION=v1 \
    INITIAL_READINESS=true

EXPOSE 8080

CMD ["python", "/app/app.py"]
