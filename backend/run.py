"""
Точка запуска бэкенда: python run.py

Поднимает uvicorn-сервер с горячей перезагрузкой (удобно для разработки).
Для продакшена: uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,   # авто-перезапуск при изменении кода
    )
