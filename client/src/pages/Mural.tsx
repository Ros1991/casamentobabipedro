import { ArrowDown, SendHorizonal, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoViewer } from '../components/PhotoViewer';
import { Reactions } from '../components/Reactions';
import { errorMessage } from '../lib/api';
import { firstName, formatDayLabel, formatTime } from '../lib/format';
import { toast } from '../lib/toast';
import type { Message, Photo } from '../lib/types';
import { useStore } from '../store';

const GROUP_WINDOW = 3 * 60 * 1000;

export function Mural() {
  const me = useStore((s) => s.me);
  const isAdmin = useStore((s) => s.isAdmin);
  const messages = useStore((s) => s.messages);
  const messagesLoaded = useStore((s) => s.messagesLoaded);
  const hasMore = useStore((s) => s.hasMoreMessages);
  const loadingOlder = useStore((s) => s.loadingOlder);
  const loadMessages = useStore((s) => s.loadMessages);
  const loadOlder = useStore((s) => s.loadOlderMessages);
  const sendMessage = useStore((s) => s.sendMessage);
  const deleteMessage = useStore((s) => s.deleteMessage);
  const emitTyping = useStore((s) => s.emitTyping);
  const typing = useStore((s) => s.typing);
  const guestsLoaded = useStore((s) => s.guestsLoaded);
  const loadGuests = useStore((s) => s.loadGuests);
  const online = useStore((s) => s.online);

  const listRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    if (!messagesLoaded) void loadMessages().catch((err) => toast.error(errorMessage(err)));
    if (!guestsLoaded) void loadGuests().catch(() => undefined);
  }, [messagesLoaded, guestsLoaded, loadMessages, loadGuests]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  }, []);

  // Rola para o fim ao carregar e quando chegam mensagens (se já estava perto do fim)
  useEffect(() => {
    if (!messagesLoaded) return;
    const grew = messages.length > lastCount.current;
    const last = messages[messages.length - 1];
    const mine = last && last.guestId === me?.id;
    if (lastCount.current === 0 || nearBottom || mine) {
      requestAnimationFrame(() => scrollToBottom(lastCount.current !== 0));
    } else if (grew) {
      setNewBelow((n) => n + (messages.length - lastCount.current));
    }
    lastCount.current = messages.length;
  }, [messages, messagesLoaded, nearBottom, me?.id, scrollToBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = dist < 120;
    setNearBottom(near);
    if (near) setNewBelow(0);
  };

  const handleLoadOlder = async () => {
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    await loadOlder();
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevHeight;
    });
  };

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(value);
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

  const photoList = useMemo<Photo[]>(
    () => messages.filter((m) => m.photo).map((m) => ({ ...m.photo!, guest: m.guest })),
    [messages],
  );

  const openPhoto = (photoId: string) => {
    const idx = photoList.findIndex((p) => p.id === photoId);
    if (idx >= 0) setViewer(idx);
  };

  const handleDelete = async (id: number) => {
    setConfirmDelete(null);
    try {
      await deleteMessage(id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const typingNames = Object.values(typing).map((t) => firstName(t.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-2">
        {hasMore && (
          <div className="mb-3 text-center">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="rounded-full border border-sand bg-cream px-4 py-1.5 text-xs font-semibold text-terra-dark disabled:opacity-60"
            >
              {loadingOlder ? 'Carregando…' : 'Ver mensagens anteriores'}
            </button>
          </div>
        )}

        {messagesLoaded && messages.length === 0 && (
          <div className="mt-16 text-center text-ink-soft">
            <p className="font-script text-3xl text-terra-dark">Comece a conversa!</p>
            <p className="mt-1 text-sm">Mande um oi para a galera ou poste a primeira foto. 📸</p>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.guestId === me?.id;
          const newDay = !prev || formatDayLabel(prev.createdAt) !== formatDayLabel(m.createdAt);
          const grouped = !!prev && !newDay && prev.guestId === m.guestId && m.createdAt - prev.createdAt < GROUP_WINDOW;
          const canDelete = !m.pending && (mine || isAdmin);
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
                <div className="w-8 shrink-0">
                  {!grouped && !mine && <Avatar guest={m.guest} size={32} online={online.includes(m.guestId)} />}
                </div>
                <div className={`group relative max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!grouped && !mine && <div className="mb-0.5 ml-1 text-xs font-semibold text-terra">{m.guest.name}</div>}
                  <MessageBubble
                    message={m}
                    mine={mine}
                    onOpenPhoto={openPhoto}
                    onImageLoad={() => {
                      if (nearBottom) scrollToBottom();
                    }}
                  />
                  <div className={`mt-1 flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-ink-soft">{m.pending ? 'enviando…' : formatTime(m.createdAt)}</span>
                    {!m.pending && <Reactions messageId={m.id} reactions={m.reactions} align={mine ? 'right' : 'left'} />}
                    {canDelete &&
                      (confirmDelete === m.id ? (
                        <span className="flex items-center gap-1 text-[11px]">
                          <button type="button" onClick={() => handleDelete(m.id)} className="rounded-full bg-rose px-2 py-0.5 font-semibold text-cream">
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
                          aria-label={m.photo ? 'Apagar foto' : 'Apagar mensagem'}
                          title={mine ? 'Apagar' : 'Apagar como administrador'}
                        >
                          <Trash2 size={14} />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {newBelow > 0 && (
        <div className="pointer-events-none relative">
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="pointer-events-auto absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-terra-dark px-3 py-1.5 text-xs font-semibold text-cream shadow-soft animate-fade-in"
          >
            <ArrowDown size={14} /> {newBelow === 1 ? '1 nova mensagem' : `${newBelow} novas mensagens`}
          </button>
        </div>
      )}

      <div className="border-t border-sand bg-cream px-2 pt-1.5 pb-2">
        <div className="h-4 px-3 text-[11px] text-ink-soft">
          {typingNames.length > 0 &&
            (typingNames.length === 1 ? `${typingNames[0]} está digitando…` : `${typingNames.slice(0, 2).join(' e ')} estão digitando…`)}
        </div>
        <div className="flex items-end gap-1">
          <PhotoCapture variant="icon" />
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) emitTyping();
            }}
            onKeyDown={onKey}
            placeholder="Mensagem para a galera…"
            rows={1}
            maxLength={2000}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-sand bg-white/80 px-4 py-2.5 text-[15px] text-ink outline-none focus:border-terra"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
            className="flex size-11 items-center justify-center rounded-full bg-terra-dark text-cream transition disabled:opacity-40"
            aria-label="Enviar"
          >
            <SendHorizonal size={20} />
          </button>
        </div>
      </div>

      {viewer !== null && photoList[viewer] && (
        <PhotoViewer photos={photoList} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  onOpenPhoto,
  onImageLoad,
}: {
  message: Message;
  mine: boolean;
  onOpenPhoto: (id: string) => void;
  onImageLoad: () => void;
}) {
  const base = mine ? 'bg-terra-dark text-cream rounded-br-md' : 'bg-white text-ink rounded-bl-md border border-sand';
  return (
    // Com foto, o balão tem largura fixa e a foto ocupa tudo: a legenda quebra dentro dessa largura,
    // em vez de alargar o balão e deixar um vazio ao lado da foto.
    <div
      className={`overflow-hidden rounded-2xl shadow-soft ${base} ${message.pending ? 'opacity-70' : ''} ${message.photo ? 'w-[300px] max-w-full' : ''}`}
    >
      {message.photo && (
        <button type="button" onClick={() => onOpenPhoto(message.photo!.id)} className="block w-full">
          <img
            src={message.photo.thumbUrl}
            alt={message.photo.caption ?? 'Foto'}
            className="block w-full object-cover"
            // Fotos muito altas são recortadas em 4:5 (a foto inteira abre ao tocar)
            style={{ aspectRatio: `${Math.max(message.photo.width / message.photo.height, 0.8)}` }}
            loading="lazy"
            onLoad={onImageLoad}
          />
        </button>
      )}
      {message.text && <p className="px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap">{message.text}</p>}
    </div>
  );
}
