FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Ensure storage directory exists with proper permissions
RUN mkdir -p /app/storage/datasets /app/storage/pipelines /app/storage/runs /app/storage/reconstruction /app/storage/evaluations /app/storage/audit

ENV PYTHONPATH=/app
ENV ENVIRONMENT=production
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# Mount persistent storage volume in deployment
VOLUME ["/app/storage"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
