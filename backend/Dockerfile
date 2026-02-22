FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy project files
COPY exchanger_api.py .
COPY backend/ backend/
COPY translations/ translations/

# Make startup scripts executable
RUN chmod +x backend/start.sh backend/start_bot.sh

ENV PYTHONUNBUFFERED=1
ENV PROJECT_ROOT=/app
ENV TRANSLATIONS_DIR=/app/translations
ENV LOG_DIR=/app/logs

EXPOSE 8000
