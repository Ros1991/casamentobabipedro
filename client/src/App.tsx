import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Toasts } from './components/Toasts';
import { Admin } from './pages/Admin';
import { Agenda } from './pages/Agenda';
import { Enter } from './pages/Enter';
import { Fotos } from './pages/Fotos';
import { Home } from './pages/Home';
import { Mapa } from './pages/Mapa';
import { Mural } from './pages/Mural';
import { Perfil } from './pages/Perfil';
import { Telao } from './pages/Telao';

export default function App() {
  return (
    <>
      <Toasts />
      <Routes>
        <Route path="/entrar" element={<Enter />} />
        <Route path="/telao" element={<Telao />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="mural" element={<Mural />} />
            <Route path="mapa" element={<Mapa />} />
            <Route path="fotos" element={<Fotos />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="chegadas" element={<Navigate to="/agenda?tab=chegadas" replace />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="admin" element={<Admin />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
