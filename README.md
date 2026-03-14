# SapsanEx — Telegram Mini App для обмена валют

Telegram Mini App для обмена криптовалют и фиатных валют через Premium Exchanger API. Позволяет пользователям рассчитывать курсы, создавать заявки на обмен, отслеживать статусы и управлять сохранёнными реквизитами — прямо из Telegram.

## Стек технологий

| Компонент | Технология |
|-----------|------------|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| БД | PostgreSQL 15 |
| Бот | aiogram 3 |
| Деплой | Docker Compose |

## Структура проекта

```
├── backend/
│   ├── app/
│   │   ├── api/           # Роуты и Pydantic-схемы
│   │   ├── core/          # Конфигурация, БД, логирование
│   │   ├── models/        # SQLAlchemy-модели
│   │   └── services/      # Бизнес-логика, API обменника, уведомления
│   ├── bot/               # Telegram-бот (aiogram)
│   ├── alembic/           # Миграции БД
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── start.sh           # Запуск API (миграции + uvicorn)
│   └── start_bot.sh       # Запуск бота
├── frontend/
│   ├── src/
│   │   ├── api/           # HTTP-клиент к бэкенду
│   │   ├── components/    # React-компоненты
│   │   ├── contexts/      # i18n-контекст
│   │   ├── hooks/         # useTelegram, useExchanger, useDebounce
│   │   └── types/         # TypeScript-типы
│   ├── Dockerfile
│   └── package.json
├── translations/          # CSV с переводами (ru/en)
├── docker-compose.yml
├── exchanger_api.py       # Обёртка над Premium Exchanger API
├── config.py              # Ключи API (шаблон)
└── .env.example           # Шаблон переменных окружения
```

## Быстрый старт (Docker Compose)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/mchomak/exchanger_mini_app_2.git
cd exchanger_mini_app_2

# 2. Создать .env из шаблона и заполнить значения
cp .env.example .env

# 3. Запустить все сервисы
docker-compose up --build
```

Это поднимет 4 сервиса:

| Сервис | Порт | Описание |
|--------|------|----------|
| `postgres` | 5432 | PostgreSQL 15 |
| `api` | 8000 | FastAPI бэкенд |
| `bot` | — | Telegram-бот |
| `frontend` | 5173 | Vite dev-сервер |

## Переменные окружения

```env
# Telegram Bot
BOT_TOKEN=           # Токен от @BotFather
WEBAPP_URL=          # URL фронтенда (https://your-domain.com)

# База данных (по умолчанию для docker-compose)
DATABASE_URL=postgresql+asyncpg://user:password@postgres:5432/exchanger_db

# Premium Exchanger API
API_LOGIN=           # Логин API обменника
API_KEY=             # Ключ API обменника
BASE_URL=https://sapsanex.cc/api/userapi/v1/

# Приложение
DEBUG=true
CORS_ORIGINS=["http://localhost:5173"]
```

## Локальная разработка (без Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt

# Применить миграции
alembic -c alembic.ini upgrade head

# Запустить API
uvicorn app.core.main:app --host 0.0.0.0 --port 8000 --reload

# Запустить бота (в отдельном терминале)
python -m bot.main
```

### Frontend

```bash
cd frontend
npm install
npm run dev       # Dev-сервер: http://localhost:5173
npm run build     # Сборка в dist/
```

## Основные API-эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/users/init` | Инициализация пользователя через Telegram |
| POST | `/api/exchanges/calculate` | Расчёт курса обмена |
| POST | `/api/exchanges/create` | Создание заявки на обмен |
| GET | `/api/exchanges/{hash}` | Статус заявки |
| GET | `/api/users/{id}/accounts` | Сохранённые реквизиты |
| GET | `/health` | Проверка состояния |

## Функциональность

- Калькулятор обмена с актуальными курсами
- Создание и отслеживание заявок
- Управление реквизитами (карты, кошельки, телефоны)
- История обменов
- Валидация полей (телефон, карта с Luhn, криптоадреса)
- Мультиязычность (русский / английский)
- Уведомления через Telegram-бота
- Сохранение состояния формы при сворачивании приложения
