import { CalendarDays, Home, Images, MapPinned, MessageCircle, UserRound } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Monogram } from './Monogram';
import { OfflineQueueBanner } from './OfflineQueueBanner';

const NAV = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/mural', label: 'Mural', icon: MessageCircle },
  { to: '/mapa', label: 'Mapa', icon: MapPinned },
  { to: '/fotos', label: 'Fotos', icon: Images },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/perfil', label: 'Perfil', icon: UserRound },
];

export function Layout() {
  const location = useLocation();
  const unread = useStore((s) => s.unreadMural);
  const online = useStore((s) => s.online.length);
  const setMuralActive = useStore((s) => s.setMuralActive);
  const config = useStore((s) => s.config);
  const isMap = location.pathname.startsWith('/mapa');
  const isMural = location.pathname.startsWith('/mural');

  useEffect(() => {
    setMuralActive(isMural);
  }, [isMural, setMuralActive]);

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col bg-cream">
      <header
        className="sand-gradient flex items-center gap-3 border-b border-sand/70 px-4 pb-2"
        style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
      >
        <Monogram size={40} leaf={false} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="font-script text-2xl text-terra-dark">Galera do casamento</div>
          <div className="truncate text-[11px] font-semibold tracking-widest text-terra uppercase">
            {config?.wedding.couple ?? 'Pedro & Babi'}
          </div>
        </div>
        {online > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-cream/80 px-2.5 py-1 text-xs font-semibold text-terra-dark">
            <span className="size-2 rounded-full bg-emerald-500" />
            {online} online
          </div>
        )}
      </header>

      {!isMap && <OfflineQueueBanner />}

      <main className={`min-h-0 flex-1 ${isMap || isMural ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <Outlet />
      </main>

      <nav
        className="grid grid-cols-6 border-t border-sand bg-cream/95 backdrop-blur"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
        aria-label="Navegação"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${
                isActive ? 'text-terra-dark' : 'text-ink-soft hover:text-terra'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`rounded-full px-3 py-0.5 ${isActive ? 'bg-terra-pale' : ''}`}>
                  <item.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span>{item.label}</span>
                {item.to === '/mural' && unread > 0 && (
                  <span className="absolute top-1 right-1/2 translate-x-4 rounded-full bg-rose px-1.5 text-[10px] font-bold text-cream">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
