# CV worker: consumes analysis jobs from RabbitMQ (src/worker.py). No GUI, no ports.
FROM python:3.14-slim

# No .pyc files, logs straight to `docker compose logs`
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements-worker.txt ./
RUN pip install --no-cache-dir -r requirements-worker.txt

COPY src/ ./src/

# Run as a regular user; matplotlib needs a writable config/cache dir
RUN useradd --create-home worker
USER worker
ENV MPLCONFIGDIR=/tmp/matplotlib

CMD ["python", "src/worker.py"]
