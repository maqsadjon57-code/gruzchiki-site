// ============================================================
// Карточка заказа в ленте: адрес, цена, категория, срочность.
// Клик по карточке открывает детальную страницу заказа.
// ============================================================

import { Link } from 'react-router-dom';
import type { Order } from '../types';
import { Badge, orderTimeLabel, rub } from './ui';

// Русские названия категорий для бейджа (класс и теги)
const CATEGORY_SHORT: Record<string, string> = {
  мебель: 'Мебель',
  стройматериалы: 'Стройматериалы',
  'бытовая техника': 'Техника',
  хрупкие: 'Хрупкий груз',
  продукты: 'Продукты',
  переезд: 'Переезд',
  прочее: 'Прочее',
};

type OrderCardProps = {
  order: Order;
  /** Расстояние от грузчика до точки заказа (км) — для сортировки по геолокации */
  distanceKm?: number | null;
};

export function OrderCard({ order, distanceKm }: OrderCardProps) {
  // Вакансия площадки (Работа России / hh.ru / SuperJob): показываем
  // заголовок вакансии, работодателя и зарплату вместо адреса и цены.
  const isVacancy = Boolean(order.external_url) || (order.is_external && Boolean(order.title));
  // Полный адрес одной строкой: улица, дом (+квартира/подъезд при наличии)
  const address = [order.street, order.house, order.apartment && `кв. ${order.apartment}`]
    .filter(Boolean)
    .join(', ');
  // Время публикации в часовом поясе браузера (бэкенд отдаёт ISO с зоной UTC)
  const timeLabel = orderTimeLabel(order.published_at);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Регион (город) — обязательный элемент из ТЗ */}
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 2a6 6 0 00-6 6c0 4 6 10 6 10s6-6 6-10a6 6 0 00-6-6z"
                clipRule="evenodd"
              />
              <circle cx="10" cy="8" r="2" fill="white" />
            </svg>
            <span className="font-medium">{order.region}</span>
            {timeLabel && <span>· {timeLabel}</span>}
          </div>
          {isVacancy ? (
            <h3 className="font-semibold text-slate-100 truncate">{order.title ?? 'Вакансия'}</h3>
          ) : (
            <h3 className="font-semibold text-slate-100 truncate">{address}</h3>
          )}
          {isVacancy && order.company && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{order.company}</p>
          )}
          {order.landmarks && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">Ориентир: {order.landmarks}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {isVacancy ? (
            <div className="text-base font-bold text-slate-200">{order.salary_text ?? 'З/п по запросу'}</div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-lg font-extrabold text-transparent">
                {rub(order.price)}
              </div>
              {order.hourly_rate != null && (
                <div className="text-xs text-slate-400">{rub(order.hourly_rate)}/час</div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <Badge color="blue">{CATEGORY_SHORT[order.category] ?? order.category}</Badge>
        {order.weight != null && <Badge>Вес: {order.weight} кг</Badge>}
        {order.urgency && <Badge color="red">Срочный</Badge>}
        {/* «До скольки» завершить заказ и длительность работ */}
        {order.deadline && <Badge color="orange">⏰ до {order.deadline}</Badge>}
        {/* Расстояние до заказа, если геолокация разрешена (≈1.2 км) */}
        {distanceKm != null && (
          <Badge color="cyan">📍 ≈{distanceKm < 1 ? Math.round(distanceKm * 1000) + ' м' : distanceKm.toFixed(1) + ' км'}</Badge>
        )}
        {order.duration_min != null || order.duration_max != null ? (
          <Badge color="cyan">
            ⏱{' '}
            {order.duration_min != null && order.duration_max != null
              ? `${order.duration_min}–${order.duration_max} мин`
              : order.duration_min != null
                ? `от ${order.duration_min} мин`
                : `до ${order.duration_max} мин`}
          </Badge>
        ) : null}
        {order.is_external ? (
          // Вакансии площадок: бейдж «Вакансия» + площадка; отклик — по ссылке
          isVacancy ? (
            <Badge color="purple">Вакансия · {order.source ?? 'Площадка'}</Badge>
          ) : (
            // Внешние заказы: бейдж площадки, телефон открывается после взятия заказа
            <Badge color="purple">{order.source ?? 'Площадка'}</Badge>
          )
        ) : order.phone_available ? (
          <Badge color="green">Телефон открыт</Badge>
        ) : (
          <Badge color="orange">Телефон после оплаты</Badge>
        )}
      </div>
    </>
  );

  // И локальные, и внешние заказы открываются на сайте: детали и кнопка
  // «Взять заказ» (для внешних — с последующим показом телефона)
  return (
    <Link
      to={`/orders/${order.id}`}
      className="glass gradient-border group block rounded-2xl p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-glow-lg"
    >
      {content}
    </Link>
  );
}
