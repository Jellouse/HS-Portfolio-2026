import React, {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { typePx } from './type-scale';

type Asset = {
  data: Uint8Array;
  filename: string;
  extension: string;
};

type ModalState = { idx: number; isNew: boolean } | null;

function mimeFor(extension: string) {
  const ext = extension.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function getInitialValue(schema: any): any {
  switch (schema?.kind) {
    case 'form':
      return schema.defaultValue();
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const key of Object.keys(schema.fields)) {
        obj[key] = getInitialValue(schema.fields[key]);
      }
      return obj;
    }
    case 'array':
      return [];
    case 'conditional': {
      const discriminant = schema.discriminant.defaultValue();
      return {
        discriminant,
        value: getInitialValue(schema.values[String(discriminant)]),
      };
    }
    case 'child':
      return null;
    default:
      return undefined;
  }
}

function useAssetUrl(asset: Asset | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const data = asset?.data;
  const extension = asset?.extension;

  useEffect(() => {
    if (!data) {
      setUrl(null);
      return;
    }
    const blob = new Blob(
      [
        data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength,
        ) as ArrayBuffer,
      ],
      { type: mimeFor(extension || 'jpg') },
    );
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data, extension]);

  return url;
}

function Thumb({
  asset,
  style,
}: {
  asset: Asset | null | undefined;
  style?: CSSProperties;
}) {
  const url = useAssetUrl(asset);
  if (!url) {
    return (
      <div
        style={{
          ...thumbEmpty,
          ...style,
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        ...thumbImg,
        ...style,
      }}
    />
  );
}

function VideoThumb({
  src,
  poster,
  style,
}: {
  src: unknown;
  poster?: Asset | null | undefined;
  style?: CSSProperties;
}) {
  const posterUrl = useAssetUrl(poster);
  const url = typeof src === 'string' && src.trim() ? src.trim() : null;

  if (!url) {
    return <Thumb asset={poster} style={style} />;
  }

  return (
    <video
      src={url}
      poster={posterUrl || undefined}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      draggable={false}
      style={{
        ...thumbImg,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}

function blockKindLabel(props: any, discriminant: string) {
  const options = props.schema?.element?.discriminant?.options as
    | { label: string; value: string }[]
    | undefined;
  return options?.find((o) => o.value === discriminant)?.label || discriminant;
}

function BlockPreview({
  element,
  kindLabel,
}: {
  element: any;
  kindLabel: string;
}) {
  const kind = String(element.discriminant);
  const fields = element.value?.fields;

  if (kind === 'image') {
    return (
      <div style={tileMedia}>
        <Thumb asset={fields?.src?.value} />
        <span style={tileBadge}>{kindLabel}</span>
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div style={tileMedia}>
        <VideoThumb src={fields?.src?.value} poster={fields?.poster?.value} />
        <span style={tileBadge}>{kindLabel}</span>
      </div>
    );
  }

  if (kind === 'pair') {
    return (
      <div style={tileMedia}>
        <div style={pairGrid}>
          <Thumb asset={fields?.left?.value} />
          <Thumb asset={fields?.right?.value} />
        </div>
        <span style={tileBadge}>{kindLabel}</span>
      </div>
    );
  }

  if (kind === 'process') {
    const photos = (fields?.images?.elements || []).slice(0, 4);
    return (
      <div style={tileMedia}>
        <div style={processGrid}>
          {photos.length
            ? photos.map((photo: any) => (
                <Thumb key={photo.key} asset={photo.fields?.src?.value} />
              ))
            : null}
        </div>
        <span style={tileBadge}>{kindLabel}</span>
      </div>
    );
  }

  const heading = fields?.heading?.value;
  const text = fields?.text?.value;
  const snippet =
    (typeof heading === 'string' && heading.trim()) ||
    (typeof text === 'string' && text.trim().slice(0, 72)) ||
    kindLabel;

  return (
    <div style={tileText}>
      <span style={tileBadge}>{kindLabel}</span>
      <p style={tileTextBody}>{snippet}</p>
    </div>
  );
}

function RenderPreview({ field }: { field: any }) {
  const schema = field?.schema;
  if (!schema) return null;

  if (schema.kind === 'form') {
    const Input = schema.Input;
    if (!Input) return null;
    return <Input {...field} />;
  }

  if (schema.kind === 'object') {
    return (
      <div style={stack}>
        {schema.label ? <div style={sectionLabel}>{schema.label}</div> : null}
        {schema.description ? (
          <div style={sectionDesc}>{schema.description}</div>
        ) : null}
        {Object.entries(field.fields || {}).map(([key, child]) => (
          <RenderPreview key={key} field={child} />
        ))}
      </div>
    );
  }

  if (schema.kind === 'array') {
    return <NestedArrayEditor {...field} />;
  }

  if (schema.kind === 'conditional') {
    const DiscriminantInput = schema.discriminant.Input;
    return (
      <div style={stack}>
        {DiscriminantInput ? (
          <DiscriminantInput
            {...field}
            value={field.discriminant}
            onChange={(next: string | boolean) => field.onChange(next)}
            schema={schema.discriminant}
          />
        ) : null}
        <RenderPreview field={field.value} />
      </div>
    );
  }

  return null;
}

function NestedArrayEditor(props: any) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [pendingNew, setPendingNew] = useState(false);

  useEffect(() => {
    if (!pendingNew) return;
    if (props.elements.length === 0) return;
    setOpenIdx(props.elements.length - 1);
    setPendingNew(false);
  }, [pendingNew, props.elements.length]);

  const add = () => {
    props.onChange([
      ...props.elements.map((el: any) => ({ key: el.key })),
      { key: undefined, value: getInitialValue(props.schema.element) },
    ]);
    setPendingNew(true);
  };

  const remove = (key: string) => {
    props.onChange(
      props.elements
        .filter((el: any) => el.key !== key)
        .map((el: any) => ({ key: el.key })),
    );
    setOpenIdx(null);
  };

  return (
    <div style={stack}>
      {props.schema.label ? (
        <div style={sectionLabel}>{props.schema.label}</div>
      ) : null}
      {props.schema.description ? (
        <div style={sectionDesc}>{props.schema.description}</div>
      ) : null}
      <div style={nestedList}>
        {props.elements.map((el: any, idx: number) => {
          const label =
            props.schema.itemLabel?.(el) ||
            el.fields?.alt?.value ||
            `Item ${idx + 1}`;
          const open = openIdx === idx;
          return (
            <div key={el.key} style={nestedItem}>
              <div style={nestedRow}>
                <button
                  type="button"
                  style={nestedOpenBtn}
                  onClick={() => setOpenIdx(open ? null : idx)}
                >
                  <Thumb
                    asset={el.fields?.src?.value}
                    style={{ width: 40, height: 40, borderRadius: 4 }}
                  />
                  <span>{label}</span>
                </button>
                <button
                  type="button"
                  style={dangerBtn}
                  onClick={() => remove(el.key)}
                >
                  Delete
                </button>
              </div>
              {open ? (
                <div style={nestedBody}>
                  <RenderPreview field={el} />
                  <button
                    type="button"
                    style={secondaryBtn}
                    onClick={() => setOpenIdx(null)}
                  >
                    Done
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <button type="button" style={secondaryBtn} onClick={add}>
        Add
      </button>
    </div>
  );
}

function BlocksGalleryInput(props: any) {
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingNew, setPendingNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = (props.schema?.element?.discriminant?.options || []) as {
    label: string;
    value: string;
  }[];

  useEffect(() => {
    if (!pendingNew) return;
    if (props.elements.length === 0) return;
    setModal({ idx: props.elements.length - 1, isNew: true });
    setPendingNew(false);
  }, [pendingNew, props.elements.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [menuOpen]);

  const add = (kind: string) => {
    setMenuOpen(false);
    const schema = props.schema.element.values[String(kind)];
    props.onChange([
      ...props.elements.map((el: any) => ({ key: el.key })),
      {
        key: undefined,
        value: {
          discriminant: kind,
          value: getInitialValue(schema),
        },
      },
    ]);
    setPendingNew(true);
  };

  const closeModal = (cancel: boolean) => {
    if (cancel && modal?.isNew) {
      const idx = modal.idx;
      props.onChange(
        props.elements
          .filter((_: any, i: number) => i !== idx)
          .map((el: any) => ({ key: el.key })),
      );
    }
    setModal(null);
  };

  const remove = (key: string) => {
    props.onChange(
      props.elements
        .filter((el: any) => el.key !== key)
        .map((el: any) => ({ key: el.key })),
    );
  };

  const move = (fromKey: string, toKey: string, place: 'before' | 'after') => {
    if (fromKey === toKey) return;
    const keys = props.elements.map((el: any) => el.key as string);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const next = keys.filter((k: string) => k !== fromKey);
    const insertAt = next.indexOf(toKey) + (place === 'after' ? 1 : 0);
    next.splice(insertAt, 0, fromKey);
    props.onChange(next.map((key: string) => ({ key })));
  };

  const editing = modal && props.elements[modal.idx];
  const editingLabel = editing
    ? blockKindLabel(props, String(editing.discriminant))
    : '';

  const required =
    (props.schema?.validation?.length?.min ?? 0) > 0 ? true : false;

  return (
    <div style={root} role="group">
      <div style={labelRow}>
        <span style={labelText}>
          {props.schema.label}
          {required ? ' *' : ''}
        </span>
      </div>
      {props.schema.description ? (
        <div style={sectionDesc}>{props.schema.description}</div>
      ) : null}

      <div ref={menuRef} style={{ position: 'relative', alignSelf: 'start' }}>
        <button
          type="button"
          style={primaryBtn}
          onClick={() => setMenuOpen((v) => !v)}
        >
          Add
        </button>
        {menuOpen ? (
          <div style={menu}>
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                style={menuItem}
                onClick={() => add(String(opt.value))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {props.elements.length === 0 ? (
        <div style={empty}>
          <div style={emptyTitle}>Empty list</div>
          <div style={sectionDesc}>Add the first block to see it here.</div>
        </div>
      ) : (
        <div style={grid}>
          {props.elements.map((el: any, idx: number) => {
            const kindLabel = blockKindLabel(props, String(el.discriminant));
            return (
              <div
                key={el.key}
                style={{
                  ...tile,
                  opacity: dragKey === el.key ? 0.55 : 1,
                }}
                draggable
                onDragStart={() => setDragKey(el.key)}
                onDragEnd={() => setDragKey(null)}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragKey) return;
                  const rect = (
                    event.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  const before = event.clientX < rect.left + rect.width / 2;
                  move(dragKey, el.key, before ? 'before' : 'after');
                  setDragKey(null);
                }}
              >
                <button
                  type="button"
                  style={tileHit}
                  onClick={() => setModal({ idx, isNew: false })}
                  aria-label={`Edit ${kindLabel}`}
                >
                  <BlockPreview element={el} kindLabel={kindLabel} />
                </button>
                <button
                  type="button"
                  style={tileDelete}
                  onClick={() => remove(el.key)}
                  aria-label={`Delete ${kindLabel}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing ? (
        <div style={overlay} role="presentation" onMouseDown={() => closeModal(!!modal?.isNew)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${modal?.isNew ? 'Add' : 'Edit'} ${editingLabel}`}
            style={dialog}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div style={dialogHead}>
              <h2 style={dialogTitle}>
                {modal?.isNew ? 'Add' : 'Edit'} {editingLabel}
              </h2>
              <button
                type="button"
                style={iconBtn}
                onClick={() => closeModal(!!modal?.isNew)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={dialogBody}>
              <RenderPreview field={editing.value} />
            </div>
            <div style={dialogFoot}>
              {modal?.isNew ? (
                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={() => closeModal(true)}
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                style={primaryBtn}
                onClick={() => closeModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function withBlocksGallery<T extends { Input?: (props: any) => ReactNode }>(
  field: T,
): T {
  return { ...field, Input: BlocksGalleryInput };
}

const root: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
};

const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minWidth: 0,
};

const labelRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
};

const labelText: CSSProperties = {
  fontSize: typePx('text-ui'),
  lineHeight: `${typePx('lh-ui')}px`,
  fontWeight: 600,
  color: 'var(--kui-color-foreground-neutral, #111)',
};

const sectionLabel: CSSProperties = {
  fontSize: typePx('text-ui'),
  lineHeight: `${typePx('lh-ui')}px`,
  fontWeight: 600,
  color: 'var(--kui-color-foreground-neutral, #111)',
};

const sectionDesc: CSSProperties = {
  fontSize: typePx('text-meta'),
  lineHeight: `${typePx('lh-meta')}px`,
  color: 'var(--kui-color-foreground-neutral-secondary, #666)',
};

const primaryBtn: CSSProperties = {
  font: 'inherit',
  fontSize: typePx('text-meta'),
  lineHeight: `${typePx('lh-meta')}px`,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--kui-color-background-accent-emphasis, #111)',
  background: 'var(--kui-color-background-accent-emphasis, #111)',
  color: 'var(--kui-color-foreground-on-emphasis, #fff)',
  cursor: 'pointer',
};

const secondaryBtn: CSSProperties = {
  ...primaryBtn,
  background: 'var(--kui-color-background-surface, #fff)',
  color: 'var(--kui-color-foreground-neutral, #111)',
  border: '1px solid var(--kui-color-border-neutral, #ccc)',
  alignSelf: 'start',
};

const dangerBtn: CSSProperties = {
  ...secondaryBtn,
  borderColor: 'var(--kui-color-border-neutral, #ccc)',
  color: 'var(--kui-color-foreground-critical, #b00020)',
};

const iconBtn: CSSProperties = {
  font: 'inherit',
  fontSize: 22,
  lineHeight: '22px',
  width: 32,
  height: 32,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--kui-color-foreground-neutral, #111)',
};

const menu: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  minWidth: 160,
  background: 'var(--kui-color-background-surface, #fff)',
  border: '1px solid var(--kui-color-border-neutral, #ccc)',
  borderRadius: 8,
  boxShadow: '0 8px 24px var(--kui-color-shadow-muted, rgba(0,0,0,0.12))',
  zIndex: 20,
  overflow: 'hidden',
};

const menuItem: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  font: 'inherit',
  fontSize: typePx('text-meta'),
  lineHeight: `${typePx('lh-meta')}px`,
  padding: '10px 12px',
  border: 0,
  background: 'var(--kui-color-background-surface, #fff)',
  color: 'var(--kui-color-foreground-neutral, #111)',
  cursor: 'pointer',
};

const empty: CSSProperties = {
  border: '1px dashed var(--kui-color-border-neutral, #ccc)',
  borderRadius: 8,
  padding: 20,
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'center',
};

const emptyTitle: CSSProperties = {
  fontSize: typePx('text-ui'),
  lineHeight: `${typePx('lh-ui')}px`,
  fontWeight: 600,
  color: 'var(--kui-color-foreground-neutral-secondary, #444)',
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 12,
};

const tile: CSSProperties = {
  position: 'relative',
  border: '1px solid var(--kui-color-border-muted, #e5e5e5)',
  borderRadius: 8,
  overflow: 'hidden',
  background: 'var(--kui-color-background-surface-secondary, #f5f5f5)',
  aspectRatio: '1 / 1',
};

const tileHit: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
};

const tileDelete: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 24,
  height: 24,
  borderRadius: 999,
  border: '1px solid var(--kui-color-border-neutral, #ccc)',
  background: 'var(--kui-color-background-surface, rgba(255,255,255,0.92))',
  color: 'var(--kui-color-foreground-neutral, #111)',
  font: 'inherit',
  fontSize: 16,
  lineHeight: '16px',
  cursor: 'pointer',
  zIndex: 2,
};

const tileMedia: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
};

const tileBadge: CSSProperties = {
  position: 'absolute',
  left: 6,
  bottom: 6,
  padding: '2px 6px',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.65)',
  color: '#fff',
  fontSize: typePx('text-meta'),
  lineHeight: `${typePx('lh-meta')}px`,
};

const tileText: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  padding: 12,
  boxSizing: 'border-box',
  background: 'var(--kui-color-background-surface-secondary, #f2f2f2)',
};

const tileTextBody: CSSProperties = {
  margin: 0,
  fontSize: typePx('text-meta'),
  lineHeight: `${typePx('lh-meta')}px`,
  color: 'var(--kui-color-foreground-neutral, #111)',
  display: '-webkit-box',
  WebkitLineClamp: 5,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const thumbImg: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const thumbEmpty: CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'var(--kui-color-background-surface-tertiary, #e5e5e5)',
};

const pairGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  width: '100%',
  height: '100%',
  gap: 4,
};

const processGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr 1fr',
  width: '100%',
  height: '100%',
  gap: 4,
};

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--kui-color-alias-blanket, rgba(0,0,0,0.4))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 1000,
};

const dialog: CSSProperties = {
  width: 'min(640px, 100%)',
  maxHeight: 'min(840px, 90vh)',
  background: 'var(--kui-color-background-surface, #fff)',
  color: 'var(--kui-color-foreground-neutral, #111)',
  borderRadius: 8,
  border: '1px solid var(--kui-color-border-muted, transparent)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 16px 48px var(--kui-color-shadow-regular, rgba(0,0,0,0.2))',
};

const dialogHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '16px 20px',
  borderBottom: '1px solid var(--kui-color-border-muted, #eee)',
};

const dialogTitle: CSSProperties = {
  margin: 0,
  fontSize: typePx('text-ui'),
  lineHeight: `${typePx('lh-ui')}px`,
  fontWeight: 600,
  color: 'var(--kui-color-foreground-neutral, #111)',
};

const dialogBody: CSSProperties = {
  padding: 20,
  overflow: 'auto',
  flex: 1,
  minHeight: 0,
};

const dialogFoot: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 20px',
  borderTop: '1px solid var(--kui-color-border-muted, #eee)',
};

const nestedList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const nestedItem: CSSProperties = {
  border: '1px solid var(--kui-color-border-muted, #e5e5e5)',
  borderRadius: 8,
  overflow: 'hidden',
};

const nestedRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 8,
};

const nestedOpenBtn: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  font: 'inherit',
  fontSize: typePx('text-meta'),
  lineHeight: `${typePx('lh-meta')}px`,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--kui-color-foreground-neutral, #111)',
  cursor: 'pointer',
  textAlign: 'left',
};

const nestedBody: CSSProperties = {
  padding: 12,
  borderTop: '1px solid var(--kui-color-border-muted, #eee)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};
