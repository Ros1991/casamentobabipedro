import { ArrowDown, Camera, Reply, SendHorizonal, Smile, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoViewer } from '../components/PhotoViewer';
import { Reactions } from '../components/Reactions';
import { errorMessage } from '../lib/api';
import { firstName, formatDayLabel, formatTime } from '../lib/format';
import { toast } from '../lib/toast';
import type { GuestPublic, Message, Photo, ReplyPreview } from '../lib/types';
import { useStore } from '../store';

const GROUP_WINDOW = 3 * 60 * 1000;

/** Emojis oferecidos no botão ao lado do campo de texto (festa, praia e reações) */
const EMOJIS = [
  '😀', '😂', '🥹', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😅', '😭', '🙈',
  '❤️', '💛', '🤍', '💍', '👰', '🤵', '💐', '🥂', '🍾', '🍻', '🎉', '✨',
  '👏', '🙌', '🙏', '👍', '💃', '🕺', '🎶', '🔥', '🌴', '🌊', '☀️', '🏖️',
  '🥥', '🍹', '🦀', '✈️', '🚗', '📸', '👀', '🤣', '😴', '🤪', '💪', '🫶',
];

/** Minúsculas e sem acentos, para achar nomes ao digitar @ */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** "@texto" que a pessoa está digitando logo antes do cursor (até duas palavras), ou null. */
function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[1].length - 1, query: m[1] };
}

