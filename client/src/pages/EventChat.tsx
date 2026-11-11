import { ArrowLeft, Check, Pencil, SendHorizonal, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { api, errorMessage } from '../lib/api';
import { formatDateLong, formatDayLabel, formatTime } from '../lib/format';
import { toast } from '../lib/toast';
import type { Message } from '../lib/types';
import { useStore } from '../store';

/**
 * Conversa de um combinado da agenda: um grupo só para quem vai naquele programa combinar os detalhes
 * (carona, horário, o que levar), sem encher o mural geral. Quem respondeu "vou" ou "talvez" recebe os avisos.
 */
export function EventChat() {
  const { id = '' } = useParams();
  const me = useStore((s) => s.me);
  const isAdmin = useStore((s) => s.isAdmin);
  const events = useStore((s) => s.events);
  const eventsLoaded = useStore((s) => s.eventsLoaded);
  const loadEvents = useStore((s) => s.loadEvents);
  const deleteMessage = useStore((s) => s.deleteMessage);
  const editMessage = useStore((s) => s.editMessage);
  const online = useStore((s) => s.online);
  const event = events.find((e) => e.id === id);

  const listRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (!eventsLoaded) void loadEvents().catch(() => undefined);
  }, [eventsLoaded, loadEvents]);

  useEffect(() => {
    let alive = true;
    setMessages(null);
    api<{ messages: Message[] }>(`/api/events/${id}/messages`)
      .then((res) => {
        if (!alive) return;
        setMessages(res.messages);
        requestAnimationFrame(() => scrollToBottom());
      })
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [id, scrollToBottom]);

  // Mensagens novas e apagadas chegam em tempo real pelo store
  useEffect(() => {
    const onNew = (e: Event) => {
      const { eventId, message } = (e as CustomEvent<{ eventId: string; message: Message }>).detail;
      if (eventId !== id) return;
      setMessages((list) => (list && !list.some((m) => m.id === message.id) ? [...list, message] : list));
      if (nearBottom.current || message.guestId === me?.id) requestAnimationFrame(() => scrollToBottom(true));
    };
    const onDeleted = (e: Event) => {
      const { id: messageId } = (e as CustomEvent<{ id: number | null }>).detail;
      setMessages((list) => list?.filter((m) => m.id !== messageId) ?? list);
    };
    const onUpdated = (e: Event) => {
      const m = (e as CustomEvent<Message>).detail;
      if (m.eventId === id) setMessages((list) => list?.map((x) => (x.id === m.id ? m : x)) ?? list);
    };
    window.addEventListener('galera:message-updated', onUpdated);
    window.addEventListener('galera:event-message', onNew);
    window.addEventListener('galera:message-deleted', onDeleted);
    return () => {
      window.removeEventListener('galera:message-updated', onUpdated);
      window.removeEventListener('galera:event-message', onNew);
      window.removeEventListener('galera:message-deleted', onDeleted);
    };
  }, [id, me?.id, scrollToBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    if (editing) {
      const target = editing;
      setSending(true);
      try {
        if (value !== target.text) {
          const updated = await editMessage(target.id, value);
          setMessages((list) => list?.map((m) => (m.id === updated.id ? updated : m)) ?? list);
        }
        setEditing(null);
        setText('');
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setSending(false);
      }
      return;
    }
    setSending(true);
    setText('');
    try {
      const res = await api<{ message: Message }>(`/api/events/${id}/messages`, { method: 'POST', json: { text: value } });
      setMessages((list) => (list && !list.some((m) => m.id === res.message.id) ? [...list, res.message] : list));
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      toast.error(errorMessage(err));
      setText(value);
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const remove = async (messageId: number) => {
    setConfirmDelete(null);
    try {
      await deleteMessage(messageId);
      setMessages((list) => list?.filter((m) => m.id !== messageId) ?? list);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const going = event?.counts.people ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-sand bg-terra-pale/60 px-2 py-2">
        <Link to="/agenda" className="rounded-full p-2 text-terra-dark hover:bg-cream" aria-label="Voltar para a agenda">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-serif text-lg font-semibold text-terra-dark">{event?.title ?? 'Combinado'}</div>
          {event && (
            <div className="flex items-center gap-1 truncate text-xs text-ink-soft">
              {formatDateLong(event.date)}
              {event.time ? ` · ${event.time}` : ''} · <Users size={12} /> {going} {going === 1 ? 'vai' : 'vão'}
            </div>
          )}
        </div>
      </div>

      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-3 pb-2">
        {eventsLoaded && !event && <p className="mt-16 text-center text-sm text-ink-soft">Esse combinado não existe mais.</p>}
        {messages && messages.length === 0 && event && (
          <div className="mt-16 px-4 text-center text-ink-soft">
            <p className="font-script text-3xl text-terra-dark">Conversa do combinado</p>
            <p className="mt-1 text-sm text-balance">
              Aqui é só sobre “{event.title}”: carona, horário, o que levar. Quem respondeu que vai (ou talvez) recebe os avisos.
            </p>
          </div>
        )}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.guestId === me?.id;
          const newDay = !prev || formatDayLabel(prev.createdAt) !== formatDayLabel(m.createdAt);
          const grouped = !!prev && !newDay && prev.guestId === m.guestId && m.createdAt - prev.createdAt < 3 * 60_000;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[11px] font-semibold tracking-widest text-terra uppercase">
                  <span className="h-px flex-1 bg-sand" />
                  {formatDayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-sand" />
                </div>
              )}
              <div className={`flex items-end gap-2 ${grouped ? 'mt-0.5' : 'mt-3'} ${mine ? 'flex-row-reverse' : ''}`}>
                <div className="w-8 shrink-0">{!grouped && !mine && <Avatar guest={m.guest} size={32} online={online.includes(m.guestId)} />}</div>
                <div className={`flex max-w-[78%] min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!grouped && !mine && <div className="mb-0.5 ml-1 text-xs font-semibold text-terra">{m.guest.name}</div>}
                  <div
                    className={`max-w-full rounded-2xl px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap shadow-soft [overflow-wrap:anywhere] ${
                      mine ? 'rounded-br-md bg-terra-dark text-cream' : 'rounded-bl-md border border-sand bg-white text-ink'
                    }`}
                  >
                    {m.text}
                  </div>
                  <div className={`mt-1 flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className="flex items-center gap-1 text-[10px] text-ink-soft">
                      {formatTime(m.createdAt)}
                      {m.editedAt && (
                        <span title="Mensagem editada" aria-label="editada" className="flex items-center">
                          <Pencil size={9} />
                        </span>
                      )}
                    </span>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(m);
                          setText(m.text ?? '');
                          inputRef.current?.focus();
                        }}
                        className="rounded-full border border-sand bg-cream/80 p-1.5 text-ink-soft hover:border-terra hover:text-terra-dark"
                        aria-label="Editar mensagem"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {(mine || isAdmin) &&
                      (confirmDelete === m.id ? (
                        <span className="flex items-center gap-1 text-[11px]">
                          <button type="button" onClick={() => remove(m.id)} className="rounded-full bg-rose px-2 py-0.5 font-semibold text-cream">
                            Apagar
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-full border border-sand px-2 py-0.5">
                            Não
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(m.id)}
                          className="rounded-full border border-sand bg-cream/80 p-1.5 text-ink-soft hover:border-rose hover:text-rose"
                          aria-label="Apagar mensagem"
                        >
                          <Trash2 size={13} />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-sand bg-cream px-2 pt-2 pb-2">
        {editing && (
          <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-2xl border-l-4 border-gold bg-gold/10 px-3 py-2">
            <Pencil size={15} className="shrink-0 text-terra-dark" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-terra-dark">Editando mensagem</div>
              <div className="truncate text-sm text-ink-soft">{editing.text}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setText('');
              }}
              className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
              aria-label="Cancelar edição"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder="Mensagem para quem vai…"
            rows={1}
            maxLength={2000}
            disabled={!event}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-sand bg-white/80 px-4 py-2.5 text-[15px] text-ink outline-none focus:border-terra"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending || !event}
            className="flex size-11 items-center justify-center rounded-full bg-terra-dark text-cream transition disabled:opacity-40"
            aria-label={editing ? 'Salvar edição' : 'Enviar'}
          >
            {editing ? <Check size={20} /> : <SendHorizonal size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
