'use client';

import { useRef, useState } from 'react';
import { Download, ExternalLink, Play, Video, X } from 'lucide-react';
import styles from './video-lessons.module.css';

const FOLDER = 'https://drive.google.com/drive/folders/18V6DGPtssCl-rzh0gzBNQLf8PhIAb84i?usp=sharing';
// Public files checked in the owner's shared folder on 15/10/2026.
// Keep identifiers explicit: no Drive credentials or private account data are needed.
const LESSONS = [
  { number: '01', id: '1TTiCwtiliGwLLJ5oCCtrpi02jal66bAx', size: '211,7 MB' },
  { number: '02', id: '1KFC741BWA4TPxiH_xQEYif66Uji8a1-2', size: '262,8 MB' },
  { number: '03', id: '1eqBpIdHW60IrrYmD2B2xilHknHqThZ4Z', size: '246,5 MB' },
  { number: '04', id: '1eB4wKnIkm9HXRC_0RRbdSTa7VqJX8jmM', size: '195,3 MB' },
  { number: '05', id: '18tywQu1vJecpS19l5keQWpTkhnofySC3', size: '146,6 MB' },
  { number: '06', id: '15UL5fXJnCOjgQvVIHOHdthqMvZ2OR7S4', size: '218,9 MB' },
  { number: '07', id: '105F821WM_iIASiZBL842IQ4ijO4ZKooA', size: '152,4 MB' },
] as const;

type Lesson = (typeof LESSONS)[number];
const viewUrl = (lesson: Lesson) => `https://drive.google.com/file/d/${lesson.id}/view`;

export function VideoLessons() {
  const [selected, setSelected] = useState<Lesson | null>(null);
  const playerTitle = useRef<HTMLHeadingElement>(null);

  function watch(lesson: Lesson) {
    setSelected(lesson);
    // Focus after React mounts the player, including when changing lessons.
    requestAnimationFrame(() => {
      playerTitle.current?.focus({ preventScroll: true });
      playerTitle.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  return <div className={styles.library}>
    <section className={styles.intro} aria-labelledby="video-lessons-title">
      <div><span className={styles.eyebrow}><Video size={17} aria-hidden="true" /> Aprenda a usar o OrçaPro</span>
        <h2 id="video-lessons-title">Vídeo-aulas do sistema</h2>
        <p>Assista às demonstrações e acompanhe o passo a passo. Você também pode baixar as aulas para consultar quando precisar.</p>
        <span className={styles.count}>{LESSONS.length} aulas disponíveis · formato MP4</span>
      </div>
      <a className={styles.folderLink} href={FOLDER} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" /> Abrir pasta no Google Drive</a>
    </section>

    {selected ? <section className={styles.player} aria-labelledby="current-video-title">
      <div className={styles.playerHeader}>
        <h2 id="current-video-title" ref={playerTitle} tabIndex={-1}>Vídeo-aula {selected.number}</h2>
        <button type="button" onClick={() => setSelected(null)} aria-label="Fechar vídeo"><X size={18} aria-hidden="true" /> Fechar</button>
      </div>
      <iframe key={selected.id} title={`Assistir à vídeo-aula ${selected.number} do OrçaPro`} src={`https://drive.google.com/file/d/${selected.id}/preview`} allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" />
      <p>Se o player não carregar, <a href={viewUrl(selected)} target="_blank" rel="noopener noreferrer">assista diretamente no Google Drive <ExternalLink size={13} aria-hidden="true" /></a>.</p>
    </section> : null}

    <div className={styles.grid} aria-label="Aulas disponíveis">
      {LESSONS.map(lesson => <article key={lesson.id} className={styles.card}>
        <button type="button" className={styles.cover} onClick={() => watch(lesson)} aria-label={`Assistir à vídeo-aula ${lesson.number}`}>
          <span>ORÇAPRO · VÍDEO-AULAS</span><span className={styles.coverNumber}>{lesson.number}</span><span className={styles.play}><Play size={23} fill="currentColor" aria-hidden="true" /></span>
        </button>
        <div className={styles.cardBody}><h3>Vídeo-aula {lesson.number}</h3><p>OrçaPro · MP4 · {lesson.size}</p>
          <div className={styles.actions}><button type="button" onClick={() => watch(lesson)}><Play size={15} aria-hidden="true" /> Assistir</button>
            <a href={`https://drive.google.com/uc?export=download&id=${lesson.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Baixar vídeo-aula ${lesson.number} (${lesson.size})`}><Download size={15} aria-hidden="true" /> Baixar</a>
          </div>
        </div>
      </article>)}
    </div>
    <p className={styles.help}>Os vídeos são disponibilizados pelo Google Drive. Para arquivos grandes, o Google pode solicitar uma confirmação antes do download. Consulte a pasta para ver novas aulas adicionadas.</p>
  </div>;
}