/** Texto da mensagem com os @nomes marcados em destaque. */
function renderText(text: string, names: { id: string; name: string }[], meId: string | undefined, mine: boolean): ReactNode {
  const found = names.filter((n) => text.includes('@' + n.name)).sort((a, b) => b.name.length - a.name.length);
  if (found.length === 0) return text;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${found.map((n) => '@' + escape(n.name)).join('|')})`, 'g'));
  return parts.map((part, i) => {
    const hit = found.find((n) => part === '@' + n.name);
    if (!hit) return part;
    const isMe = hit.id === meId;
    return (
      <span
        key={i}
        className={`font-bold ${isMe ? 'rounded bg-gold/30 px-1' : ''} ${mine ? 'text-cream underline decoration-cream/50' : 'text-terra-dark'}`}
      >
        {part}
      </span>
    );
  });
}

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
  const guests = useStore((s) => s.guests);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  /** Pessoas escolhidas na lista do @ nesta mensagem */
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
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
    const replyTo = replyingTo;
    const chosen = picked;
    // Só vale quem continua marcado no texto (a pessoa pode ter apagado o @)
    const mentions = [...new Set(chosen.filter((p) => value.includes('@' + p.name)).map((p) => p.id))];
    setSending(true);
    setText('');
    setReplyingTo(null);
    setPicked([]);
    setEmojiOpen(false);
    try {
      await sendMessage(value, { replyTo, mentions });
    } catch (err) {
      toast.error(errorMessage(err));
      setText(value);
      setReplyingTo(replyTo);
      setPicked(chosen);
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

  // Lista de pessoas ao digitar @
  const mention = useMemo(() => mentionQuery(text, caret), [text, caret]);
  const suggestions = useMemo<GuestPublic[]>(() => {
    if (!mention) return [];
    const tokens = fold(mention.query).split(' ').filter(Boolean);
    return Object.values(guests)
      .filter((g) => g.id !== me?.id)
      .filter((g) => {
        const words = fold(g.name).split(/\s+/);
        return tokens.every((t) => words.some((w) => w.startsWith(t)));
      })
      .sort((a, b) => Number(b.joined) - Number(a.joined) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [mention, guests, me?.id]);

  const pickMention = (g: GuestPublic) => {
    if (!mention) return;
    const next = text.slice(0, mention.start) + '@' + g.name + ' ' + text.slice(caret);
    const pos = mention.start + g.name.length + 2;
    setText(next);
    setPicked((list) => (list.some((p) => p.id === g.id) ? list : [...list, { id: g.id, name: g.name }]));
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  /** Coloca o emoji onde o cursor está e mantém o teclado aberto. */
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, 2000);
    const pos = Math.min(next.length, start + emoji.length);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const startReply = (m: Message) => {
    setReplyingTo(m);
    inputRef.current?.focus();
  };

  /** Vai até a mensagem citada (se estiver carregada) e pisca o balão. */
  const jumpTo = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return toast.info('Essa mensagem é mais antiga. Toque em "Ver mensagens anteriores".');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  const nameOf = (id: string) => guests[id]?.name;

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
            <div key={m.id} id={`msg-${m.id}`}>
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
                    meId={me?.id}
                    names={(m.mentions ?? []).map((id) => ({ id, name: nameOf(id) ?? '' })).filter((n) => n.name)}
                    highlight={flash === m.id}
                    onJump={jumpTo}
                    onOpenPhoto={openPhoto}
                    onImageLoad={() => {
                      if (nearBottom) scrollToBottom();
                    }}
                  />
                  <div className={`mt-1 flex items-center gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-ink-soft">{m.pending ? 'enviando…' : formatTime(m.createdAt)}</span>
                    {!m.pending && <Reactions messageId={m.id} reactions={m.reactions} align={mine ? 'right' : 'left'} />}
                    {!m.pending && (
                      <button
                        type="button"
                        onClick={() => startReply(m)}
                        className="rounded-full border border-sand bg-cream/80 p-1.5 text-ink-soft hover:border-terra hover:text-terra-dark"
                        aria-label={`Responder a ${m.guest.name}`}
                        title="Responder"
                      >
                        <Reply size={14} />
                      </button>
                    )}
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
        {suggestions.length > 0 && (
          <ul className="mx-1 mb-1.5 max-h-56 overflow-y-auto rounded-2xl border border-sand bg-white shadow-soft" aria-label="Marcar alguém">
            {suggestions.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  // mousedown/touch não pode tirar o foco do campo de texto
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(g)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-terra-pale"
                >
                  <Avatar guest={g} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {replyingTo && (
          <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-2xl border-l-4 border-terra bg-terra-pale px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-terra-dark">Respondendo a {replyingTo.guest.id === me?.id ? 'você' : replyingTo.guest.name}</div>
              <div className="flex items-center gap-1 truncate text-sm text-ink-soft">
                {replyingTo.photo && <Camera size={13} className="shrink-0" />}
                <span className="truncate">{replyingTo.text ?? (replyingTo.photo ? 'Foto' : '')}</span>
              </div>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="rounded-full p-1.5 text-ink-soft hover:bg-cream" aria-label="Cancelar resposta">
              <X size={16} />
            </button>
          </div>
        )}
        {emojiOpen && (
          <div className="mx-1 mb-1.5 grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl border border-sand bg-white p-2 shadow-soft sm:grid-cols-12" aria-label="Emojis">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                // não tira o foco do campo de texto
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => insertEmoji(emoji)}
                className="flex aspect-square items-center justify-center rounded-lg text-2xl leading-none hover:bg-terra-pale active:scale-90"
                aria-label={`Inserir ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1">
          <PhotoCapture variant="icon" />
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setEmojiOpen((v) => !v)}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full transition ${emojiOpen ? 'bg-terra-pale text-terra-dark' : 'text-terra hover:bg-cream-dark'}`}
            aria-label={emojiOpen ? 'Fechar emojis' : 'Abrir emojis'}
            aria-expanded={emojiOpen}
          >
            <Smile size={22} />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              if (e.target.value) emitTyping();
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKey}
            placeholder="Mensagem para a galera… (@ marca alguém)"
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
  meId,
  names,
  highlight,
  onJump,
  onOpenPhoto,
  onImageLoad,
}: {
  message: Message;
  mine: boolean;
  meId: string | undefined;
  /** Pessoas marcadas nesta mensagem */
  names: { id: string; name: string }[];
  /** Pisca o balão (ao chegar nele por uma citação) */
  highlight: boolean;
  onJump: (id: number) => void;
  onOpenPhoto: (id: string) => void;
  onImageLoad: () => void;
}) {
  const mentionsMe = !mine && !!meId && (message.mentions ?? []).includes(meId);
  const base = mine ? 'bg-terra-dark text-cream rounded-br-md' : 'bg-white text-ink rounded-bl-md border border-sand';
  return (
    // Com foto, o balão tem largura fixa e a foto ocupa tudo: a legenda quebra dentro dessa largura,
    // em vez de alargar o balão e deixar um vazio ao lado da foto.
    <div
      className={`overflow-hidden rounded-2xl shadow-soft transition-shadow ${base} ${message.pending ? 'opacity-70' : ''} ${message.photo ? 'w-[300px] max-w-full' : ''} ${
        highlight ? 'ring-4 ring-gold' : mentionsMe ? 'ring-2 ring-gold' : ''
      }`}
    >
      {message.replyTo && <ReplyQuote reply={message.replyTo} mine={mine} meId={meId} onJump={onJump} />}
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
      {message.text && (
        <p className="px-3.5 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap">{renderText(message.text, names, meId, mine)}</p>
      )}
    </div>
  );
}

/** Citação da mensagem respondida, no topo do balão. Tocar leva até a mensagem original. */
function ReplyQuote({ reply, mine, meId, onJump }: { reply: ReplyPreview; mine: boolean; meId: string | undefined; onJump: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onJump(reply.id)}
      className={`m-1.5 mb-0 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-xl border-l-4 px-2.5 py-1.5 text-left ${
        mine ? 'border-cream/70 bg-white/15' : 'border-terra bg-terra-pale'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-xs font-bold ${mine ? 'text-cream' : 'text-terra-dark'}`}>
          {reply.guestId === meId ? 'Você' : reply.guestName}
        </span>
        <span className={`flex items-center gap-1 text-xs ${mine ? 'text-cream/80' : 'text-ink-soft'}`}>
          {reply.thumbUrl && <Camera size={12} className="shrink-0" />}
          <span className="truncate">{reply.deleted ? 'Mensagem apagada' : (reply.text ?? (reply.thumbUrl ? 'Foto' : ''))}</span>
        </span>
      </span>
      {reply.thumbUrl && <img src={reply.thumbUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />}
    </button>
  );
}
