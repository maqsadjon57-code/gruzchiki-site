// ============================================================
// Роутер приложения: публичная лента, профиль, админка.
// ============================================================

import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminLayout } from './pages/admin/AdminLayout';
import { Dashboard } from './pages/admin/Dashboard';
import { Logs } from './pages/admin/Logs';
import { Orders } from './pages/admin/Orders';
import { Payments } from './pages/admin/Payments';
import { PromoCodes } from './pages/admin/PromoCodes';
import { Regions } from './pages/admin/Regions';
import { Settings } from './pages/admin/Settings';
import { Users } from './pages/admin/Users';
import { Feed } from './pages/Feed';
import { Login } from './pages/Login';
import { OrderDetail } from './pages/OrderDetail';
import { PlaceOrder } from './pages/PlaceOrder';
import { Profile } from './pages/Profile';
import { Register } from './pages/Register';
import { Top20 } from './pages/Top20';
import { TopUp } from './pages/TopUp';

export default function App() {
  return (
    <Routes>
      {/* Публичная часть */}
      <Route element={<Layout />}>
        <Route path="/" element={<Feed />} />
        <Route path="/place-order" element={<PlaceOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/top20" element={<Top20 />} />
        <Route path="/topup" element={<TopUp />} />
      </Route>

      {/* Админка */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="users" element={<Users />} />
        <Route path="payments" element={<Payments />} />
        <Route path="promocodes" element={<PromoCodes />} />
        <Route path="regions" element={<Regions />} />
        <Route path="settings" element={<Settings />} />
        <Route path="logs" element={<Logs />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
